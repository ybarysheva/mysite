/* Layout of the boxes.

   Each category is a cluster: a main box (.card, data-card="work") plus small connected boxes
   (.node, data-parent="work") joined to it by straight lines.

   Desktop: about sits in the middle, work + side projects on the left, writing + art on the
   right, each cluster's small boxes branching outward on one side. Small boxes are tucked
   behind their main box until it's clicked (one cluster open at a time; about stays open).
   Phones: everything open, stacked top to bottom.

   The arrangement is computed (not hand-placed) but seeded, so it's the same on every visit
   for a given screen size. */

import { clamp, overlapArea, distanceToRect, edgeDistance, seededRandom } from "./geometry.js";

const PAD = 16;          // min distance from the canvas edges
const BOTTOM = 40;       // room kept clear at the bottom (corner labels)
const PHONE_MAX = 640;   // narrower than this = phone layout
const SEED = 20261109;
const PEEK = 12;         // how far tucked boxes peek out from behind their main box (px)
const FAN = 0.75;        // angle between tucked boxes (radians)

const desk = document.getElementById("desk");
const cards = [...desk.querySelectorAll(".card")];
const nodes = [...desk.querySelectorAll(".node")];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const byName = (name) => cards.find((c) => c.dataset.card === name);
const parentOf = (node) => byName(node.dataset.parent);
const kidsOf = (card) => nodes.filter((n) => n.dataset.parent === card.dataset.card && !n.hidden);
const visible = () => [...cards, ...nodes.filter((n) => !n.hidden)];
const sizeOf = (el) => ({ w: el.offsetWidth, h: el.offsetHeight });

const isPhone = () => document.documentElement.clientWidth < PHONE_MAX;
const foldable = () => !isPhone();
const alwaysOpen = (card) => card?.dataset.card === "about";

/* ---------- state ---------- */
const pos = new Map();       // element → {x, y} where it's drawn now
const spot = new Map();      // main box → {x, y} where the layout put it
const heading = new Map();   // main box → angle its small boxes branch out at
const offset = new Map();    // small box → {dx, dy} from its main box when open
let openCard = null;         // the one cluster that's open (besides about)
let laidOut = false;
let rng = seededRandom(SEED);

const isOpen = (card) => !foldable() || alwaysOpen(card) || openCard === card;
const rectOf = (el) => ({ ...(pos.get(el) ?? { x: 0, y: 0 }), ...sizeOf(el) });

function place(el, x, y) {
  const p = { x: Math.round(x), y: Math.round(y) };
  el.style.left = `${p.x}px`;
  el.style.top = `${p.y}px`;
  pos.set(el, p);
  wires.queue();
}

/* Stacking: a main box always sits above its own small boxes. */
let z = 10;
function raise(card) {
  const kids = kidsOf(card);
  z += kids.length + 1;
  card.style.zIndex = z;
  kids.forEach((n, i) => (n.style.zIndex = z - 1 - i));
}

/* ---------- connecting lines ---------- */
const wires = (() => {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.classList.add("wires");
  svg.setAttribute("aria-hidden", "true");
  desk.prepend(svg);
  const paths = new Map();
  let queued = false;

  function draw() {
    svg.setAttribute("width", desk.offsetWidth);
    svg.setAttribute("height", desk.offsetHeight);
    for (const node of nodes) {
      const parent = parentOf(node);
      const show = !node.hidden && parent && pos.has(node) && pos.has(parent) && isOpen(parent);
      let path = paths.get(node);
      if (!show) {
        path?.remove();
        paths.delete(node);
        continue;
      }
      if (!path) {
        path = svg.appendChild(document.createElementNS(NS, "path"));
        paths.set(node, path);
      }
      // center to center; the boxes cover the ends
      const a = rectOf(parent), b = rectOf(node);
      path.setAttribute("d", `M ${a.x + a.w / 2} ${a.y + a.h / 2} L ${b.x + b.w / 2} ${b.y + b.h / 2}`);
    }
  }

  return {
    draw,
    queue() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        draw();
      });
    },
  };
})();

/* ---------- placement ---------- */

// On desktop only one cluster (plus about) is open at a time, so small boxes of two different
// folding clusters never show together and may share space.
const canShare = (a, b) =>
  foldable() && !a.main && !b.main && a.owner !== b.owner && !alwaysOpen(a.owner) && !alwaysOpen(b.owner);
const badOverlap = (a, b) => !canShare(a, b) && overlapArea(a, b) > 0;

// Smaller screens pack things a little tighter (1 on a big screen, down to 0.6).
const roomScale = () => clamp((desk.clientWidth * innerHeight) / (1440 * 900), 0.6, 1);

