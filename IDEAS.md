# Parked ideas

Ideas for the site that are decided-ish but **not built yet**. Nothing here is live.
Build one only when Yana says go.

---

## 1. Bass mode (easter egg / mini game)

Four bass strings come down over the site and you can play them.

**Decided**
- **Entry:** a bass clef floating around the "bass" row in the side-projects card, moving in a way
  that invites a click (gentle bob/drift, wiggle on hover). Static if the visitor prefers reduced motion.
  It's a child of the card, so it moves with it.
- **Notes:** frets along the string. Where you touch along a string picks the note.
- **Sound:** plucked bass, generated in the browser (no audio files).

**Design sketch**
- Enter: cards fade back (dimmed, not clickable); four vertical strings drop in from the top:
  E A D G, left to right, thickest to thinnest, in the site's ink color (dark + light).
- Neck: faint fret lines spaced like a real bass (12 frets, nut at the top), dots at 3, 5, 7, 9, 12.
- Play: tap a string to pluck at that fret; swipe across strings to strum. Big hit areas for phones;
  swipes play instead of scrolling. Keys 1–4 pluck open strings.
- Look: plucked string bows out and wobbles back; the note name (e.g. "A1") pops up in mono and fades.
- Sound: Karplus–Strong pluck with Web Audio, warm low-pass, real tuning
  (E1 41Hz, A1 55Hz, D2 73Hz, G2 98Hz) × fret; overtone-rich so phone speakers can play it.
  Audio starts on first tap; on iPhone request "playback" audio so the silent switch doesn't mute it.
- **"I don't know what I'm doing" button** (guided mini-game):
  - Little circles light up on the strings where to press, one after another, in time with a simple
    looping groove (~90 bpm, soft click to keep time).
  - Everything in one scale (e.g. E minor pentatonic), so wrong notes still sound fine.
  - Tap a lit circle on the beat: it pops, the note plays, a small "nice" / streak counter ticks up.
    Misses just fade; no fail state.
  - A few short patterns (easy → busier); tap the button again for free play.
- Exit: × (top-right) or Esc; strings retract up, cards return exactly where they were.
  Corners (time/weather, theme toggle) stay and keep working.

---

## 2. Weird-question box (answers emailed to Yana)

- A card with a rotating weird question ("if you were stuck doing only one thing for the rest of
  your life, what would it be?" etc.) and a box to answer.
- Answers go to Yana's email through a free form service, no database.
  **Web3Forms** suggested: she enters her email on their site, gets a key (~2 min, no account).
- Waiting on: Yana getting the key.

## 3. Stamps

- Click/tap empty canvas to leave a small stamp there. Only on that visitor's screen; gone on reload.
- Waiting on: what the stamps should be.

## 4. Spotify "listening now"

- The about card already has a hidden spot for it (`.listening`, filled from `/api/now-playing`).
- Plan: direct Spotify API (**not** Last.fm, rejected) through a Vercel function, plus a one-time script
  Yana runs on her computer to get a refresh token.
- Yana's setup when ready: create an app at developer.spotify.com (client ID + secret), run the
  script to get a refresh token, add `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`,
  `SPOTIFY_REFRESH_TOKEN` in Vercel.

## 5. Cats I've known + loved

- Not a straightforward card: something hidden/discoverable (e.g. found by double-tapping empty
  space or a tiny cat somewhere).

---

## Dropped (for the record)
- **Live chat / inbox app**: built, then removed. Yana didn't want to share her Upstash Redis
  database (used by send cat) with a second project.
- **Shuffle / tidy buttons**: removed; layout just shuffles on each load.
