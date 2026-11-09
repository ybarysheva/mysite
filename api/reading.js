// Vercel function: GET /api/reading → { books: [{ title, author, image, url }] }
// Yana's Goodreads "currently-reading" shelf. Goodreads has no public API, so this tries, in order:
// the shelf's RSS feed (usually wants a private key now), the public shelf page, and the public
// "custom widget" Goodreads offers for embedding (the one that works for her today).
// Add ?debug=1 to see what each source returned.

const USER_ID = process.env.GOODREADS_USER_ID || "4844438"; // Yana's Goodreads member number
const SHELF = "currently-reading";
const MAX_BOOKS = 6;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
};

const json = (body, status = 200, cache = "s-maxage=3600, stale-while-revalidate=86400") =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": cache } });

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const firstMatch = (text, re) => text.match(re)?.[1] ?? "";
const biggerCover = (url) => (url ? url.replace(/\._S[XY]\d+_/, "._SY160_") : null);

/* ---------- the three sources ---------- */

/** RSS feed: <item>s with <title>, <author_name>, <book_id>, cover urls. */
export function parseFeed(xml) {
  const tag = (item, name) => {
    const m = item.match(new RegExp(`<${name}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${name}>`));
    return (m?.[1] ?? m?.[2] ?? "").trim();
  };
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map(([, item]) => {
      const id = tag(item, "book_id");
      return {
        title: decode(tag(item, "title")),
        author: decode(tag(item, "author_name")),
        image: tag(item, "book_large_image_url") || tag(item, "book_medium_image_url") || tag(item, "book_image_url") || null,
        url: id ? `https://www.goodreads.com/book/show/${id}` : tag(item, "link") || null,
      };
    })
    .filter((b) => b.title);
}

/** Shelf page: one <tr id="review_…"> per book with title / author ("Last, First") / cover cells. */
export function parseShelfPage(html) {
  return (html.match(/<tr[^>]*id="review_\d+"[\s\S]*?<\/tr>/g) ?? [])
    .map((row) => {
      const link = row.match(/<td class="field title">[\s\S]*?<a\b([^>]*)>/)?.[1] ?? "";
      const title = firstMatch(link, /title="([^"]+)"/);
      const href = firstMatch(link, /href="([^"]+)"/);
      if (!title || !href) return null;
      const [last, first] = decode(firstMatch(row, /<td class="field author">[\s\S]*?<a[^>]*>([^<]+)<\/a>/)).split(/,\s*/);
      return {
        title: decode(title).replace(/\s+/g, " ").trim(),
        author: first ? `${first} ${last}` : last ?? "",
        image: biggerCover(firstMatch(row, /<td class="field cover">[\s\S]*?<img[^>]*src="([^"]+)"/) || null),
        url: href.startsWith("http") ? href : `https://www.goodreads.com${href}`,
      };
    })
    .filter(Boolean);
}

/** Custom widget: JavaScript that writes HTML blocks (escaped) with cover, title and author. */
export function parseWidget(js) {
  const html = js.replace(/\\"/g, '"').replace(/\\\//g, "/").replace(/\\n/g, "\n");
  const blocks = html.match(/class="gr_custom_each_container[^"]*"[\s\S]*?(?=class="gr_custom_each_container|$)/g) ?? [];
  return blocks
    .map((block) => {
      const t = block.match(/class="gr_custom_title[^"]*"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/);
      if (!t) return null;
      return {
        title: decode(t[2]).trim(),
        author: decode(firstMatch(block, /class="gr_custom_author[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/)).trim(),
        image: biggerCover(firstMatch(block, /<img[^>]*src="([^"]+)"/) || null),
        url: t[1],
      };
    })
    .filter(Boolean);
}

const SOURCES = [
  ["rss", `https://www.goodreads.com/review/list_rss/${USER_ID}?shelf=${SHELF}`, parseFeed],
  ["page", `https://www.goodreads.com/review/list/${USER_ID}?shelf=${SHELF}&per_page=20`, parseShelfPage],
  [
    "widget",
    `https://www.goodreads.com/review/custom_widget/${USER_ID}.${SHELF}?cover_position=left&cover_size=small&num_books=10` +
      `&order=d&shelf=${SHELF}&show_author=1&show_cover=1&show_rating=0&show_review=0&show_tags=0&show_title=1` +
      "&sort=date_added&widget_id=1", // exactly what works today
    parseWidget,
  ],
];

export async function GET(request) {
  const debug = request && new URL(request.url).searchParams.has("debug") ? {} : null;
  try {
    for (const [name, url, parse] of SOURCES) {
      const res = await fetch(url, { headers: HEADERS });
      const text = await res.text();
      const books = res.ok ? parse(text) : [];
      if (debug) debug[name] = { status: res.status, length: text.length, start: text.slice(0, 300), books: books.length };
      if (books.length) {
        const body = { books: books.slice(0, MAX_BOOKS) };
        return debug ? json({ ...body, debug }, 200, "no-store") : json(body);
      }
    }
    return json(debug ? { books: [], debug } : { books: [] });
  } catch (err) {
    return json({ books: [], error: String(err?.message ?? err), ...(debug && { debug }) }, 502, "no-store");
  }
}