/** Put a small box near its main box, on the cluster's side, not on top of anything. */
function placeNear(node, placed) {
  const parent = parentOf(node);
  const a = rectOf(parent);
  const s = sizeOf(node);
  const W = desk.clientWidth, H = desk.clientHeight;
  const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  const crowd = kidsOf(parent).length;
  const k = roomScale();
  const dir = heading.get(parent);
  const spread = (Math.min(70 + crowd * 14, 130) * Math.PI) / 180;
  const me = { main: false, owner: parent };
  let best = null, bestScore = Infinity;

  for (let i = 0; i < 500; i++) {
    const t = dir === undefined ? rng.between(0, 2 * Math.PI) : dir + rng.between(-spread / 2, spread / 2);
    const gap = rng.between(26 * k, (70 + crowd * 35) * k);
    const dist = edgeDistance(a.w, a.h, t) + gap + edgeDistance(s.w, s.h, t);
    const x = clamp(cx + Math.cos(t) * dist - s.w / 2, PAD, W - s.w - PAD);
    const y = clamp(cy + Math.sin(t) * dist - s.h / 2, PAD, H - s.h - BOTTOM);
    const air = 10 * k;
    const roomy = { x: x - air, y: y - air, w: s.w + 2 * air, h: s.h + 2 * air };
    const mx = x + s.w / 2, my = y + s.h / 2;
    const ownDist = distanceToRect(mx, my, a);

    let score = gap * 14; // prefer close
    for (const o of placed) {
      if (!canShare(me, o)) score += overlapArea(roomy, o) * 10; // don't cover anything
      // clearly belong to its own main box, not look like part of another cluster
      if (o.main && o.owner !== parent && distanceToRect(mx, my, o) < ownDist + 40) score += 40000;
    }
    if (score < bestScore) [bestScore, best] = [score, { x, y, w: s.w, h: s.h }];
  }
  place(node, best.x, best.y);
  placed.push({ ...best, main: false, owner: parent, el: node });
}

/** Second chance for any small box that still overlaps something. */
function tidyUp(placed) {
  for (let pass = 0; pass < 3; pass++) {
    let moved = 0;
    for (const item of placed.filter((p) => !p.main)) {
      if (!placed.some((o) => o !== item && badOverlap(item, o))) continue;
      placed.splice(placed.indexOf(item), 1);
      placeNear(item.el, placed);
      moved++;
    }
    if (!moved) break;
  }
}

/** Overlaps + small boxes sitting nearer another cluster's main box. 0 = good. */
function problems(placed) {
  const mains = placed.filter((p) => p.main);
  let n = 0;
  placed.forEach((p, i) => {
    for (let j = i + 1; j < placed.length; j++) if (badOverlap(p, placed[j])) n++;
    if (p.main) return;
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    const own = distanceToRect(cx, cy, mains.find((m) => m.el === p.owner));
    if (mains.some((m) => m.el !== p.owner && distanceToRect(cx, cy, m) < own)) n++;
  });
  return n;
}

