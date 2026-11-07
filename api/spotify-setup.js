// TEMPORARY one-time setup page: GET /api/spotify-setup
// Lets Yana log in to Spotify once and copy the long-lived "refresh token" that
// /api/now-playing needs. Delete this file once SPOTIFY_REFRESH_TOKEN is set in Vercel.
//
// Safe to leave up briefly: it only ever shows the token of whoever logs in (a stranger
// would only get their own), and it switches itself off once SPOTIFY_REFRESH_TOKEN exists.

import crypto from "node:crypto";

const SCOPES = "user-read-currently-playing user-read-recently-played";
const COOKIE = "spotify_setup_state";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function page(title, bodyHtml, { status = 200, headers = {} } = {}) {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  body { margin: 0; padding: 32px 20px; background: #111; color: #ececec;
         font: 14px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 16px; margin: 0 0 16px; }
  code, .token { background: #191919; border: 1px solid #ececec; padding: 2px 6px; }
  .token { display: block; padding: 12px; margin: 12px 0; word-break: break-all; }
  button { font: inherit; padding: 6px 14px; background: #ececec; color: #111; border: 0; cursor: pointer; }
  ol { padding-left: 20px; } li { margin: 6px 0; }
  .muted { color: #8a8a8a; }
</style></head>
<body><main><h1>${esc(title)}</h1>${bodyHtml}</main></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function siteOrigin(request) {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  return `https://${host}`;
}

function readCookie(request, name) {
  const m = (request.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}

const clearState = `${COOKIE}=; Path=/api/spotify-setup; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export async function GET(request) {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = `${siteOrigin(request)}/api/spotify-setup`;

  // Already done: this page does nothing anymore.
  if (process.env.SPOTIFY_REFRESH_TOKEN) {
    return page("spotify is already set up", `<p>All set: "listening now" is connected.
      This setup page is switched off and can be deleted from the site.</p>`);
  }

  // Step 1 not done yet.
  if (!id || !secret) {
    return page("spotify setup: step 1 first", `
      <ol>
        <li>On <code>developer.spotify.com</code> → Dashboard → <b>Create app</b>.
          Any name; tick <b>Web API</b>; set the Redirect URI to exactly:
          <span class="token">${esc(redirectUri)}</span></li>
        <li>In Vercel → Settings → Environment Variables, add <code>SPOTIFY_CLIENT_ID</code> and
          <code>SPOTIFY_CLIENT_SECRET</code> from that app, then redeploy.</li>
        <li>Come back to this page.</li>
      </ol>`);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  // Spotify sent us back with an error (e.g. "Cancel" was tapped).
  if (error) {
    return page("spotify said no", `<p>Spotify returned: <code>${esc(error)}</code>.</p>
      <p><a href="/api/spotify-setup" style="color:inherit">try again</a></p>`, {
      status: 400,
      headers: { "Set-Cookie": clearState },
    });
  }

  // First visit: send Yana to Spotify's login + "Agree" screen.
  if (!code) {
    const state = crypto.randomBytes(16).toString("base64url");
    const auth = new URL("https://accounts.spotify.com/authorize");
    auth.search = new URLSearchParams({
      client_id: id,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      show_dialog: "true",
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: auth.toString(),
        "Cache-Control": "no-store",
        "Set-Cookie": `${COOKIE}=${state}; Path=/api/spotify-setup; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      },
    });
  }

  // Back from Spotify: check it's the same browser that started, then trade the code for a token.
  const expected = readCookie(request, COOKIE);
  const got = url.searchParams.get("state") || "";
  if (!expected || expected.length !== got.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))) {
    return page("that didn't match", `<p>The login didn't come back to the same browser that started it
      (or took over 10 minutes). <a href="/api/spotify-setup" style="color:inherit">Start again</a>.</p>`, {
      status: 400,
      headers: { "Set-Cookie": clearState },
    });
  }

  let data;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok || !data.refresh_token) throw new Error(data.error_description || data.error || `status ${res.status}`);
  } catch (err) {
    return page("couldn't get the token", `<p>Spotify said: <code>${esc(err.message)}</code></p>
      <p class="muted">Check that the Redirect URI in your Spotify app is exactly
      <code>${esc(redirectUri)}</code>, then <a href="/api/spotify-setup" style="color:inherit">try again</a>.</p>`, {
      status: 502,
      headers: { "Set-Cookie": clearState },
    });
  }

  return page("spotify: copy this", `
    <p>Your refresh token:</p>
    <span class="token" id="t">${esc(data.refresh_token)}</span>
    <button type="button" onclick="navigator.clipboard.writeText(document.getElementById('t').textContent).then(()=>this.textContent='copied ✓')">copy</button>
    <ol>
      <li>In Vercel → Settings → Environment Variables, add <code>SPOTIFY_REFRESH_TOKEN</code> with this value.</li>
      <li>Redeploy. "listening now" shows up on your about card.</li>
      <li>Tell Claude, so this setup page gets removed.</li>
    </ol>
    <p class="muted">Keep this token private (it's like a password for "what you're playing").</p>`, {
    headers: { "Set-Cookie": clearState },
  });
}
