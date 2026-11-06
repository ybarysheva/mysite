// Yana's side of the chat (used by /inbox). Everything except login needs the session cookie.
//
// GET  /api/inbox?view=me                 { loggedIn, status }
// GET  /api/inbox?view=list               conversations, newest first
// GET  /api/inbox?view=conv&id=           one conversation (marks it read)
// GET  /api/inbox?view=vapid              public key for push notifications
// POST /api/inbox  { action: "login", password }
//                  { action: "logout" }
//                  { action: "reply", id, text }
//                  { action: "status", state: "around" | "away" }
//                  { action: "subscribe", subscription }
//                  { action: "delete", id }
//                  { action: "block", id }

import {
  json, readBody, configured, db, getStatus, getConv, getMessages, addMessage, deleteConv,
  cleanText, safeEqual, rateLimited, isOwner, sessionCookie, clearCookie, vapidKeys, now,
} from "./_lib.js";

const unauthorized = () => json({ error: "log in first" }, 401);

export async function GET(request) {
  if (!configured()) return json({ error: "not configured" }, 503);
  const url = new URL(request.url);
  const view = url.searchParams.get("view");
  const owner = isOwner(request);

  if (view === "me") return json({ loggedIn: owner, status: await getStatus() });
  if (!owner) return unauthorized();

  const r = db();

  if (view === "list") {
    const ids = (await r.zrange("convs", 0, 99, { rev: true })) || [];
    const convs = [];
    for (const id of ids) {
      const c = await getConv(id);
      if (!c) continue;
      convs.push({
        id,
        question: c.question || null,
        email: c.email || null,
        lastText: c.lastText || "",
        lastFrom: c.lastFrom || "visitor",
        updatedAt: Number(c.updatedAt) || 0,
        unread: Number(c.unread) || 0,
        blocked: c.blocked === "1",
      });
    }
    return json({ status: await getStatus(), convs });
  }

  if (view === "conv") {
    const id = url.searchParams.get("id");
    const c = await getConv(id);
    if (!c) return json({ error: "not found" }, 404);
    await r.hset(`conv:${id}`, { unread: "0" });
    return json({
      id,
      question: c.question || null,
      email: c.email || null,
      blocked: c.blocked === "1",
      createdAt: Number(c.createdAt) || 0,
      messages: await getMessages(id, 0),
    });
  }

  if (view === "vapid") return json({ publicKey: (await vapidKeys()).publicKey });

  return json({ error: "unknown view" }, 400);
}

export async function POST(request) {
  if (!configured()) return json({ error: "not configured" }, 503);
  const body = await readBody(request);
  if (!body) return json({ error: "bad request" }, 400);
  const r = db();

  if (body.action === "login") {
    if (await rateLimited(request, "login", 10, 900)) return json({ error: "too many tries, wait a bit" }, 429);
    if (typeof body.password !== "string" || !safeEqual(body.password, process.env.INBOX_PASSWORD)) {
      return json({ error: "wrong password" }, 401);
    }
    return json({ ok: true }, 200, { "Set-Cookie": sessionCookie() });
  }

  if (body.action === "logout") return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });

  if (!isOwner(request)) return unauthorized();

  switch (body.action) {
    case "reply": {
      const text = cleanText(body.text);
      if (!text) return json({ error: "empty" }, 400);
      if (!(await getConv(body.id))) return json({ error: "not found" }, 404);
      const message = await addMessage(body.id, "yana", text);
      await r.hset(`conv:${body.id}`, { unread: "0" });
      return json({ ok: true, message });
    }
    case "status": {
      const state = body.state === "around" ? "around" : "away";
      await r.set("status", JSON.stringify({ state, at: now() }));
      return json({ ok: true, status: state });
    }
    case "subscribe": {
      const s = body.subscription;
      if (!s || typeof s.endpoint !== "string" || !s.keys || !s.keys.p256dh || !s.keys.auth) {
        return json({ error: "bad subscription" }, 400);
      }
      await r.hset("push:subs", { [s.endpoint]: JSON.stringify({ endpoint: s.endpoint, keys: s.keys }) });
      return json({ ok: true });
    }
    case "delete": {
      if (!(await getConv(body.id))) return json({ error: "not found" }, 404);
      await deleteConv(body.id);
      return json({ ok: true });
    }
    case "block": {
      if (!(await getConv(body.id))) return json({ error: "not found" }, 404);
      await r.hset(`conv:${body.id}`, { blocked: "1" });
      return json({ ok: true });
    }
    default:
      return json({ error: "unknown action" }, 400);
  }
}
