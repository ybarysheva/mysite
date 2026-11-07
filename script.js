(() => {
  const desk = document.getElementById("desk");
  if (!desk) return;

  /* Each category is a cluster: a main box (.card) plus small connected boxes (.node)
     whose data-parent is the main box's data-card. Straight lines join them. */
  const cards = [...desk.querySelectorAll(".card")];
  const nodes = [...desk.querySelectorAll(".node")];
  const parentOf = (node) => cards.find((c) => c.dataset.card === node.dataset.parent);
  const kidsOf = (card) => nodes.filter((n) => n.dataset.parent === card.dataset.card && !n.hidden);
  const shown = () => [...cards, ...nodes.filter((n) => !n.hidden)];
  const hint = document.querySelector(".hint");

  const PAD = 16;      // min distance from screen edges
  const BOTTOM = 40;   // breathing room at the bottom (keeps clear of the corner labels)
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pos = new Map();   // where each box is drawn right now
  const home = new Map();  // where it was put (by the shuffle or by a drag)
  const heading = new Map(); // which way each cluster's small boxes branch out (radians)
  let z = 10;

  /* ---------- helpers ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const shuffled = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const overlapArea = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  };
  const sizeOf = (el) => ({ w: el.offsetWidth, h: el.offsetHeight });
  const rectOf = (el) => ({ ...(pos.get(el) || { x: 0, y: 0 }), ...sizeOf(el) });

  function place(el, x, y, { remember = true } = {}) {
    x = Math.round(x);
    y = Math.round(y);
    el.style.left = x + "px";
    el.style.top = y + "px";
    pos.set(el, { x, y });
    if (remember) home.set(el, { x, y });
    queueWires();
  }

  function toFront(el) {
    el.style.zIndex = ++z;
  }
  // a main box comes forward with its whole cluster (small boxes on top)
  function clusterToFront(card) {
    toFront(card);
    kidsOf(card).forEach(toFront);
  }

  /* ---------- folding (desktop) ----------
     A cluster's small boxes either sit at their spots (open) or tuck behind the main box,
     peeking out a little toward their side (folded). One cluster opens at a time; about
     stays open. Phones keep everything open. */
  const foldable = () => !isPhone();
  const openNow = new Set();     // main boxes whose small boxes are out
  const offset = new Map();      // small box → where it sits relative to its main box when open
  const isOpen = (card) => !foldable() || alwaysOpen(card) || openNow.has(card);
  const isFolded = (node) => !isOpen(parentOf(node));

  function remember(node) {
    const p = pos.get(node), m = pos.get(parentOf(node));
    if (p && m) offset.set(node, { dx: p.x - m.x, dy: p.y - m.y });
  }

  function applyFolds() {
    for (const card of cards) {
      const m = pos.get(card);
      if (!m) continue;
      const a = sizeOf(card);
      const dir = heading.get(card) ?? Math.PI / 2;
      kidsOf(card).forEach((node, i) => {
        const o = offset.get(node);
        const s = sizeOf(node);
        const folded = !isOpen(card);
        node.classList.toggle("is-folded", folded);
        // which way to nudge it on hover (toward the side it opens to)
        node.style.setProperty("--peek-x", (Math.cos(dir) * 7).toFixed(1) + "px");
        node.style.setProperty("--peek-y", (Math.sin(dir) * 7).toFixed(1) + "px");
        node.inert = folded;
        if (folded) {
          // tucked behind, its far edge peeking out past the main box's edge
          const reach = edge(a.w, a.h, dir) - edge(s.w, s.h, dir) + 7 + i * 5;
          place(node, m.x + a.w / 2 + Math.cos(dir) * reach - s.w / 2, m.y + a.h / 2 + Math.sin(dir) * reach - s.h / 2, { remember: false });
          node.style.zIndex = (parseInt(card.style.zIndex, 10) || 10) - 1 - i;
        } else if (o) {
          place(node, clamp(m.x + o.dx, 0, desk.clientWidth - s.w), clamp(m.y + o.dy, 0, desk.clientHeight - s.h), { remember: false });
          node.style.zIndex = ++z;
        }
      });
      if (foldable() && !alwaysOpen(card)) {
        card.setAttribute("role", "button");
        card.tabIndex = 0;
        card.setAttribute("aria-expanded", String(isOpen(card)));
      } else {
        card.removeAttribute("role");
        card.removeAttribute("tabindex");
        card.removeAttribute("aria-expanded");
      }
    }
    queueWires();
  }

  function toggle(card) {
    if (!foldable() || alwaysOpen(card) || !kidsOf(card).length) return;
    const opening = !openNow.has(card);
    openNow.clear();
    if (opening) openNow.add(card);
    if (!reduceMotion) {
      desk.classList.add("is-unfolding");
      clearTimeout(toggle.t);
      toggle.t = setTimeout(() => desk.classList.remove("is-unfolding"), 500);
    }
    clusterToFront(card);
    applyFolds();
    hideHint();
  }

  /* ---------- connecting lines ---------- */
  const NS = "http://www.w3.org/2000/svg";
  const wires = document.createElementNS(NS, "svg");
  wires.setAttribute("class", "wires");
  wires.setAttribute("aria-hidden", "true");
  desk.prepend(wires);
  const paths = new Map();

  function drawWires() {
    wires.setAttribute("width", desk.offsetWidth);
    wires.setAttribute("height", desk.offsetHeight);
    for (const node of nodes) {
      let path = paths.get(node);
      const parent = parentOf(node);
      if (node.hidden || !parent || !pos.has(node) || !pos.has(parent) || isFolded(node)) {
        if (path) path.remove(), paths.delete(node);
        continue;
      }
      if (!path) {
        path = document.createElementNS(NS, "path");
        wires.appendChild(path);
        paths.set(node, path);
      }
      // straight line between the two boxes' centers (the boxes cover the ends)
      const a = rectOf(parent), b = rectOf(node);
      path.setAttribute("d", `M ${a.x + a.w / 2} ${a.y + a.h / 2} L ${b.x + b.w / 2} ${b.y + b.h / 2}`);
    }
  }
  let wiresQueued = false;
  function queueWires() {
    if (wiresQueued) return;
    wiresQueued = true;
    requestAnimationFrame(() => {
      wiresQueued = false;
      drawWires();
    });
  }

  /* Phones get a canvas about two screens wide that you swipe around;
     desktop's canvas is just the window (taller if needed). */
  const viewportWidth = () => document.documentElement.clientWidth;
  const isPhone = () => viewportWidth() < 640;
  function sizeDesk() {
    desk.style.width = isPhone() ? Math.max(viewportWidth() * 2, 760) + "px" : "";
  }

  const byName = (name) => cards.find((c) => c.dataset.card === name);
  const pairOf = (...names) => names.map(byName).filter(Boolean);

  // Smaller screens pack things a bit closer together (1 on a big screen, down to 0.6).
  const roomScale = () => clamp((desk.clientWidth * window.innerHeight) / (1440 * 900), 0.6, 1);

  // Where a line from a box's center at angle t leaves the box (distance to its edge).
  const edge = (w, h, t) => Math.min(w / 2 / Math.max(Math.abs(Math.cos(t)), 1e-6), h / 2 / Math.max(Math.abs(Math.sin(t)), 1e-6));

  /* Put a small box near its main box: tries lots of spots in a ring around it and
     keeps one close by that doesn't sit on top of other boxes. */
  function placeNear(node, placed) {
    const parent = parentOf(node);
    const a = rectOf(parent);
    const s = sizeOf(node);
    const W = desk.clientWidth, H = desk.clientHeight;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    let best = null, bestScore = Infinity;
    const crowd = kidsOf(parent).length; // bigger families get to spread out further
    const k = roomScale();
    // all of a cluster's small boxes branch out on one side of its main box
    const dir = heading.get(parent);
    const spread = (Math.min(70 + crowd * 14, 130) * Math.PI) / 180;
    for (let i = 0; i < 500; i++) {
      const t = dir === undefined ? rand(0, Math.PI * 2) : dir + rand(-spread / 2, spread / 2);
      const gap = rand(26 * k, (70 + crowd * 35) * k);
      const dist = edge(a.w, a.h, t) + gap + edge(s.w, s.h, t);
      const x = clamp(cx + Math.cos(t) * dist - s.w / 2, PAD, W - s.w - PAD);
      const y = clamp(cy + Math.sin(t) * dist - s.h / 2, PAD, H - s.h - BOTTOM);
      const r = { x, y, w: s.w, h: s.h };
      const air = 10 * k; // keep a little air around boxes
      const roomy = { x: x - air, y: y - air, w: s.w + 2 * air, h: s.h + 2 * air };
      const mx = x + s.w / 2, my = y + s.h / 2;
      const ownDist = toRect(mx, my, a);
      let score = gap * 14;
      const me = { main: false, owner: parent };
      for (const o of placed) {
        if (!canShare(me, o)) score += overlapArea(roomy, o) * 10; // nothing should sit on top of anything else
        // it should clearly belong to its own main box, not look like part of another cluster
        if (o.main && o.owner !== parent && toRect(mx, my, o) < ownDist + 40) score += 40000;
      }
      if (score < bestScore) { bestScore = score; best = r; }
    }
    place(node, best.x, best.y);
    placed.push({ ...best, main: false, owner: parent, el: node });
  }

  // On desktop only one cluster (plus about) is open at a time, so small boxes from two
  // different folding clusters never show together and may share space.
  const alwaysOpen = (card) => card && card.dataset.card === "about";
  const canShare = (a, b) => foldable() && !a.main && !b.main && a.owner !== b.owner && !alwaysOpen(a.owner) && !alwaysOpen(b.owner);
  // boxes shouldn't cover each other (every one has text or a link on it)
  const badOverlap = (a, b) => !canShare(a, b) && overlapArea(a, b) > 0;

  /* After everything's placed: any small box still sitting on a main box or on another
     cluster's box gets a second try (now that it can see where everything ended up). */
  function tidyUp(placed) {
    for (let pass = 0; pass < 3; pass++) {
      let moved = 0;
      for (const item of placed.filter((p) => !p.main)) {
        const clash = placed.some((o) => o !== item && badOverlap(item, o));
        if (!clash) continue;
        placed.splice(placed.indexOf(item), 1);
        placeNear(item.el, placed);
        moved++;
      }
      if (!moved) break;
    }
  }
  // distance from a point to the nearest edge of a box (0 if inside)
  function toRect(px, py, r) {
    const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
    const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
    return Math.hypot(dx, dy);
  }

  /* ---------- layout: desktop ----------
     Clusters land randomly but spread out: each main box keeps some room around it
     for its small boxes, which then gather around it. About always lands in the first
     screenful. */
  function scatter(order, roomier = 1) {
    const W = desk.clientWidth;
    const VW = viewportWidth();
    const VH = window.innerHeight;
    // only one cluster's small boxes show at a time (plus about's), so size for that
    const areaOf = (els) => els.reduce((t, el) => { const o = sizeOf(el); return t + o.w * o.h; }, 0);
    const kidAreas = order.filter((c) => !alwaysOpen(c)).map((c) => areaOf(kidsOf(c)));
    const total = areaOf(cards) + areaOf(kidsOf(order[0])) + (foldable() ? Math.max(0, ...kidAreas) * 2 : kidAreas.reduce((t, v) => t + v, 0));
    const H = Math.round(Math.max(VH, Math.ceil(total / (W * 0.42)) + BOTTOM) * roomier);
    desk.style.height = H + "px";

    // how much room each cluster's small boxes need (a square patch on one side of the main box)
    const patch = new Map(order.map((c) => {
      const kidsArea = kidsOf(c).reduce((s, n) => { const o = sizeOf(n); return s + o.w * o.h; }, 0);
      return [c, clamp(Math.sqrt(kidsArea * 2.6), 110, 460) * roomScale()];
    }));
    const offCanvas = (r) => r.w * r.h - overlapArea(r, { x: 0, y: 0, w: W, h: H });

    const placed = [];     // every box placed so far
    const zones = [];      // main boxes + their surrounding room
    const about = order[0];

    /* The composition: about in the middle; work + side projects together on one side,
       writing + art together on the other (which side, and which is on top, shuffles).
       Each main box lands near its spot; its small boxes branch outward, never back
       toward the middle. */
    const spots = new Map([[about, { sx: 0.5, sy: Math.min(0.42, (VH * 0.42) / H) }]]);
    const pairs = shuffled([pairOf("work", "projects"), pairOf("writing", "art")]);
    pairs.forEach((pair, side) => {
      shuffled(pair).forEach((card, row) => spots.set(card, { sx: side ? 0.83 : 0.17, sy: row ? 0.72 : 0.22 }));
    });
    const mid = spots.get(about);
    const outward = (card) => {
      const sp = spots.get(card);
      return Math.atan2((sp.sy - mid.sy) * H, (sp.sx - mid.sx) * W);
    };

    for (const card of order) {
      const s = sizeOf(card);
      const S = patch.get(card);
      const hasKids = kidsOf(card).length > 0;
      const maxX = W - s.w - PAD, maxY = H - s.h - BOTTOM;
      const sp = spots.get(card) || { sx: rand(0.2, 0.8), sy: rand(0.2, 0.8) };
      let best = null, bestScore = Infinity;
      for (let i = 0; i < 400; i++) {
        const x = clamp(sp.sx * W + rand(-0.09, 0.09) * W - s.w / 2, PAD, maxX);
        const y = clamp(sp.sy * H + rand(-0.1, 0.1) * H - s.h / 2, PAD, maxY);
        const dir = (Math.floor(rand(0, 8)) * Math.PI) / 4; // one of 8 directions
        // branches point away from the middle (about's own can go any way but up)
        if (card === about ? Math.sin(dir) < -0.1 : Math.cos(dir - outward(card)) < -0.05) continue;
        const box = { x: x - 36, y: y - 36, w: s.w + 72, h: s.h + 72 };
        const reach = edge(s.w, s.h, dir) + 30 + S / 2;
        const cx = x + s.w / 2 + Math.cos(dir) * reach, cy = y + s.h / 2 + Math.sin(dir) * reach;
        const branch = { x: cx - S / 2, y: cy - S / 2, w: S, h: S };
        let score = 0;
        for (const o of zones) {
          score += overlapArea(box, o) * (o.main ? 3 : 1);
          const share = foldable() && !o.main && !alwaysOpen(o.owner) && !alwaysOpen(card);
          if (hasKids && !share) score += overlapArea(branch, o) * 0.6;
        }
        if (hasKids) score += offCanvas(branch) * 1.5; // its side needs to have room on the canvas
        score += Math.hypot(x + s.w / 2 - sp.sx * W, y + s.h / 2 - sp.sy * H) * 20; // stay near its spot
        if (score < bestScore) { bestScore = score; best = { x, y, dir, box, branch }; }
      }
      place(card, best.x, best.y);
      heading.set(card, best.dir);
      placed.push({ x: best.x, y: best.y, ...s, main: true, owner: card, el: card });
      zones.push({ ...best.box, main: true, owner: card });
      if (hasKids) zones.push({ ...best.branch, owner: card });
    }
    for (const card of order) shuffled(kidsOf(card)).forEach((n) => placeNear(n, placed));
    tidyUp(placed);
    return placed.map((p) => ({ ...p, ...rectOf(p.el) })); // where everything really ended up
  }

  // How many problems does this arrangement have? (boxes on top of each other, or a small box
  // sitting nearer some other cluster's main box than its own). 0 = good.
  function problems(placed) {
    const mains = placed.filter((p) => p.main);
    let n = 0;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) if (badOverlap(placed[i], placed[j])) n++;
      const p = placed[i];
      if (p.main) continue;
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const own = toRect(cx, cy, mains.find((m) => m.el === p.owner));
      if (mains.some((m) => m.el !== p.owner && toRect(cx, cy, m) < own)) n++;
    }
    return n;
  }

  /* ---------- layout: phones ----------
     Top to bottom: each main box (zig-zagging left/right), then its small boxes in
     loose rows just below it, then the next category. About is first. The canvas
     still has room to the right to drag things out into. */
  function stack(order) {
    const VW = viewportWidth();
    let y = PAD + rand(0, 8);
    order.forEach((card, i) => {
      const s = sizeOf(card);
      const maxX = Math.max(PAD, VW - s.w - PAD);
      place(card, i % 2 === 0 ? Math.min(maxX, PAD + rand(0, 10)) : Math.max(PAD, maxX - rand(0, 10)), y);
      y += s.h + rand(22, 30);

      // small boxes flow in rows under it
      let x = PAD + rand(8, 22), rowH = 0;
      for (const n of kidsOf(card)) {
        const k = sizeOf(n);
        if (x > PAD + 30 && x + k.w > VW - PAD) { y += rowH + 12; x = PAD + rand(8, 22); rowH = 0; }
        place(n, Math.min(x, Math.max(PAD, VW - k.w - PAD)), y + rand(-3, 3));
        x += k.w + rand(10, 18);
        rowH = Math.max(rowH, k.h);
      }
      y += rowH + rand(36, 48);
    });
    desk.style.height = Math.max(window.innerHeight, y + BOTTOM) + "px";
  }

  function layout() {
    sizeDesk();
    heading.clear();
    const about = byName("about");
    // about first; then work + side projects together and writing + art together (shuffled)
    const order = [about, ...shuffled([pairOf("work", "projects"), pairOf("writing", "art")]).flatMap(shuffled)].filter(Boolean);
    for (const c of cards) if (!order.includes(c)) order.push(c); // any other category
    if (isPhone()) {
      order.forEach((c) => heading.set(c, Math.PI / 2)); // phones: small boxes sit below their main box
      stack(order);
    }
    else {
      // try a few shuffles; if it's still crowded, give the canvas a little more height
      // (each try takes a few milliseconds); if none is perfect, keep the best one
      let best = null;
      for (let attempt = 0; attempt < 16; attempt++) {
        const placed = scatter(order, attempt < 10 ? 1 : 1 + (attempt - 9) * 0.08);
        const n = problems(placed);
        if (!best || n < best.n) best = { n, height: desk.style.height, spots: placed.map((p) => [p.el, p.x, p.y]) };
        if (n === 0) break;
      }
      desk.style.height = best.height;
      best.spots.forEach(([el, x, y]) => place(el, x, y));
    }
    // stacking: clusters in random order, about's on top; small boxes above their main box
    shuffled(order.slice(1)).forEach(clusterToFront);
    if (about) clusterToFront(about);
    nodes.forEach(remember);
    openNow.clear();
    applyFolds();
    drawWires();
  }

  /* ---------- dragging ----------
     Mouse: drag any box from anywhere (a click without dragging still follows links).
     Touch: swiping moves around the canvas. To move a box, drag a main box by its
     top bar, or press and hold any box (~0.4s) until it lifts.
     Dragging a main box brings its small boxes along. */
  const HOLD_MS = 400; // how long to hold before a box lifts
  const SLOP = 8;      // finger can wobble this much (px) and still count as holding
  let holding = false; // a touch is waiting to become a hold
  let lifted = false;  // a box is being moved by touch: don't scroll the page
  let swallowClick = false;

  // While a box is lifted, stop the page from scrolling under the finger.
  document.addEventListener("touchmove", (e) => { if (lifted) e.preventDefault(); }, { passive: false });
  // No long-press menus / link previews while holding a box.
  document.addEventListener("contextmenu", (e) => { if (holding || lifted) e.preventDefault(); });
  // A drag or hold that started on a link shouldn't open the link when you let go.
  document.addEventListener("click", (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  // No browser "drag the link/image" ghost; we move the boxes ourselves.
  desk.addEventListener("dragstart", (e) => e.preventDefault());

  function makeDraggable(el, { handle, followers = () => [], onFront, onTap, onDrop }) {
    const deskBounds = (box) => ({ maxX: desk.clientWidth - box.offsetWidth, maxY: desk.clientHeight - box.offsetHeight });

    function drag(startEvent, { liftedByHold = false } = {}) {
      const start = { x: startEvent.clientX, y: startEvent.clientY };
      const origin = { ...pos.get(el) };
      const crew = followers().map((f) => ({ f, o: { ...pos.get(f) } }));
      let moved = false;
      const begin = () => {
        moved = true;
        el.classList.add("is-dragging");
        document.body.classList.add("is-grabbing");
        hideHint();
        // Only grab the pointer once it's really a drag, so a plain click still reaches
        // links inside a box (like the ↗ on an art piece).
        try { el.setPointerCapture(startEvent.pointerId); } catch (_) {}
      };
      if (liftedByHold) {
        lifted = true;
        el.classList.add("is-lifted");
        begin();
      }

      const move = (ev) => {
        if (ev.pointerId !== startEvent.pointerId) return;
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved) {
          if (Math.hypot(dx, dy) < 3) return;
          begin();
        }
        const b = deskBounds(el);
        const nx = clamp(origin.x + dx, 0, b.maxX), ny = clamp(origin.y + dy, 0, b.maxY);
        place(el, nx, ny);
        // the cluster comes along by the same amount
        for (const { f, o } of crew) {
          const fb = deskBounds(f);
          place(f, clamp(o.x + nx - origin.x, 0, fb.maxX), clamp(o.y + ny - origin.y, 0, fb.maxY));
        }
      };

      const end = (ev) => {
        if (ev.pointerId !== startEvent.pointerId) return;
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        el.classList.remove("is-dragging", "is-lifted");
        document.body.classList.remove("is-grabbing");
        if (liftedByHold) lifted = false;
        if (!moved && !liftedByHold && onTap) onTap();
        if (moved && onDrop) onDrop();
        if (moved || liftedByHold) {
          swallowClick = true;
          setTimeout(() => (swallowClick = false), 400); // in case no click follows
        }
      };

      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    }

    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const touch = e.pointerType !== "mouse";
      if (e.target.closest("button")) return;
      e.stopPropagation();

      // Mouse, or touch on a main box's top bar: drag right away.
      if (!touch || (handle && e.target.closest(handle))) {
        e.preventDefault();
        onFront();
        drag(e);
        return;
      }

      // Touch anywhere else: a swipe scrolls the canvas; holding still lifts the box.
      const id = e.pointerId;
      const sx = e.clientX;
      const sy = e.clientY;
      holding = true;
      const stopWaiting = () => {
        clearTimeout(timer);
        holding = false;
        el.removeEventListener("pointermove", wobble);
        el.removeEventListener("pointerup", stopWaiting);
        el.removeEventListener("pointercancel", stopWaiting); // fires when the page starts scrolling
      };
      const wobble = (ev) => {
        if (ev.pointerId === id && Math.hypot(ev.clientX - sx, ev.clientY - sy) > SLOP) stopWaiting();
      };
      const timer = setTimeout(() => {
        stopWaiting();
        onFront();
        if (navigator.vibrate) navigator.vibrate(10);
        drag({ clientX: sx, clientY: sy, pointerId: id }, { liftedByHold: true });
      }, HOLD_MS);
      el.addEventListener("pointermove", wobble);
      el.addEventListener("pointerup", stopWaiting);
      el.addEventListener("pointercancel", stopWaiting);
    });
  }

  function hideHint() {
    if (hint) hint.classList.add("is-gone");
  }

  cards.forEach((card) => {
    makeDraggable(card, { handle: ".card__bar", followers: () => kidsOf(card), onFront: () => clusterToFront(card), onTap: () => toggle(card) });
    card.addEventListener("focusin", () => clusterToFront(card)); // keyboard users
    // hovering a closed main box nudges its tucked boxes out a bit, hinting there's more
    const peek = (on) => kidsOf(card).forEach((n) => n.classList.toggle("is-peeking", on));
    card.addEventListener("pointerenter", () => peek(true));
    card.addEventListener("pointerleave", () => peek(false));
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && card.getAttribute("role") === "button") {
        e.preventDefault();
        toggle(card);
      }
    });
  });
  nodes.forEach((node) => {
    makeDraggable(node, { onFront: () => toFront(node), onDrop: () => remember(node) });
    node.addEventListener("focusin", () => toFront(node));
  });

  /* Resizing never reshuffles. Everything stays put; a box only slides in if
     it would otherwise hang off the right edge, and slides back to its spot
     when there's room again. */
  function keepInView() {
    sizeDesk(); // e.g. a phone rotating past the phone/desktop width
    for (const el of cards) {
      const h = home.get(el);
      if (!h) continue;
      place(el, clamp(h.x, 0, desk.clientWidth - el.offsetWidth - PAD), h.y, { remember: false });
    }
    applyFolds(); // small boxes follow their main box (open or tucked)
    drawWires();
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(keepInView, 100);
  });

  /* ---------- go ---------- */
  desk.classList.add("is-live");
  document.body.classList.add("is-live");
  // Always open at the top-left of the canvas (where the about card is), even on reload.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const canvas = document.getElementById("canvas");
  let laidOut = false;

  const init = () => {
    layout();
    laidOut = true;
    window.scrollTo(0, 0);
    if (canvas) canvas.scrollTo(0, 0);

    // fade boxes in one by one
    if (!reduceMotion) {
      const els = shown().sort((a, b) => a.style.zIndex - b.style.zIndex);
      els.forEach((c, i) => (c.style.transitionDelay = Math.min(i * 45, 900) + "ms"));
      setTimeout(() => els.forEach((c) => (c.style.transitionDelay = "")), 1600);
    }
    requestAnimationFrame(() => desk.classList.add("is-ready"));
  };

  // A small box that appears after the layout (e.g. "listening now") finds a spot near its main box.
  function placeLate(node) {
    if (!laidOut || pos.has(node)) return queueWires();
    const placed = shown().filter((el) => el !== node && pos.has(el)).map((el) => ({
      ...rectOf(el),
      main: el.classList.contains("card"),
      owner: el.classList.contains("card") ? el : parentOf(el),
      el,
    }));
    placeNear(node, placed);
    remember(node);
    applyFolds();
  }

  /* ---------- email: assembled only when someone reaches for it; click copies it ---------- */
  document.querySelectorAll(".js-email").forEach((a) => {
    const flip = (s) => [...s].reverse().join("");
    const address = () => flip(a.dataset.u) + "@" + flip(a.dataset.d);
    const reveal = () => (a.href = "mailto:" + address()); // so long-press / right-click "copy" works too
    ["pointerenter", "focus"].forEach((ev) => a.addEventListener(ev, reveal, { once: true }));
    a.title = "copy email address";

    let resetTimer;
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      reveal();
      try {
        await navigator.clipboard.writeText(address());
      } catch (_) {
        window.location.href = a.href; // can't copy here: open the mail app instead
        return;
      }
      a.textContent = "copied ✓";
      a.classList.add("is-copied");
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        a.textContent = "email";
        a.classList.remove("is-copied");
      }, 1500);
    });
  });

  /* ---------- New York time + weather (bottom-left corner) ----------
     Weather from Open-Meteo: free, no key. Change PLACE to move it. */
  const PLACE = { name: "new york", timeZone: "America/New_York", lat: 40.7128, lon: -74.006 };
  const localEl = document.querySelector(".local");
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: PLACE.timeZone, hour: "numeric", minute: "2-digit" });
  let weatherText = "";

  function weatherWord(code) {
    if (code === 0) return "clear";
    if (code === 1) return "mostly clear";
    if (code === 2) return "partly cloudy";
    if (code === 3) return "cloudy";
    if (code === 45 || code === 48) return "foggy";
    if (code >= 51 && code <= 57) return "drizzle";
    if (code >= 61 && code <= 67) return "rain";
    if (code >= 71 && code <= 77) return "snow";
    if (code >= 80 && code <= 82) return "showers";
    if (code === 85 || code === 86) return "snow showers";
    if (code >= 95) return "thunderstorms";
    return "";
  }

  function renderLocal() {
    if (!localEl) return;
    const time = timeFmt.format(new Date()).replace(/\s*([AP])M$/, (_, x) => x.toLowerCase() + "m"); // 3:42pm
    localEl.textContent = [PLACE.name, time, weatherText].filter(Boolean).join(" · ");
  }

  async function loadWeather() {
    try {
      const res = await fetch(
        "https://api.open-meteo.com/v1/forecast" +
          `?latitude=${PLACE.lat}&longitude=${PLACE.lon}` +
          "&current=temperature_2m,weather_code,cloud_cover&temperature_unit=fahrenheit"
      );
      if (!res.ok) return;
      const { current } = await res.json();
      if (!current || typeof current.temperature_2m !== "number") return;
      weatherText = [Math.round(current.temperature_2m) + "°F", weatherWord(current.weather_code)].filter(Boolean).join(" ");
      // clouds also grey out the sky background (sky.js)
      if (window.sky && typeof current.cloud_cover === "number") window.sky.setClouds(current.cloud_cover, current.weather_code);
      renderLocal();
    } catch (_) {
      /* offline or blocked: just show the time */
    }
  }

  renderLocal();
  loadWeather();
  setInterval(renderLocal, 30 * 1000);
  setInterval(() => document.visibilityState === "visible" && loadWeather(), 15 * 60 * 1000);

  /* ---------- listening now (Spotify, via /api/now-playing; hidden until set up) ---------- */
  const listening = document.querySelector(".listening");

  function timeAgo(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    const h = Math.round(m / 60);
    if (h < 24) return h + "h ago";
    return Math.round(h / 24) + "d ago";
  }

  async function loadListening() {
    if (!listening) return;
    try {
      const res = await fetch("/api/now-playing", { cache: "no-store" });
      if (!res.ok) return;
      const { track } = await res.json();
      if (!track || !track.title) return;

      listening.querySelector(".listening__status").textContent = track.nowPlaying
        ? "listening now"
        : "last played" + (track.playedAt ? " · " + timeAgo(track.playedAt) : "");
      listening.querySelector(".listening__title").textContent = track.title;
      listening.querySelector(".listening__artist").textContent = track.artist;
      listening.querySelector(".listening__track").href = track.url;
      const cover = listening.querySelector(".listening__cover");
      if (track.image) cover.src = track.image;
      else cover.removeAttribute("src");
      listening.classList.toggle("is-live", track.nowPlaying);
      listening.hidden = false;
      placeLate(listening);
    } catch (_) {
      /* not deployed / not configured: just leave it hidden */
    }
  }

  // Refresh every minute while the tab is visible.
  setInterval(() => document.visibilityState === "visible" && loadListening(), 60000);

  // Wait for the font (and briefly for the song) so card sizes are measured
  // correctly before laying out.
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  const songOrTimeout = Promise.race([loadListening(), new Promise((r) => setTimeout(r, 1200))]);
  Promise.all([fontsReady, songOrTimeout]).then(init, init);
})();
