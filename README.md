# mysite

Personal site: draggable cards scattered on a page, shuffled fresh on every visit.

Plain HTML/CSS/JS, no build step.

Ideas that are planned but not built yet live in [`IDEAS.md`](IDEAS.md).

- `index.html`: all the content. Each `<article class="card">` is one box.
- `styles.css`: look and feel. Colors and font are at the top.
- `script.js`: random layout + dragging.

## On phones
Boxes start as a loose stack down the first screen (about on top, the rest shuffled,
zig-zagging left/right and tucked slightly over each other: `stack()` in `script.js`).
The canvas is about two screens wide: swipe anywhere to look around. To move a box,
press and hold it (~0.4s) until it lifts, or drag it by its top bar. Hold time and
canvas size are `HOLD_MS` and `sizeDesk()` in `script.js`.

## Editing content
- **Links:** swap the placeholder `href`s in `index.html`.
- **Art images:** in the art card, replace each `<span class="ph"></span>` with
  `<img src="images/whatever.jpg" alt="description">`. The `--iw` / `--ih`
  values on each `<figure>` set the image's size in the pile.
- **New card:** copy any `<article class="card">` block and give it a unique `data-card`.
- **Stuck-on notes:** an `<aside class="note">` inside a card sits on its top-right corner
  and moves with it (that's how "currently" sits on "work").

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

## Light / dark
Dark is the default for everyone (`data-theme="dark"` on `<html>`). The button in the
bottom-right switches to light and remembers the choice in that browser. Colors for both
live at the top of `styles.css`.

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
