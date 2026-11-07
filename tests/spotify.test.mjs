// Run with: npm test
// Tests the Spotify functions against a fake Spotify (no network).

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

let fresh = 0;
const load = (path) => import(`${path}?v=${++fresh}`); // new module = empty token cache

const ENV = ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET", "SPOTIFY_REFRESH_TOKEN"];
let calls;
let routes;

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  calls.push({ url: u, opts });
  for (const [match, respond] of routes) if (u.includes(match)) return respond(u, opts);
  throw new Error("unexpected fetch " + u);
};
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const track = {
  name: "Pink + White",
  artists: [{ name: "Frank Ocean" }, { name: "Someone" }],
  album: { name: "Blonde", images: [{ url: "big", width: 640 }, { url: "mid", width: 300 }, { url: "small", width: 64 }] },
  external_urls: { spotify: "https://open.spotify.com/track/abc" },
};

beforeEach(() => {
  calls = [];
  routes = [["accounts.spotify.com/api/token", () => reply(200, { access_token: "AT", expires_in: 3600 })]];
  for (const k of ENV) delete process.env[k];
});
const configure = () => Object.assign(process.env, { SPOTIFY_CLIENT_ID: "id", SPOTIFY_CLIENT_SECRET: "secret", SPOTIFY_REFRESH_TOKEN: "RT" });

/* ---------- /api/now-playing ---------- */

test("not configured → hidden, no Spotify calls", async () => {
  const { GET } = await load("../api/now-playing.js");
  const r = await GET();
  assert.deepEqual(await r.json(), { track: null, configured: false });
  assert.equal(calls.length, 0);
});

test("playing right now", async () => {
  configure();
  routes.push(["currently-playing", () => reply(200, { is_playing: true, currently_playing_type: "track", item: track })]);
  const { GET } = await load("../api/now-playing.js");
  const r = await GET();
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).track, {
    title: "Pink + White", artist: "Frank Ocean, Someone", album: "Blonde", image: "mid",
    nowPlaying: true, playedAt: null, url: "https://open.spotify.com/track/abc",
  });
  assert.match(r.headers.get("cache-control"), /s-maxage=30/);
  const tokenCall = calls.find((c) => c.url.includes("/api/token"));
  assert.equal(tokenCall.opts.headers.Authorization, "Basic " + Buffer.from("id:secret").toString("base64"));
  assert.match(String(tokenCall.opts.body), /grant_type=refresh_token&refresh_token=RT/);
});

test("paused → shown as not playing", async () => {
  configure();
  routes.push(["currently-playing", () => reply(200, { is_playing: false, currently_playing_type: "track", item: track })]);
  const { GET } = await load("../api/now-playing.js");
  const t = (await (await GET()).json()).track;
  assert.equal(t.nowPlaying, false);
  assert.equal(t.title, "Pink + White");
});

test("nothing playing → last played track with time", async () => {
  configure();
  routes.push(["currently-playing", () => reply(204, null)]);
  routes.push(["recently-played", () => reply(200, { items: [{ track, played_at: "2026-11-07T20:00:00Z" }] })]);
  const { GET } = await load("../api/now-playing.js");
  const t = (await (await GET()).json()).track;
  assert.equal(t.nowPlaying, false);
  assert.equal(t.playedAt, Date.parse("2026-11-07T20:00:00Z"));
});

test("podcast playing → falls back to last played track", async () => {
  configure();
  routes.push(["currently-playing", () => reply(200, { is_playing: true, currently_playing_type: "episode", item: null })]);
  routes.push(["recently-played", () => reply(200, { items: [{ track, played_at: "2026-11-07T20:00:00Z" }] })]);
  const { GET } = await load("../api/now-playing.js");
  assert.equal((await (await GET()).json()).track.title, "Pink + White");
});

test("access token is reused while warm", async () => {
  configure();
  routes.push(["currently-playing", () => reply(200, { is_playing: true, currently_playing_type: "track", item: track })]);
  const { GET } = await load("../api/now-playing.js");
  await GET(); await GET(); await GET();
  assert.equal(calls.filter((c) => c.url.includes("/api/token")).length, 1);
});

test("Spotify errors → 502, widget stays hidden", async () => {
  configure();
  routes[0] = ["accounts.spotify.com/api/token", () => reply(400, { error: "invalid_grant" })];
  let mod = await load("../api/now-playing.js");
  let r = await mod.GET();
  assert.equal(r.status, 502);
  assert.equal((await r.json()).track, null);

  routes = [["accounts.spotify.com/api/token", () => reply(200, { access_token: "AT", expires_in: 3600 })],
    ["currently-playing", () => reply(204, null)], ["recently-played", () => reply(403, {})]];
  mod = await load("../api/now-playing.js");
  r = await mod.GET();
  assert.equal(r.status, 502);
  assert.equal((await r.json()).track, null);
});
