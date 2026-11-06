# mysite

Personal site: draggable cards scattered on a page, shuffled fresh on every visit.

Plain HTML/CSS/JS, no build step, plus one tiny Vercel function.

- `index.html`: all the content. Each `<article class="card">` is one box.
- `styles.css`: look and feel. Colors and font are at the top.
- `script.js`: random layout + dragging.

## Editing content
- **Links:** swap the placeholder `href`s in `index.html`.
- **Art images:** in the art card, replace each `<span class="ph"></span>` with
  `<img src="images/whatever.jpg" alt="description">`. The `--iw` / `--ih`
  values on each `<figure>` set the image's size in the pile.
- **New card:** copy any `<article class="card">` block and give it a unique `data-card`.
  Add `data-near="other-card"` to make it start stuck to another card's corner
  (that's how "currently" sits on "work").

## "Listening now" (Spotify via Last.fm)
The about card shows what you're playing (or last played). It stays hidden until this is set up:

1. Make a free account at last.fm.
2. Connect Spotify: last.fm → Settings → Applications → Spotify scrobbling → Connect.
3. Get an API key: https://www.last.fm/api/account/create (any app name; callback URL can be blank).
4. In Vercel → Project → Settings → Environment Variables, add:
   - `LASTFM_API_KEY` = the key from step 3
   - `LASTFM_USER` = your last.fm username
5. Redeploy.

The serverless function lives in `api/now-playing.js`. Song links open a Spotify search for that track.

## Email
The address is stored reversed in `index.html` (`data-u` / `data-d`) and only assembled
when someone hovers or clicks, so it never appears as plain text in the page source.

## Run locally
```bash
python3 -m http.server 8000
```
then open http://localhost:8000 (the listening widget needs Vercel, so it stays hidden locally; `vercel dev` runs it if you want).

## Deploy
Import the repo in Vercel. No framework, no build command; it serves the files as-is.
