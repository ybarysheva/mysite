/* Bass mode: a bass neck comes down over the site and you can play it.
   Loaded only when the bass clef is clicked (see js/main.js). Progress: BASS.md.

   Modeled loosely on Yana's bass: an electric Fender Jazz Bass with flatwound strings (smooth,
   polished strings).

   Step 1 (this file so far): the stage. Neck, strings, frets, open/close. No sound yet. */

const NS = "http://www.w3.org/2000/svg";
// top of the screen to bottom, like bass tab: G on top, low E at the bottom
const STRINGS = [
  { name: "G", width: 4 },
  { name: "D", width: 5.5 },
  { name: "A", width: 7 },
  { name: "E", width: 9 },
];
const FRETS = 12;
const VERTICAL_FRETS = 5;        // what fits on a phone held vertically
const DOTS = [3, 5, 7, 9, 12];   // fret markers (12 gets two)
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let stage = null;        // the open overlay, if any
let opener = null;       // what to give focus back to on close
let playVertical = false; // "can't rotate? play it this way" was chosen

const svgEl = (name, attrs = {}) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const htmlEl = (name, props = {}) => Object.assign(document.createElement(name), props);

const isVerticalPhone = () => innerWidth < 640 && innerHeight > innerWidth;

/** Where things sit for a given screen size.
    - nutX: the nut; left of it is open-string territory.
    - fretX[n]: fret n (0 = nut), spaced like a real neck (each a bit closer than the last).
    - stringY(i): height of string i (parallel, evenly spaced). */
export function neckGeometry(width, height, frets = FRETS) {
  const nutX = Math.max(56, width * 0.07);
  const endX = width - 28;                                // the last fret sits here
  const scale = (endX - nutX) / (1 - 2 ** (-frets / 12)); // so fret `frets` lands on endX
  const fretX = Array.from({ length: frets + 1 }, (_, n) => nutX + scale * (1 - 2 ** (-n / 12)));

  const spacing = Math.min(height * 0.14, 60);            // between strings
  const centerY = height / 2;
  const stringY = (i) => centerY + (i - (STRINGS.length - 1) / 2) * spacing;

  return { nutX, endX, fretX, stringY, centerY };
}

function gradient(id, attrs, stops) {
  const g = svgEl("linearGradient", { id, ...attrs });
  for (const [offset, color] of stops) g.append(svgEl("stop", { offset, "stop-color": color }));
  return g;
}

