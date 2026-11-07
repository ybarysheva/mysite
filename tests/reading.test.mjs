// npm test — "currently reading" against a fake Goodreads (no network).
import { test } from "node:test";
import assert from "node:assert/strict";

const FEED = `<?xml version="1.0"?><rss><channel><title>Yana's bookshelf: currently-reading</title>
<item><title><![CDATA[Piranesi]]></title><link><![CDATA[https://www.goodreads.com/review/show/1]]></link>
<book_id>50202953</book_id><book_image_url><![CDATA[https://i.gr-assets.com/s.jpg]]></book_image_url>
<book_medium_image_url><![CDATA[https://i.gr-assets.com/m.jpg]]></book_medium_image_url>
<author_name>Susanna Clarke</author_name></item>
<item><title>Second</title><book_id>2</book_id><author_name>Someone</author_name></item></channel></rss>`;

let calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).includes("/author/show/")) return { ok: true, text: async () => '<a href="/user/show/987654-yana">profile</a>' };
  if (String(url).includes("list_rss/987654")) return { ok: true, text: async () => FEED };
  return { ok: false, status: 404, text: async () => "" };
};
const { GET, parseFeed } = await import("../api/reading.js");

test("finds the member id from the author page, returns every book on the shelf", async () => {
  const body = await (await GET()).json();
  assert.equal(body.books.length, 2);
  assert.deepEqual(body.books[0], { title: "Piranesi", author: "Susanna Clarke", image: "https://i.gr-assets.com/m.jpg", url: "https://www.goodreads.com/book/show/50202953" });
  assert.ok(calls.some((c) => c.includes("shelf=currently-reading")));
});

test("empty shelf → no books", () => {
  assert.deepEqual(parseFeed("<rss><channel></channel></rss>"), []);
});
