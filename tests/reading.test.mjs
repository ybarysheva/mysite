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
  if (String(url).includes("list_rss/4844438")) return { ok: true, text: async () => FEED };
  return { ok: false, status: 404, text: async () => "" };
};
const { GET, parseFeed } = await import("../api/reading.js");

test("reads Yana's currently-reading shelf and returns every book", async () => {
  const body = await (await GET()).json();
  assert.equal(body.books.length, 2);
  assert.deepEqual(body.books[0], { title: "Piranesi", author: "Susanna Clarke", image: "https://i.gr-assets.com/m.jpg", url: "https://www.goodreads.com/book/show/50202953" });
  assert.ok(calls.some((c) => c.includes("shelf=currently-reading")));
});

test("empty shelf → no books", () => {
  assert.deepEqual(parseFeed("<rss><channel></channel></rss>"), []);
});

test("reads the shelf page when the feed needs a key", async () => {
  const { parseShelfPage } = await import("../api/reading.js");
  const html = `<table><tr id="review_1" class="bookalike review">
    <td class="field cover"><div class="value"><a href="/book/show/153747.Moby_Dick"><img alt="Moby-Dick" src="https://i.gr-assets.com/images/S/x/1._SY75_.jpg"></a></div></td>
    <td class="field title"><div class="value"><a title="Moby-Dick or, The Whale" href="/book/show/153747.Moby_Dick">Moby-Dick or, The Whale</a></div></td>
    <td class="field author"><div class="value"><a href="/author/show/1624.Herman_Melville">Melville, Herman</a></div></td></tr></table>`;
  assert.deepEqual(parseShelfPage(html), [{ title: "Moby-Dick or, The Whale", author: "Herman Melville", image: "https://i.gr-assets.com/images/S/x/1._SY160_.jpg", url: "https://www.goodreads.com/book/show/153747.Moby_Dick" }]);
});

test("reads Goodreads' public custom widget", async () => {
  const { parseWidget } = await import("../api/reading.js");
  const js = 'var x = "<div class=\\"gr_custom_each_container_1\\"><div class=\\"gr_custom_book_container_1\\"><a href=\\"https:\\/\\/www.goodreads.com\\/review\\/show\\/9\\"><img alt=\\"Moby\\" src=\\"https:\\/\\/i.gr-assets.com\\/a._SY75_.jpg\\" \\/><\\/a><\\/div><div class=\\"gr_custom_title_1\\"><a href=\\"https:\\/\\/www.goodreads.com\\/review\\/show\\/9\\">Moby-Dick or, The Whale<\\/a><\\/div><div class=\\"gr_custom_author_1\\">by <a href=\\"https:\\/\\/www.goodreads.com\\/author\\/show\\/1624\\">Herman Melville<\\/a><\\/div><\\/div>";';
  assert.deepEqual(parseWidget(js), [{ title: "Moby-Dick or, The Whale", author: "Herman Melville", image: "https://i.gr-assets.com/a._SY160_.jpg", url: "https://www.goodreads.com/review/show/9" }]);
});
