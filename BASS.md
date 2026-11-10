# Bass mode: progress

Being built on the `bass-mode` branch (the live site is `claude/elegant-bardeen-w6djzc`).
Design: `IDEAS.md` #1. Code: `js/bass.js`, `bass.css`, small hooks in `index.html` and `js/main.js`.

**Resuming after a pause:** merge the live branch into `bass-mode` first, then continue with the next step.
**Going live:** merge `bass-mode` into the live branch, only when Yana says it's ready.

## Steps
- [x] **1. The stage (no sound).** Clef is a button; strings drop down over fret lines; × / Esc closes.
- [ ] **2. Sound.** Plucked-bass tone in the browser; tap a string, the spot along it picks the note.
- [ ] **3. Feel.** String wobble, note names, strum by swiping, keys 1–4, touch polish.
- [ ] **4. "I don't know what I'm doing" mode.** Lit circles to follow, in a groove and one scale; streak counter.
- [ ] **5. Polish + go live.** Reduced motion, labels, contrast, tidy, docs, merge.

## The bass it's modeled on
Yana plays an electric **Fender Jazz Bass with flatwound strings**. Aim for that:
- **Look:** smooth polished strings (no winding ridges), parallel and evenly spaced,
  silvery frets, ivory nut, pearl dots. No wooden board (she chose strings floating over the sky).
- **Sound (step 2):** warm and thumpy, rolled-off highs, short sustain. Not bright or zingy.

## Notes for later steps
- Strings are horizontal: G on top, low E at the bottom (like tab). Nut on the left.
- `neckGeometry(width, height, frets)` in `js/bass.js` gives `nutX`, `fretX[n]` and `stringY(i)`;
  use it to turn a tap into (string, fret). Left of the nut = open string.
- Each string is a `<g class="bass__string" data-string="E">` holding its shadow + metal paths
  (paths, so step 3 can bend them).
- Phone held vertically: a "turn your phone sideways" note, with a "play it this way" fallback
  (5 frets). Avoid the word "upright" for this: it reads as "upright bass".
