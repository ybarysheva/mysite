# mysite

Yana's personal site. A box for each category (about in the middle; work + side projects on the
left; writing + art on the right). Each box has small connected boxes for its links and examples;
on desktop they're tucked behind the box until it's clicked. The background follows the real sky
in New York. Plain HTML/CSS/JS, no build step. Planned-but-not-built ideas: [`IDEAS.md`](IDEAS.md).

## Files
| | |
|---|---|
| `index.html` | All the content. |
| `styles.css` | Look and feel (tokens at the top, then one section per part of the page). |
| `js/sky.js` | Sky colors, light/dark, stars and the real moon (runs before the page paints). |
| `js/main.js` | Starts everything. |
| `js/layout.js` | Places the boxes, draws the lines, open/close on click. |
| `js/geometry.js` | Small math helpers for the layout. |
| `js/widgets.js` | Email copy, NYC time + weather, last played, currently reading. |
| `api/now-playing.js` | Vercel function: Spotify last played / listening now. |
| `api/reading.js` | Vercel function: Goodreads currently-reading shelf. |
| `tests/` | `npm test` (no network needed). |

## Editing content
Each category is a **cluster**: a main box (`<article class="card" data-card="work">`) plus small
boxes (`class="node" data-parent="work"`).
- **New link:** copy a `node node--link` and set `data-parent` to its main box's `data-card`.
- **Project / writing piece (title + one sentence):** copy a `node node--link node--entry`.
- **Art:** each piece is a `node node--art` figure with an `<img>` (its `width`/`height` set the size)
  and a `.node__out` ↗ link (currently the Instagram profile; swap in each post's link).
- **New category:** add an `<article class="card" data-card="…">` + its nodes; give it a width in
  `styles.css` (`.card--… { --w: … }`) and a spot in `arrangeDesktop()` in `js/layout.js`.

## Layout (`js/layout.js`)
Computed, but with a fixed random seed, so it's the same on every visit for a given screen size.
Desktop tries a few arrangements and keeps one with nothing overlapping and every small box
clearly nearest its own main box. Phones stack everything top to bottom, all open.

## Sky (`js/sky.js`)
Works out where the sun and moon are over New York right now: pale blue midday, peach at sunrise
and sunset, a dim blue hour at dusk and dawn, navy night with faint stars, and the moon in its real
phase only while it's up. The site is light while the sun is up and dark at night. Clouds (from the
weather lookup) grey the sky. Colors live in the `DAY` / `NIGHT` tables at the top.

## Live bits (`js/widgets.js`)
- **Email:** stored reversed in the HTML and only assembled on hover/click; clicking copies it.
- **Time + weather:** New York, from Open-Meteo (no key). Change `PLACE` to move it.
- **Last played** (Spotify, `api/now-playing.js`): needs `SPOTIFY_CLIENT_ID`,
  `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN` in Vercel (Spotify Premium required). To redo the
  token: `git checkout 6e90606 -- api/spotify-setup.js`, deploy, open `/api/spotify-setup`, copy the
  token into Vercel, redeploy, delete the page again.
- **Currently reading** (Goodreads, `api/reading.js`): reads her shelf (member 4844438);
  `/api/reading?debug=1` shows what Goodreads returned.
- Each hides itself if its service doesn't answer.

## Run locally
```bash
python3 -m http.server 8000
```
then open http://localhost:8000 (the `/api` boxes need Vercel, so they stay hidden locally).

## Deploy
Vercel, no framework, no build command.
