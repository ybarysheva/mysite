// Entry point. sky.js (in <head>) has already set the colors; this lays out the boxes and
// fills in the live bits.

import { initLayout, reveal } from "./layout.js";
import { initEmail, initLocal, loadListening, loadReading } from "./widgets.js";

initEmail();
initLocal();

// Wait for the font (box sizes depend on it) and briefly for Spotify/Goodreads, so those boxes
// can be part of the first layout; anything slower finds its spot when it arrives.
const live = Promise.all([loadListening(reveal), loadReading(reveal)]);
await Promise.all([document.fonts.ready, Promise.race([live, new Promise((r) => setTimeout(r, 1200))])]);
initLayout();

setInterval(() => document.visibilityState === "visible" && loadListening(reveal), 60_000);
