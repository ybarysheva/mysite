// Shared helpers for the chat API. Files starting with "_" are not routes on Vercel.
//
// Storage: Upstash Redis (add it in Vercel → Storage; it sets the env vars below).
// Data layout:
//   convs                 sorted set   conversation id → last activity (ms)
//   conv:<id>             hash         token, question, email, createdAt, updatedAt,
//                                      lastText, lastFrom, unread, blocked
//   msgs:<id>             list         JSON {from: "visitor"|"yana", text, at}
//   status                string       JSON {state: "around"|"away", at}
//   push:subs             hash         endpoint → JSON push subscription (Yana's devices)
//   vapid                 hash         publicKey, privateKey (generated on first use)
//   rl:<name>:<ip>:<win>  counter      rate limiting

import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import webpushLib from "web-push";

export const MAX_TEXT = 1000;
export const MAX_MESSAGES = 200;
export const AROUND_FOR_MS = 8 * 60 * 60 * 1000; // "around" switches itself to "away" after 8h

/* ---------- clients (overridable in tests) ---------- */
let client;
export function db() {
  if (globalThis.__testRedis) return globalThis.__testRedis;
  if (client) return client;
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  client = new Redis({ url, token, automaticDeserialization: false });
  return client;
}

export function webpush() {
  return globalThis.__testWebPush || webpushLib;
}

export function configured() {
  return Boolean(db() && process.env.INBOX_PASSWORD);
}

/* ---------- responses ---------- */
export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}

export async function readBody(request) {
  try {
    const text = await request.text();
    if (text.length > 20_000) return null;
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

/* ---------- small utils ---------- */
export const now = () => Date.now();
export const randomId = (bytes = 9) => crypto.randomBytes(bytes).toString("base64url");

export function cleanText(v) {
  if (typeof v !== "string") return "";
  return v.replace(/\r\n?/g, "\n").trim().slice(0, MAX_TEXT);
}

export function cleanEmail(v) {
  if (typeof v !== "string") return "";
  const e = v.trim().slice(0, 200);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : "";
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function clientIp(request) {
  const fwd = request.headers.get("x-forwarded-for") || "";
  return fwd.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

/* ---------- rate limiting: fixed windows ---------- */
export async function rateLimited(request, name, limit, windowSec) {
  const r = db();
  const win = Math.floor(now() / 1000 / windowSec);
  const key = `rl:${name}:${clientIp(request)}:${win}`;
  const count = Number(await r.incr(key));
  if (count === 1) await r.expire(key, windowSec);
  return count > limit;
}

/* ---------- status ---------- */
export async function getStatus() {
  const raw = await db().get("status");
  if (!raw) return "away";
  try {
    const s = JSON.parse(raw);
    return s.state === "around" && now() - s.at < AROUND_FOR_MS ? "around" : "away";
  } catch {
    return "away";
  }
}

/* ---------- conversations ---------- */
export async function getConv(id) {
  if (typeof id !== "string" || !/^[\w-]{6,40}$/.test(id)) return null;
  const c = await db().hgetall(`conv:${id}`);
  return c && Object.keys(c).length ? c : null;
}

export async function getMessages(id, from = 0) {
  const list = (await db().lrange(`msgs:${id}`, from, -1)) || [];
  return list.map((raw, i) => ({ n: from + i, ...JSON.parse(raw) }));
}

export async function addMessage(id, from, text) {
  const r = db();
  const at = now();
  const n = Number(await r.rpush(`msgs:${id}`, JSON.stringify({ from, text, at }))) - 1;
  await r.hset(`conv:${id}`, { updatedAt: String(at), lastText: text.slice(0, 140), lastFrom: from });
  if (from === "visitor") await r.hincrby(`conv:${id}`, "unread", 1);
  await r.zadd("convs", { score: at, member: id });
  return { n, from, text, at };
}

export async function deleteConv(id) {
  const r = db();
  await r.del(`conv:${id}`);
  await r.del(`msgs:${id}`);
  await r.zrem("convs", id);
}

/* ---------- owner auth: signed cookie derived from INBOX_PASSWORD ---------- */
const COOKIE = "inbox_session";
const SESSION_DAYS = 180;

function sign(value) {
  return crypto.createHmac("sha256", process.env.INBOX_PASSWORD).update(value).digest("base64url");
}

export function sessionCookie() {
  const exp = String(now() + SESSION_DAYS * 86400_000);
  const v = `${exp}.${sign(exp)}`;
  return `${COOKIE}=${v}; Path=/api/inbox; Max-Age=${SESSION_DAYS * 86400}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/api/inbox; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

export function isOwner(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  return Boolean(exp && sig) && Number(exp) > now() && safeEqual(sig, sign(exp));
}

/* ---------- push notifications to Yana ---------- */
export async function vapidKeys() {
  const r = db();
  let keys = await r.hgetall("vapid");
  if (!keys || !keys.publicKey) {
    const k = webpush().generateVAPIDKeys();
    await r.hset("vapid", { publicKey: k.publicKey, privateKey: k.privateKey });
    keys = await r.hgetall("vapid"); // re-read in case another request won the race
  }
  return keys;
}

export async function notifyOwner(request, payload) {
  const r = db();
  const subs = (await r.hgetall("push:subs")) || {};
  const endpoints = Object.keys(subs);
  if (!endpoints.length) return 0;

  const keys = await vapidKeys();
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "example.com";
  const options = {
    vapidDetails: { subject: `https://${host}`, publicKey: keys.publicKey, privateKey: keys.privateKey },
    TTL: 60 * 60 * 24,
    urgency: "high",
  };

  let sent = 0;
  await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        await webpush().sendNotification(JSON.parse(subs[endpoint]), JSON.stringify(payload), options);
        sent++;
      } catch (err) {
        // 404/410: that device unsubscribed or the subscription expired
        if (err && (err.statusCode === 404 || err.statusCode === 410)) await r.hdel("push:subs", endpoint);
      }
    })
  );
  return sent;
}
