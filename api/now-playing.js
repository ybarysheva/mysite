// Vercel serverless function: GET /api/now-playing
// Returns what Yana is listening to right now (or last listened to), via Last.fm.
// Needs two environment variables set in Vercel: LASTFM_API_KEY and LASTFM_USER.

const LASTFM_BLANK_IMAGE = "2a96cbd8b46e442fc41c2b86b821562f"; // Last.fm's grey star placeholder

const json = (body, status = 200, cache = "s-maxage=30, stale-while-revalidate=60") =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": cache },
  });

export async function GET() {
  const key = process.env.LASTFM_API_KEY;
  const user = process.env.LASTFM_USER;
  if (!key || !user) return json({ track: null, configured: false }, 200, "no-store");

  const url =
    "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&format=json&limit=1" +
    `&user=${encodeURIComponent(user)}&api_key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return json({ track: null, error: `lastfm ${res.status}` }, 502, "no-store");
    const data = await res.json();
    const t = data?.recenttracks?.track?.[0];
    if (!t) return json({ track: null });

    const title = t.name;
    const artist = t.artist?.["#text"] || t.artist?.name || "";
    const image = (t.image || []).map((i) => i["#text"]).filter(Boolean).pop() || null;

    return json({
      track: {
        title,
        artist,
        album: t.album?.["#text"] || null,
        image: image && !image.includes(LASTFM_BLANK_IMAGE) ? image : null,
        nowPlaying: t["@attr"]?.nowplaying === "true",
        playedAt: t.date?.uts ? Number(t.date.uts) * 1000 : null,
        url: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
      },
    });
  } catch (err) {
    return json({ track: null, error: "fetch failed" }, 502, "no-store");
  }
}