/** Desktop: about in the middle, the two pairs on either side, branches pointing outward. */
function arrangeDesktop(order, roomier = 1) {
  const W = desk.clientWidth, VH = innerHeight;
  const about = order[0];
  const areaOf = (els) => els.reduce((t, el) => t + el.offsetWidth * el.offsetHeight, 0);

  // only one folding cluster shows at a time, so size the canvas for the biggest one
  const kidAreas = order.filter((c) => !alwaysOpen(c)).map((c) => areaOf(kidsOf(c)));
  const total = areaOf(cards) + areaOf(kidsOf(about)) + (foldable() ? Math.max(0, ...kidAreas) * 2 : kidAreas.reduce((t, v) => t + v, 0));
  const H = Math.round(Math.max(VH, Math.ceil(total / (W * 0.42)) + BOTTOM) * roomier);
  desk.style.height = `${H}px`;

  // where each main box aims for (fractions of the canvas)
  const aims = new Map([[about, { sx: 0.5, sy: Math.min(0.42, (VH * 0.42) / H) }]]);
  [["work", "projects"], ["writing", "art"]].forEach((pair, side) =>
    pair.map(byName).filter(Boolean).forEach((card, row) =>
      aims.set(card, { sx: side ? 0.83 : 0.17, sy: row ? 0.72 : 0.22 })));
  const mid = aims.get(about);
  const outward = (aim) => Math.atan2((aim.sy - mid.sy) * H, (aim.sx - mid.sx) * W);
  const offCanvas = (r) => r.w * r.h - overlapArea(r, { x: 0, y: 0, w: W, h: H });

  const placed = []; // every box placed so far
  const zones = [];  // main boxes + the patch each cluster's branches need
  for (const card of order) {
    const s = sizeOf(card);
    const kidsArea = areaOf(kidsOf(card));
    const S = clamp(Math.sqrt(kidsArea * 2.6), 110, 460) * roomScale();
    const aim = aims.get(card) ?? { sx: rng.between(0.2, 0.8), sy: rng.between(0.2, 0.8) };
    const maxX = W - s.w - PAD, maxY = H - s.h - BOTTOM;
    let best = null, bestScore = Infinity;

    for (let i = 0; i < 400; i++) {
      const x = clamp(aim.sx * W + rng.between(-0.09, 0.09) * W - s.w / 2, PAD, maxX);
      const y = clamp(aim.sy * H + rng.between(-0.1, 0.1) * H - s.h / 2, PAD, maxY);
      const dir = Math.floor(rng.between(0, 8)) * (Math.PI / 4); // one of 8 directions
      // branches point away from the middle (about's can go any way but up)
      if (card === about ? Math.sin(dir) < -0.1 : Math.cos(dir - outward(aim)) < -0.05) continue;

      const box = { x: x - 36, y: y - 36, w: s.w + 72, h: s.h + 72 };
      const reach = edgeDistance(s.w, s.h, dir) + 30 + S / 2;
      const bx = x + s.w / 2 + Math.cos(dir) * reach, by = y + s.h / 2 + Math.sin(dir) * reach;
      const branch = { x: bx - S / 2, y: by - S / 2, w: S, h: S };

      let score = Math.hypot(x + s.w / 2 - aim.sx * W, y + s.h / 2 - aim.sy * H) * 20; // stay near the aim
      for (const o of zones) {
        score += overlapArea(box, o) * (o.main ? 3 : 1);
        const share = foldable() && !o.main && !alwaysOpen(o.owner) && !alwaysOpen(card);
        if (kidsArea && !share) score += overlapArea(branch, o) * 0.6;
      }
      if (kidsArea) score += offCanvas(branch) * 1.5; // the branches need room on the canvas
      if (score < bestScore) [bestScore, best] = [score, { x, y, dir, box, branch }];
    }

    place(card, best.x, best.y);
    heading.set(card, best.dir);
    placed.push({ x: best.x, y: best.y, ...s, main: true, owner: card, el: card });
    zones.push({ ...best.box, main: true, owner: card });
    if (kidsArea) zones.push({ ...best.branch, owner: card });
  }
  for (const card of order) rng.shuffle(kidsOf(card)).forEach((n) => placeNear(n, placed));
  tidyUp(placed);
  return placed.map((p) => ({ ...p, ...rectOf(p.el) }));
}

/** Phones: each main box (zig-zagging a little), then its small boxes in rows below it. */
function arrangePhone(order) {
  const VW = document.documentElement.clientWidth;
  let y = PAD;
  order.forEach((card, i) => {
    const s = sizeOf(card);
    const maxX = Math.max(PAD, VW - s.w - PAD);
    place(card, i % 2 ? maxX - rng.between(0, 10) : PAD + rng.between(0, 10), y);
    heading.set(card, Math.PI / 2);
    y += s.h + 26;

    let x = PAD + 14, rowH = 0;
    for (const n of kidsOf(card)) {
      const k = sizeOf(n);
      if (x > PAD + 30 && x + k.w > VW - PAD) [y, x, rowH] = [y + rowH + 12, PAD + 14, 0];
      place(n, Math.min(x, Math.max(PAD, VW - k.w - PAD)), y);
      x += k.w + 14;
      rowH = Math.max(rowH, k.h);
    }
    y += rowH + 42;
  });
  desk.style.height = `${Math.max(innerHeight, y + BOTTOM)}px`;
}

function arrange() {
  rng = seededRandom(SEED); // same layout every time
  heading.clear();
  const order = ["about", "work", "projects", "writing", "art"].map(byName).filter(Boolean);
  for (const c of cards) if (!order.includes(c)) order.push(c); // any new category

  if (isPhone()) {
    arrangePhone(order);
  } else {
    // a few tries; if none is clean, give the canvas a little more height; keep the best
    let best = null;
    for (let attempt = 0; attempt < 16; attempt++) {
      const placed = arrangeDesktop(order, attempt < 10 ? 1 : 1 + (attempt - 9) * 0.08);
      const n = problems(placed);
      if (!best || n < best.n) best = { n, height: desk.style.height, at: placed.map((p) => [p.el, p.x, p.y]) };
      if (n === 0) break;
    }
    desk.style.height = best.height;
    best.at.forEach(([el, x, y]) => place(el, x, y));
  }

  for (const card of cards) spot.set(card, pos.get(card));
  nodes.forEach(rememberOffset);
  order.forEach(raise);
  if (byName("about")) raise(byName("about"));
  openCard = null;
  applyFolds();
  wires.draw();
}

