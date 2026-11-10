/* Bass mode: four strings drop down over the site and you can play them.
   Loaded only when the bass clef is clicked (see js/main.js). Progress: BASS.md.

   Step 1 (this file so far): the stage. Strings, frets, open/close. No sound yet. */

const NS = "http://www.w3.org/2000/svg";
const STRINGS = [
  { name: "E", width: 4 },
  { name: "A", width: 3 },
  { name: "D", width: 2.2 },
  { name: "G", width: 1.5 },
];
const FRETS = 12;
const DOTS = [3, 5, 7, 9, 12];   // fret markers (12 gets two)
const HEADROOM = 76;             // space above the nut (string names; later: pluck open strings)
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let stage = null;   // the open overlay, if any
let opener = null;  // what to give focus back to on close

const el = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

/** Where things sit for a given screen size. Frets are spaced like a real neck:
    each one a little closer than the last (12 frets = half the string length). */
export function neckGeometry(width, height) {
  const neckWidth = Math.min(420, width * 0.82);
  const left = (width - neckWidth) / 2;
  const gap = neckWidth / (STRINGS.length - 1);
  const nutY = HEADROOM;
  const neckLength = height - nutY - 56;
  const fretY = (n) => nutY + (neckLength * (1 - 2 ** (-n / 12))) / 0.5;
  return {
    left,
    right: left + neckWidth,
    nutY,
    stringX: STRINGS.map((_, i) => left + i * gap),
    fretY: Array.from({ length: FRETS + 1 }, (_, n) => fretY(n)), // [0] is the nut
  };
}

function draw(svg) {
  const { innerWidth: W, innerHeight: H } = window;
  const g = neckGeometry(W, H);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();

  // frets (the nut is the thick one at the top)
  g.fretY.forEach((y, n) =>
    svg.append(el("line", { class: n ? "bass__fret" : "bass__nut", x1: g.left - 14, x2: g.right + 14, y1: y, y2: y })));

  // fret markers, halfway between the frets
  const midX = (g.left + g.right) / 2;
  for (const n of DOTS) {
    const y = (g.fretY[n - 1] + g.fretY[n]) / 2;
    const xs = n === 12 ? [(g.stringX[0] + g.stringX[1]) / 2, (g.stringX[2] + g.stringX[3]) / 2] : [midX];
    xs.forEach((x) => svg.append(el("circle", { class: "bass__dot", cx: x, cy: y, r: 4 })));
  }

  // strings: from the very top of the screen to the bottom, thickest first
  STRINGS.forEach((s, i) => {
    const x = g.stringX[i];
    svg.append(el("path", {
      class: "bass__string",
      d: `M ${x} 0 L ${x} ${H}`,
      pathLength: 1,
      "stroke-width": s.width,
      style: `--i: ${i}`,
      "data-string": s.name,
    }));
    const label = el("text", { class: "bass__name", x, y: g.nutY - 22, "text-anchor": "middle", style: `--i: ${i}` });
    label.textContent = s.name;
    svg.append(label);
  });
}

export function openBass(from) {
  if (stage) return;
  opener = from ?? document.activeElement;

  stage = document.createElement("div");
  stage.className = "bass";
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-modal", "true");
  stage.setAttribute("aria-label", "bass mode");

  const svg = el("svg", { class: "bass__neck", "aria-hidden": "true" });
  const close = Object.assign(document.createElement("button"), { type: "button", className: "bass__close", textContent: "×" });
  close.setAttribute("aria-label", "close bass mode");
  close.addEventListener("click", closeBass);
  stage.append(svg, close);

  draw(svg);
  stage.redraw = () => draw(svg);
  addEventListener("resize", stage.redraw);
  addEventListener("keydown", onKey);

  // the site steps back while the bass is out
  document.getElementById("desk").inert = true;
  document.body.classList.add("is-bass");
  document.body.append(stage);
  requestAnimationFrame(() => stage?.classList.add("is-open"));
  close.focus({ preventScroll: true });
}

export function closeBass() {
  if (!stage) return;
  const closing = stage;
  stage = null;
  removeEventListener("resize", closing.redraw);
  removeEventListener("keydown", onKey);

  const finish = () => {
    closing.remove();
    document.getElementById("desk").inert = false;
    opener?.focus?.({ preventScroll: true });
  };
  document.body.classList.remove("is-bass");
  closing.classList.remove("is-open"); // strings pull back up
  if (reduceMotion) finish();
  else setTimeout(finish, 450);
}

function onKey(e) {
  if (e.key === "Escape") closeBass();
}
