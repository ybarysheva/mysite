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

## Notes for later steps
- `neckGeometry(width, height)` in `js/bass.js` gives string x-positions and fret y-positions;
  use it to turn a tap into (string, fret).
- The 76px above the nut is reserved for plucking open strings.