function drawNeck(svg) {
  const { innerWidth: W, innerHeight: H } = window;
  const frets = isVerticalPhone() ? VERTICAL_FRETS : FRETS;
  const g = neckGeometry(W, H, frets);
  const last = STRINGS.length - 1;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();

  const defs = svgEl("defs");
  defs.append(
    // fret wire: a silvery bar with a bright edge
    gradient("bass-fret", {}, [[0, "#6c7076"], [0.4, "#f1f1ee"], [1, "#8f9398"]]),
    gradient("bass-nut", {}, [[0, "#cfc7b0"], [0.45, "#f3eedf"], [1, "#b9b19a"]]),
    // (a level line has no height of its own, so the blur's area is given in screen units)
    Object.assign(svgEl("filter", { id: "bass-soft", filterUnits: "userSpaceOnUse", x: -100, y: -100, width: W + 200, height: H + 200 }), {
      innerHTML: '<feGaussianBlur stdDeviation="2"/>',
    }),
  );
  svg.append(defs);

  // frets and nut: bars a little taller than the strings' span
  const top = g.stringY(0) - 16;
  const bar = (x, w, cls) =>
    svgEl("rect", { class: cls, x: x - w / 2, y: top, width: w, height: g.stringY(last) - top + 16, rx: w / 2 });
  g.fretX.forEach((x, n) => svg.append(n ? bar(x, 4, "bass__fret") : bar(x, 9, "bass__nut")));

  // pearl dots between the frets (two at the 12th)
  for (const n of DOTS.filter((d) => d <= frets)) {
    const x = (g.fretX[n - 1] + g.fretX[n]) / 2;
    const ys = n === 12 ? [(g.stringY(0) + g.stringY(1)) / 2, (g.stringY(2) + g.stringY(3)) / 2] : [g.centerY];
    ys.forEach((y) => svg.append(svgEl("circle", { class: "bass__dot", cx: x, cy: y, r: 5.5 })));
  }

  // strings: smooth, polished flatwounds, level and parallel
  STRINGS.forEach((s, i) => {
    const y = g.stringY(i);
    const d = `M -60 ${y} L ${W + 60} ${y}`;
    defs.append(
      gradient(`bass-metal-${i}`, { gradientUnits: "userSpaceOnUse", x1: 0, x2: 0, y1: y - s.width / 2, y2: y + s.width / 2 }, [
        [0, "#fbfbf9"], [0.22, "#d3d6d8"], [0.6, "#8b8f94"], [1, "#43464b"],
      ]),
    );

    const string = svgEl("g", { class: "bass__string", style: `--i: ${last - i}`, "data-string": s.name }); // E lands first
    string.append(
      svgEl("path", { class: "bass__shadow", d: `M -60 ${y + s.width * 0.9} L ${W + 60} ${y + s.width * 0.9}`, "stroke-width": s.width, filter: "url(#bass-soft)" }),
      svgEl("path", { class: "bass__metal", d, "stroke-width": s.width, stroke: `url(#bass-metal-${i})` }),
    );
    svg.append(string);

    const label = svgEl("text", { class: "bass__name", x: g.nutX - 24, y: y - s.width / 2 - 6, "text-anchor": "middle" });
    label.textContent = s.name;
    svg.append(label);
  });
}

/** Neck, or (on a phone held vertically) a note asking to turn it sideways. */
function render() {
  if (!stage) return;
  const askToTurn = isVerticalPhone() && !playVertical;
  stage.classList.toggle("is-turn", askToTurn);
  if (!askToTurn) drawNeck(stage.querySelector(".bass__neck"));
}

export function openBass(from) {
  if (stage) return;
  opener = from ?? document.activeElement;
  playVertical = false;

  stage = htmlEl("div", { className: "bass" });
  stage.setAttribute("role", "dialog");
  stage.setAttribute("aria-modal", "true");
  stage.setAttribute("aria-label", "bass mode");

  const svg = svgEl("svg", { class: "bass__neck", "aria-hidden": "true" });

  const close = htmlEl("button", { type: "button", className: "bass__close", textContent: "×" });
  close.setAttribute("aria-label", "close bass mode");
  close.addEventListener("click", closeBass);

  const turn = htmlEl("div", { className: "bass__turn" });
  const anyway = htmlEl("button", { type: "button", className: "bass__anyway", textContent: "can't rotate? play it this way" });
  anyway.addEventListener("click", () => {
    playVertical = true;
    render();
  });
  turn.append(
    htmlEl("span", { className: "bass__turn-icon", ariaHidden: "true" }),
    htmlEl("p", { textContent: "turn your phone sideways to play" }),
    anyway,
  );

  stage.append(svg, turn, close);
  addEventListener("resize", render);
  addEventListener("keydown", onKey);

  // the site steps back while the bass is out
  document.getElementById("desk").inert = true;
  document.body.classList.add("is-bass");
  document.body.append(stage);
  render();
  requestAnimationFrame(() => stage?.classList.add("is-open"));
  close.focus({ preventScroll: true });
}

export function closeBass() {
  if (!stage) return;
  const closing = stage;
  stage = null;
  removeEventListener("resize", render);
  removeEventListener("keydown", onKey);

  const finish = () => {
    closing.remove();
    document.getElementById("desk").inert = false;
    opener?.focus?.({ preventScroll: true });
  };
  document.body.classList.remove("is-bass");
  closing.classList.remove("is-open"); // strings slide back up
  if (reduceMotion) finish();
  else setTimeout(finish, 500);
}

function onKey(e) {
  if (e.key === "Escape") closeBass();
}
