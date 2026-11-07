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

// The RSS feed needs a private key now, so read the (public) shelf page itself.
export function parseShelfPage(html) {
  const rows = html.match(/<tr[^>]*id="review_\d+"[\s\S]*?<\/tr>/g) || [];
  return rows.map((row) => {
    const title = row.match(/<td class="field title">[\s\S]*?<a[^>]*title="([^"]+)"[^>]*href="([^"]+)"/) ||
      row.match(/<td class="field title">[\s\S]*?<a[^>]*href="([^"]+)"[^>]*title="([^"]+)"/);
    if (!title) return null;
    const [t, href] = title[0].includes('title="' + title[1]) ? [title[1], title[2]] : [title[2], title[1]];
    const au = (row.match(/<td class="field author">[\s\S]*?<a[^>]*>([^<]+)<\/a>/) || [])[1] || "";
    const img = (row.match(/<td class="field cover">[\s\S]*?<img[^>]*src="([^"]+)"/) || [])[1] || null;
    const [last, first] = decode(au).split(/,\s*/);
    return {
      title: decode(t).replace(/\s+/g, " ").trim(),
      author: first ? `${first} ${last}` : last || "",
      image: img ? img.replace(/\._S[XY]\d+_/, "._SY160_") : null,
      url: href.startsWith("http") ? href : "https://www.goodreads.com" + href,
    };
  }).filter(Boolean);
}

export async function GET() {
  try {
    const id = await findUserId();
    if (!id) return json({ books: [], error: "no goodreads user" }, 502, "no-store");
    const headers = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" };
    let books = [];
    const rss = await fetch(`https://www.goodreads.com/review/list_rss/${id}?shelf=currently-reading`, { headers });
    if (rss.ok) books = parseFeed(await rss.text());
    if (!books.length) {
      const page = await fetch(`https://www.goodreads.com/review/list/${id}?shelf=currently-reading&per_page=20`, { headers });
      if (!page.ok) return json({ books: [], error: `goodreads ${page.status}` }, 502, "no-store");
      books = parseShelfPage(await page.text());
    }
    return json({ books: books.slice(0, 6) });
  } catch (err) {
    return json({ books: [], error: String(err.message || err) }, 502, "no-store");
  }
}
