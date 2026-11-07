# mysite

Personal site: draggable cards scattered on a page, shuffled fresh on every visit.

Plain HTML/CSS/JS, no build step.

Ideas that are planned but not built yet live in [`IDEAS.md`](IDEAS.md).

- `index.html`: all the content. Each `<article class="card">` is one box.
- `styles.css`: look and feel. Colors and font are at the top.
- `script.js`: random layout + dragging.

## On phones
Clusters start stacked down the first screen: each main box, then its small boxes just below
it, then the next category (about first, the rest shuffled: `stack()` in `script.js`).
The canvas is about two screens wide: swipe anywhere to look around. To move a box,
press and hold it (~0.4s) until it lifts, or drag it by its top bar. Hold time and
canvas size are `HOLD_MS` and `sizeDesk()` in `script.js`.

## Editing content
Each category is a **cluster**: a main box (`<article class="card" data-card="work">`) with the
info, plus small boxes (`class="node" data-parent="work"`) for its links and examples, joined to
it by straight lines. Dragging a main box brings its small boxes along; small boxes can also be
dragged on their own.
- **Links:** swap the placeholder `href`s in `index.html` (`node--link` boxes).
- **New link/example:** copy a `.node` and set `data-parent` to the main box's `data-card`.
- **Art:** each piece is a `node--art` figure. Replace its `<span class="ph"></span>` with
  `<img src="images/whatever.jpg" alt="description">`; `--iw` / `--ih` set its size.
  The ↗ icon (`.node__out`) links each piece out; they point to the Instagram profile for now.
- **Writing pieces:** `node--piece` boxes (title + one sentence), like More Than Borsch.

## "Listening now" (Spotify)
The about card shows what you're playing on Spotify right now (or the last thing you played).
It stays hidden until it's set up, and hides itself whenever Spotify doesn't answer.
Needs Spotify **Premium** (Spotify's rule for developer apps since Feb 2026).

**Status:** connected (Spotify app + `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
`SPOTIFY_REFRESH_TOKEN` in Vercel).

**If it ever needs redoing** (Premium lapses, access revoked, new Spotify app): restore the
one-time setup page from git history (`git checkout 6e90606 -- api/spotify-setup.js`), deploy,
open `https://<your-site>/api/spotify-setup`, log in → Agree, put the new token in Vercel as
`SPOTIFY_REFRESH_TOKEN`, redeploy, then delete the setup page again. The Spotify app's Redirect
URI must match that address exactly.

Code: `api/now-playing.js` (what the widget calls).
Tests: `npm test`.

## Email
The address is stored reversed in `index.html` (`data-u` / `data-d`) and only assembled
when someone hovers or clicks, so it never appears as plain text in the page source.
Clicking "email" copies the address (shows "copied ✓"); if the browser can't copy,
it opens the mail app instead.

## NY sky background (light by day, dark at night)
`sky.js` works out where the sun is in New York right now and sets the colors to match:
pale blue at midday, peach/pink near the bottom around sunrise and sunset, a dim blue "blue hour"
at dusk and dawn, deep navy at night with a sparse field of faint stars. The real moon shows too:
its actual phase, and only while it's actually up over New York, roughly where it is in the sky
(east on the left, west on the right). The whole site is light while the sun is up and
dark at night (it switches when the sun is ~4° below the horizon, cross-fading over a few seconds).
Clouds from the weather lookup turn the sky grey and hide the stars (and dim the moon). It recalculates every minute, so the
change is too slow to notice. No light/dark button: the sky decides.
- Colors: the `DAY` / `NIGHT` tables at the top of `sky.js` (by sun height, morning vs evening).
- Without JavaScript the site is simply dark.

## Time + weather corner
Bottom-left shows New York time and weather (°F), from Open-Meteo (free, no key).
To change the place, edit `PLACE` in `script.js` (name, time zone, latitude/longitude).

## Run locally
```bash
python3 -m http.server 8000
```
then open http://localhost:8000

## Deploy
Import the repo in Vercel. No framework, no build command; it serves the files as-is.
