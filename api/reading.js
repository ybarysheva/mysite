// Vercel function: GET /api/reading
// What Yana is currently reading, from her Goodreads "currently-reading" shelf (public RSS feed).
// Her member id is looked up once from her Goodreads author page (or set GOODREADS_USER_ID in Vercel).

const AUTHOR_PAGE = "https://www.goodreads.com/author/show/21172078.Yana_Barysheva";
let userId = process.env.GOODREADS_USER_ID || "4844438"; // Yana's Goodreads member number

const json = (body, status = 200, cache = "s-maxage=3600, stale-while-revalidate=86400") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache } });

const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`));
  return m ? (m[1] ?? m[2] ?? "").trim() : "";
};
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// every book on the shelf (newest first, as Goodreads lists them)
export function parseFeed(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => toBook(m[1])).filter((b) => b.title);
}

function toBook(item) {
  const id = pick(item, "book_id");
  return {
    title: decode(pick(item, "title")),
    author: decode(pick(item, "author_name")),
    image: pick(item, "book_large_image_url") || pick(item, "book_medium_image_url") || pick(item, "book_image_url") || null,
    url: id ? `https://www.goodreads.com/book/show/${id}` : pick(item, "link") || null,
  };
}

async function findUserId() {
  if (userId) return userId;
  const res = await fetch(AUTHOR_PAGE, { headers: { "User-Agent": "Mozilla/5.0" } });
  const m = (await res.text()).match(/\/user\/show\/(\d+)/);
  if (m) userId = m[1];
  return userId;
}

export async function GET() {
  try {
    const id = await findUserId();
    if (!id) return json({ books: [], error: "no goodreads user" }, 502, "no-store");
    const res = await fetch(`https://www.goodreads.com/review/list_rss/${id}?shelf=currently-reading`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return json({ books: [], error: `goodreads ${res.status}` }, 502, "no-store");
    const books = parseFeed(await res.text()).slice(0, 6);
    return json({ books });
  } catch (err) {
    return json({ books: [], error: String(err.message || err) }, 502, "no-store");
  }
}
