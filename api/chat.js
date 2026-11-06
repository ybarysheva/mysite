// Visitor side of the chat.
//
// GET  /api/chat?id=&token=&since=   Yana's status (+ new messages in this conversation)
// POST /api/chat                     { text?, email?, id?, token?, question?, website? }
//      - no id: starts a new conversation (returns id + token to keep in localStorage)
//      - text: adds a message and pings Yana's phone
//      - email: saves "let me know when Yana replies" contact
//      - website: honeypot, real people never fill it in

import {
  json, readBody, configured, db, getStatus, getConv, getMessages, addMessage,
  cleanText, cleanEmail, safeEqual, randomId, rateLimited, notifyOwner, now, MAX_MESSAGES,
} from "./_lib.js";

async function authedConv(id, token) {
  const conv = await getConv(id);
  return conv && typeof token === "string" && safeEqual(conv.token, token) ? conv : null;
}

export async function GET(request) {
  if (!configured()) return json({ error: "not configured" }, 503);
  const url = new URL(request.url);
  const status = await getStatus();
  const id = url.searchParams.get("id");
  if (!id) return json({ status });

  const conv = await authedConv(id, url.searchParams.get("token"));
  if (!conv) return json({ status, gone: true });

  const since = Math.max(0, parseInt(url.searchParams.get("since"), 10) || 0);
  return json({
    status,
    question: conv.question || null,
    email: conv.email || null,
    messages: await getMessages(id, since),
  });
}

export async function POST(request) {
  if (!configured()) return json({ error: "not configured" }, 503);
  const body = await readBody(request);
  if (!body) return json({ error: "bad request" }, 400);

  // Honeypot: pretend it worked.
  if (body.website) return json({ ok: true });

  if (await rateLimited(request, "chat-min", 8, 60)) return json({ error: "slow down a little" }, 429);
  if (await rateLimited(request, "chat-hour", 60, 3600)) return json({ error: "slow down a little" }, 429);

  const text = cleanText(body.text);
  const email = cleanEmail(body.email);
  if (!text && !email) return json({ error: "empty" }, 400);
  if (body.email && !email) return json({ error: "that email doesn't look right" }, 400);

  const r = db();
  let { id, token } = body;
  let conv = id ? await authedConv(id, token) : null;

  if (!conv) {
    if (!text) return json({ error: "say something first" }, 400);
    id = randomId();
    token = randomId(18);
    const t = String(now());
    await r.hset(`conv:${id}`, {
      token,
      question: cleanText(body.question).slice(0, 200),
      createdAt: t,
      updatedAt: t,
      unread: "0",
    });
    conv = await getConv(id);
  }

  if (email) await r.hset(`conv:${id}`, { email });

  let message = null;
  if (text) {
    if (Number(await r.llen(`msgs:${id}`)) >= MAX_MESSAGES) {
      return json({ error: "this conversation is full. try email instead" }, 400);
    }
    // Blocked conversations look normal to the visitor but go nowhere.
    if (conv.blocked === "1") {
      message = { n: -1, from: "visitor", text, at: now() };
    } else {
      message = await addMessage(id, "visitor", text);
      await notifyOwner(request, {
        title: "new message on your site",
        body: text.length > 120 ? text.slice(0, 117) + "..." : text,
        url: `/inbox/#c=${id}`,
        tag: id,
      });
    }
  } else if (conv.blocked !== "1") {
    await notifyOwner(request, {
      title: "someone left their email",
      body: email,
      url: `/inbox/#c=${id}`,
      tag: id,
    });
  }

  return json({ ok: true, id, token, message, status: await getStatus() });
}
