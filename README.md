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

## "say hi" chat
Visitors can message you from the site; you get a notification on your phone and reply
from your own little inbox app at `/inbox`. Until it's set up, the chat card just doesn't show.

**One-time setup (~10 min)**
1. Deploy the site on Vercel.
2. Vercel → your project → **Storage** → add **Upstash Redis** (free) → connect it to this project.
   That's where messages are saved; it adds its own settings automatically.
3. Vercel → Settings → **Environment Variables** → add `INBOX_PASSWORD` (anything you'll remember).
   Redeploy so it takes effect.
4. On your iPhone, in Safari: open `yoursite.com/inbox` → **Share → Add to Home Screen**.
5. Open **inbox** from your home screen (not Safari), log in, tap **turn on notifications** → Allow.
   (iPhone only allows notifications from home-screen web apps; needs iOS 16.4+.)

**Using it**
- ● around / ○ away button (top right): tells visitors whether to expect a quick reply.
  "around" switches itself back to "away" after 8 hours.
- Visitors can leave an email; "reply by email" opens your mail app with it filled in.
- Block (their new messages silently go nowhere) or delete a conversation from inside it.
- Changing `INBOX_PASSWORD` logs you out everywhere.

**Bits and pieces**
- `chat.js`: the card on the site. The opening questions are the list at the top; edit freely.
- `api/chat.js` (visitors), `api/inbox.js` (you), `api/_lib.js` (shared helpers).
- `inbox/`: the inbox app (page, service worker for notifications, icons).
- Spam protection: per-IP rate limits, a hidden honeypot field, 1000-character messages.
- Tests: `npm install` then `npm test`.

## "Listening now" (Spotify)
Not set up yet. The about card has a hidden spot for the current/last-played Spotify
track; it stays hidden until there's an `/api/now-playing` endpoint to fill it.

## Email
The address is stored reversed in `index.html` (`data-u` / `data-d`) and only assembled
when someone hovers or clicks, so it never appears as plain text in the page source.

## Run locally
```bash
python3 -m http.server 8000
```
then open http://localhost:8000

## Deploy
Import the repo in Vercel. No framework, no build command; it serves the files as-is.