function rememberOffset(node) {
  const p = pos.get(node), m = pos.get(parentOf(node));
  if (p && m) offset.set(node, { dx: p.x - m.x, dy: p.y - m.y });
}

/* ---------- folding ---------- */

/** Put every small box either at its spot (open) or tucked behind its main box (folded). */
function applyFolds() {
  for (const card of cards) {
    const m = pos.get(card);
    if (!m) continue;
    const a = sizeOf(card);
    const dir = heading.get(card) ?? Math.PI / 2;
    const kids = kidsOf(card);
    const folded = !isOpen(card);

    kids.forEach((node, i) => {
      const s = sizeOf(node);
      const t = dir + (i - (kids.length - 1) / 2) * FAN; // fanned around the cluster's side
      const tilt = (i % 2 ? -1 : 1) * (2.5 + (i % 3) * 1.2);
      node.style.setProperty("--peek-x", `${(Math.cos(t) * 9).toFixed(1)}px`);
      node.style.setProperty("--peek-y", `${(Math.sin(t) * 9).toFixed(1)}px`);
      node.style.setProperty("--tilt", `${tilt.toFixed(1)}deg`);
      node.style.setProperty("--tilt-out", `${(tilt * 2.2).toFixed(1)}deg`);
      node.classList.toggle("is-folded", folded);
      node.inert = folded;

      if (folded) {
        const reach = edgeDistance(a.w, a.h, t) - edgeDistance(s.w, s.h, t) + PEEK;
        place(node, m.x + a.w / 2 + Math.cos(t) * reach - s.w / 2, m.y + a.h / 2 + Math.sin(t) * reach - s.h / 2);
      } else {
        const o = offset.get(node);
        if (o) place(node, clamp(m.x + o.dx, 0, desk.clientWidth - s.w), clamp(m.y + o.dy, 0, desk.clientHeight - s.h));
      }
    });

    const button = foldable() && !alwaysOpen(card) && kids.length > 0;
    card.toggleAttribute("tabindex", button);
    if (button) {
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      card.setAttribute("aria-expanded", String(!folded));
    } else {
      card.removeAttribute("role");
      card.removeAttribute("aria-expanded");
    }
  }
  wires.queue();
}

function toggle(card) {
  if (!foldable() || alwaysOpen(card) || !kidsOf(card).length) return;
  openCard = openCard === card ? null : card;
  if (!reduceMotion) {
    desk.classList.add("is-unfolding");
    clearTimeout(toggle.timer);
    toggle.timer = setTimeout(() => desk.classList.remove("is-unfolding"), 500);
  }
  raise(card);
  applyFolds();
}

/* ---------- interaction ---------- */
function wireUpCards() {
  for (const card of cards) {
    card.addEventListener("click", () => toggle(card));
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && card.getAttribute("role") === "button") {
        e.preventDefault();
        toggle(card);
      }
    });
    // hovering a closed main box fans its tucked boxes out a little: "there's more here"
    const peek = (on) => kidsOf(card).forEach((n) => n.classList.toggle("is-peeking", on));
    card.addEventListener("pointerenter", () => peek(true));
    card.addEventListener("pointerleave", () => peek(false));
  }
}

/* Resizing never re-runs the layout: main boxes keep their spots (sliding in only if they'd
   hang off the edge) and small boxes follow. */
function keepInView() {
  for (const card of cards) {
    const s = spot.get(card);
    if (s) place(card, clamp(s.x, 0, desk.clientWidth - card.offsetWidth - PAD), s.y);
  }
  applyFolds();
  wires.draw();
}

/* ---------- public ---------- */

export function initLayout() {
  desk.classList.add("is-live");
  document.body.classList.add("is-live");
  wireUpCards();
  arrange();
  laidOut = true;

  // fade the boxes in one by one
  if (!reduceMotion) {
    const els = visible().sort((a, b) => a.style.zIndex - b.style.zIndex);
    els.forEach((el, i) => (el.style.transitionDelay = `${Math.min(i * 45, 900)}ms`));
    setTimeout(() => els.forEach((el) => (el.style.transitionDelay = "")), 1600);
  }
  requestAnimationFrame(() => desk.classList.add("is-ready"));

  let timer;
  addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(keepInView, 100);
  });
}

/** A small box that shows up after the layout (e.g. "last played") finds a spot near its main box. */
export function reveal(node) {
  node.hidden = false;
  if (!laidOut || pos.has(node)) return wires.queue();
  const placed = visible()
    .filter((el) => el !== node && pos.has(el))
    .map((el) => {
      const main = el.classList.contains("card");
      return { ...rectOf(el), main, owner: main ? el : parentOf(el), el };
    });
  placeNear(node, placed);
  rememberOffset(node);
  raise(parentOf(node));
  applyFolds();
}
