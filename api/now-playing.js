// Vercel serverless function: GET /api/now-playing
// Returns what Yana is listening to on Spotify right now, or the last thing played.
//
// Needs three environment variables in Vercel (see README):
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const PLAYER = "https://api.spotify.com/v1/me/player";

// Access tokens last an hour; reuse one while this function instance is warm.
let cached = { token: null, expires: 0 };

const json = (body, status = 200, cache = "s-maxage=30, stale-while-revalidate=60") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache },
  });

async function getAccessToken({ id, secret, refresh }) {
  if (cached.token && Date.now() < cached.expires - 60_000) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = await res.json();
  cached = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

function shape(item, { nowPlaying, playedAt }) {
  const images = item.album?.images || []; // largest first
  const image = images.find((i) => i.width && i.width <= 300) || images[images.length - 1];
  return {
    title: item.name,
    artist: (item.artists || []).map((a) => a.name).join(", "),
    album: item.album?.name || null,
    image: image?.url || null,
    nowPlaying,
    playedAt,
    url: item.external_urls?.spotify || null,
  };
}

export async function GET() {
  const creds = {
    id: process.env.SPOTIFY_CLIENT_ID,
    secret: process.env.SPOTIFY_CLIENT_SECRET,
    refresh: process.env.SPOTIFY_REFRESH_TOKEN,
  };
  if (!creds.id || !creds.secret || !creds.refresh) {
    return json({ track: null, configured: false }, 200, "no-store");
  }

  try {
    const token = await getAccessToken(creds);
    const auth = { headers: { Authorization: `Bearer ${token}` } };

    // 1. Something playing (or paused) right now? (204 = nothing)
    const now = await fetch(`${PLAYER}/currently-playing`, auth);
    if (now.status === 200) {
      const data = await now.json();
      if (data?.item && data.currently_playing_type === "track") {
        return json({ track: shape(data.item, { nowPlaying: !!data.is_playing, playedAt: null }) });
      }
    }

    // 2. Otherwise, the last track played.
    const recent = await fetch(`${PLAYER}/recently-played?limit=1`, auth);
    if (!recent.ok) return json({ track: null, error: `spotify ${recent.status}` }, 502, "no-store");
    const item = (await recent.json())?.items?.[0];
    if (!item) return json({ track: null });
    return json({ track: shape(item.track, { nowPlaying: false, playedAt: Date.parse(item.played_at) }) });
  } catch (err) {
    return json({ track: null, error: String(err.message || err) }, 502, "no-store");
  }
}
