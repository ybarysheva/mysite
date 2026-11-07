# mysite

Personal site: draggable cards scattered on a page, shuffled fresh on every visit.

Plain HTML/CSS/JS, no build step.

- `index.html`: all the content. Each `<article class="card">` is one box.
- `styles.css`: look and feel. Colors and font are at the top.
- `script.js`: random layout + dragging.

## Editing content
- **Links:** swap the placeholder `href`s in `index.html`.
- **Art images:** in the art card, replace each `<span class="ph"></span>` with
  `<img src="images/whatever.jpg" alt="description">`. The `--iw` / `--ih`
  values on each `<figure>` set the image's size in the pile.
- **New card:** copy any `<article class="card">` block and give it a unique `data-card`.
- **Stuck-on notes:** an `<aside class="note">` inside a card sits on its top-right corner
  and moves with it (that's how "currently" sits on "work").

## "Listening now" (Spotify)
Not set up yet. The about card has a hidden spot for the current/last-played Spotify
track; it stays hidden until there's an `/api/now-playing` endpoint to fill it.

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
