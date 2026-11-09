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

- Its own main box ("say hi"), always open (not foldable), with a rotating weird question each visit
  ("if you were stuck doing only one thing for the rest of your life, what would it be?" etc.),
  an answer box, and an optional "name or email (if you want a reply)" line.
- Answers go to Yana's email through a free form service, no database. Options:
  - **FormSubmit** (recommended): no account, no key; the first answer sends Yana one "confirm"
    email to click, then everything lands in her inbox. Keep her address hidden in the page source.
  - **Web3Forms**: she gets a key on their site (~2 min).
  - mailto fallback: opens the visitor's mail app (zero setup, clunky).
- Waiting on: Yana saying go.

## 2b. Clown mode 🤡

- Hidden toggle (a tiny 🤡 somewhere, or typing "clown"); click again to restore dignity.
- Flavors to pick from:
  - **Everything goes silly**: boxes wobble and tilt, font turns Comic-ish, colors go primary,
    a honk on every click.
  - **Clown car**: boxes keep spilling out of one box, way more than could fit, bouncing around.
  - **Red noses**: little red noses on every image and on her name; cursor becomes a honking nose.
- Waiting on: which flavor (or a mix).

## 3. Stamps

- Click/tap empty canvas to leave a small stamp there. Only on that visitor's screen; gone on reload.
- Waiting on: what the stamps should be.

## 4. Cats I've known + loved

- Not a straightforward card: something hidden/discoverable (e.g. found by double-tapping empty
  space or a tiny cat somewhere).
- **Little cat:** like the one at the bottom of her current portfolio (yanabarysheva.com/portfolio).
  She'll send the image, or draw a small line cat in the site's style. Spots discussed: sitting on /
  peeking over a box (moves with it), bottom corner by the time/weather (blinks or stretches now and
  then), or as the doorway to "cats I've known + loved".

---

## Quick content to-dos (links still placeholders)
- LinkedIn, 2025 portfolio, Substack
- Send-a-cat, Supermarket Layer, Bass Transcriber (example.com right now)
- The exact More Than Borsch page on kurochkagifts.com (goes to the shop homepage now)
- Instagram post link for each of the 4 art pieces (all point to the profile now)
- The animation piece (needs the video/GIF file)

---

## Done
- **Spotify "listening now"**: live on the about card (direct Spotify API; setup page removed;
  how to redo it is in the README).
- **Goodreads "currently reading"**: lists every book on the shelf (reads the public page / widget;
  `?debug=1` on /api/reading shows what Goodreads returned).

## Dropped (for the record)
- **Live chat / inbox app**: built, then removed. Yana didn't want to share her Upstash Redis
  database (used by send cat) with a second project.
- **Shuffle / tidy buttons**: removed; layout just shuffles on each load.
