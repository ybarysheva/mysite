// Run with: npm test
// Exercises the chat API with an in-memory Redis and a fake push sender.

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { FakeRedis } from "./fake-redis.mjs";

const pushes = [];
globalThis.__testWebPush = {
  generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
  sendNotification: async (sub, payload) => {
    if (sub.endpoint.includes("gone")) { const e = new Error("gone"); e.statusCode = 410; throw e; }
    pushes.push({ sub, payload: JSON.parse(payload) });
  },
};
process.env.INBOX_PASSWORD = "hunter2";

const chat = await import("../api/chat.js");
const inbox = await import("../api/inbox.js");

let ipCounter = 0;
const req = (method, path, body, { cookie, ip } = {}) =>
  new Request("https://yana.test" + path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip || `10.0.0.${++ipCounter % 250}`,
      host: "yana.test",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const call = async (fn, ...args) => { const r = await fn(req(...args)); return { status: r.status, body: await r.json(), headers: r.headers }; };

async function login() {
  const r = await call(inbox.POST, "POST", "/api/inbox", { action: "login", password: "hunter2" });
  return r.headers.get("set-cookie").split(";")[0];
}

beforeEach(() => { globalThis.__testRedis = new FakeRedis(); pushes.length = 0; });

test("not configured without storage", async () => {
  globalThis.__testRedis = undefined;
  const saved = { ...process.env };
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.KV_REST_API_URL;
  const r = await call(chat.GET, "GET", "/api/chat");
  assert.equal(r.status, 503);
  Object.assign(process.env, saved);
});

test("status defaults to away", async () => {
  const r = await call(chat.GET, "GET", "/api/chat");
  assert.deepEqual(r.body, { status: "away" });
});

test("visitor message → stored, pushed to Yana, visible in inbox; reply reaches visitor", async () => {
  const cookie = await login();
  await call(inbox.POST, "POST", "/api/inbox", { action: "subscribe", subscription: { endpoint: "https://push/a", keys: { p256dh: "x", auth: "y" } } }, { cookie });

  const s = await call(chat.POST, "POST", "/api/chat", { text: "a whole couch", question: "best street find?" });
  assert.equal(s.status, 200);
  assert.ok(s.body.id && s.body.token);
  assert.equal(pushes.length, 1);
  assert.equal(pushes[0].payload.body, "a whole couch");
  assert.equal(pushes[0].payload.url, `/inbox/#c=${s.body.id}`);

  const list = await call(inbox.GET, "GET", "/api/inbox?view=list", null, { cookie });
  assert.equal(list.body.convs.length, 1);
  assert.equal(list.body.convs[0].unread, 1);
  assert.equal(list.body.convs[0].question, "best street find?");

  const conv = await call(inbox.GET, "GET", `/api/inbox?view=conv&id=${s.body.id}`, null, { cookie });
  assert.equal(conv.body.messages[0].text, "a whole couch");
  const list2 = await call(inbox.GET, "GET", "/api/inbox?view=list", null, { cookie });
  assert.equal(list2.body.convs[0].unread, 0, "opening marks read");

  await call(inbox.POST, "POST", "/api/inbox", { action: "reply", id: s.body.id, text: "iconic" }, { cookie });
  const poll = await call(chat.GET, "GET", `/api/chat?id=${s.body.id}&token=${s.body.token}&since=1`);
  assert.deepEqual(poll.body.messages.map((m) => [m.n, m.from, m.text]), [[1, "yana", "iconic"]]);

  const all = await call(chat.GET, "GET", `/api/chat?id=${s.body.id}&token=${s.body.token}`);
  assert.equal(all.body.messages.length, 2);
  assert.equal(all.body.question, "best street find?");
});

test("wrong token can't read or post into a conversation", async () => {
  const s = await call(chat.POST, "POST", "/api/chat", { text: "hi" });
  const r = await call(chat.GET, "GET", `/api/chat?id=${s.body.id}&token=nope`);
  assert.equal(r.body.gone, true);
  assert.equal(r.body.messages, undefined);
  const p = await call(chat.POST, "POST", "/api/chat", { id: s.body.id, token: "nope", text: "sneaky" });
  assert.notEqual(p.body.id, s.body.id, "starts a fresh conversation instead");
});

test("email can be added later; bad email rejected", async () => {
  const s = await call(chat.POST, "POST", "/api/chat", { text: "hi" });
  const bad = await call(chat.POST, "POST", "/api/chat", { id: s.body.id, token: s.body.token, email: "nope" });
  assert.equal(bad.status, 400);
  const ok = await call(chat.POST, "POST", "/api/chat", { id: s.body.id, token: s.body.token, email: "a@b.co" });
  assert.equal(ok.status, 200);
  const poll = await call(chat.GET, "GET", `/api/chat?id=${s.body.id}&token=${s.body.token}`);
  assert.equal(poll.body.email, "a@b.co");
});

test("honeypot, empty, and over-long messages", async () => {
  const hp = await call(chat.POST, "POST", "/api/chat", { text: "buy pills", website: "spam.com" });
  assert.equal(hp.status, 200);
  assert.equal(hp.body.id, undefined, "nothing stored");
  const empty = await call(chat.POST, "POST", "/api/chat", { text: "   " });
  assert.equal(empty.status, 400);
  const long = await call(chat.POST, "POST", "/api/chat", { text: "x".repeat(5000) });
  const poll = await call(chat.GET, "GET", `/api/chat?id=${long.body.id}&token=${long.body.token}`);
  assert.equal(poll.body.messages[0].text.length, 1000);
});

test("rate limit per IP", async () => {
  let last;
  for (let i = 0; i < 9; i++) last = await call(chat.POST, "POST", "/api/chat", { text: "hi " + i }, { ip: "1.2.3.4" });
  assert.equal(last.status, 429);
});

test("inbox needs login; wrong password rejected; login rate limited", async () => {
  assert.equal((await call(inbox.GET, "GET", "/api/inbox?view=list")).status, 401);
  assert.equal((await call(inbox.POST, "POST", "/api/inbox", { action: "reply", id: "x", text: "y" })).status, 401);
  assert.equal((await call(inbox.GET, "GET", "/api/inbox?view=list", null, { cookie: "inbox_session=9999999999999.forged" })).status, 401);
  let r;
  for (let i = 0; i < 11; i++) r = await call(inbox.POST, "POST", "/api/inbox", { action: "login", password: "guess" }, { ip: "9.9.9.9" });
  assert.equal(r.status, 429);
  const me = await call(inbox.GET, "GET", "/api/inbox?view=me");
  assert.equal(me.body.loggedIn, false);
});

test("around/away status", async () => {
  const cookie = await login();
  await call(inbox.POST, "POST", "/api/inbox", { action: "status", state: "around" }, { cookie });
  assert.equal((await call(chat.GET, "GET", "/api/chat")).body.status, "around");
  await call(inbox.POST, "POST", "/api/inbox", { action: "status", state: "away" }, { cookie });
  assert.equal((await call(chat.GET, "GET", "/api/chat")).body.status, "away");
});

test("block silences a conversation; delete removes it; dead push subscriptions get cleaned up", async () => {
  const cookie = await login();
  await call(inbox.POST, "POST", "/api/inbox", { action: "subscribe", subscription: { endpoint: "https://push/gone", keys: { p256dh: "x", auth: "y" } } }, { cookie });
  const s = await call(chat.POST, "POST", "/api/chat", { text: "first" });
  assert.equal(await globalThis.__testRedis.hgetall("push:subs"), null, "410 subscription removed");

  await call(inbox.POST, "POST", "/api/inbox", { action: "block", id: s.body.id }, { cookie });
  const after = await call(chat.POST, "POST", "/api/chat", { id: s.body.id, token: s.body.token, text: "more spam" });
  assert.equal(after.status, 200, "looks normal to the visitor");
  const conv = await call(inbox.GET, "GET", `/api/inbox?view=conv&id=${s.body.id}`, null, { cookie });
  assert.equal(conv.body.messages.length, 1, "blocked message not stored");

  await call(inbox.POST, "POST", "/api/inbox", { action: "delete", id: s.body.id }, { cookie });
  const list = await call(inbox.GET, "GET", "/api/inbox?view=list", null, { cookie });
  assert.equal(list.body.convs.length, 0);
});

test("vapid key is generated once and reused", async () => {
  const cookie = await login();
  const a = await call(inbox.GET, "GET", "/api/inbox?view=vapid", null, { cookie });
  const b = await call(inbox.GET, "GET", "/api/inbox?view=vapid", null, { cookie });
  assert.equal(a.body.publicKey, "PUB");
  assert.equal(b.body.publicKey, "PUB");
});
