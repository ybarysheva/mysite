(() => {
  const desk = document.getElementById("desk");
  if (!desk) return;

  const cards = [...desk.querySelectorAll(".card")];
  const piles = [...desk.querySelectorAll(".art__pile")];
  const hint = document.querySelector(".hint");

  const PAD = 16;      // min distance from screen edges
  const BOTTOM = 40;   // breathing room at the bottom (keeps clear of the hint)
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pos = new Map();
  let z = 10;
  let lastWidth = 0;

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

  function place(el, x, y) {
    x = Math.round(x);
    y = Math.round(y);
    el.style.left = x + "px";
    el.style.top = y + "px";
    pos.set(el, { x, y });
  }

  function toFront(card) {
    card.style.zIndex = ++z;
  }

  /* ---------- layout: curated random ----------
     Cards land randomly, but each one tries a bunch of spots and keeps one
     that only overlaps others a little. The about card is never covered and
     always lands in the first screenful. Cards with data-near="x" start out
     stuck to the top-right corner of card x. */
  function scatter() {
    const W = desk.clientWidth;
    const VH = window.innerHeight;
    const sizes = new Map(cards.map((c) => [c, { w: c.offsetWidth, h: c.offsetHeight }]));
    const totalArea = [...sizes.values()].reduce((s, v) => s + v.w * v.h, 0);

    const about = cards.find((c) => c.dataset.card === "about");
    const attached = cards.filter((c) => c.dataset.near);
    const free = shuffled(cards.filter((c) => c !== about && !c.dataset.near));

    if (W < 640) return scatterColumn(sizes, about, free, attached);

    const H = Math.max(VH, Math.ceil(totalArea / (W * 0.55)) + BOTTOM);
    desk.style.height = H + "px";
    const overlapAllowed = 0.15;
    const order = [about, ...free, ...attached].filter(Boolean);
    const rects = new Map();

    for (const card of order) {
      const s = sizes.get(card);
      const maxX = W - s.w - PAD;
      const maxY = H - s.h - BOTTOM;
      const anchorEl = card.dataset.near && desk.querySelector(`[data-card="${card.dataset.near}"]`);
      const anchor = anchorEl && rects.get(anchorEl);

      let best = null;
      let bestScore = Infinity;

      for (let i = 0; i < 120; i++) {
        let x, y;
        if (anchor) {
          x = anchor.x + anchor.w - s.w * rand(0.35, 0.6);
          y = anchor.y - s.h * rand(0.35, 0.6);
        } else if (card === about) {
          x = rand(PAD, maxX);
          y = rand(PAD, Math.min(maxY, VH * 0.45));
        } else {
          x = rand(PAD, maxX);
          y = rand(PAD, maxY);
        }
        x = clamp(x, PAD, maxX);
        y = clamp(y, PAD, maxY);

        const r = { x, y, w: s.w, h: s.h };
        let score = 0;
        for (const [other, o] of rects) {
          if (other === anchorEl) continue; // overlapping your anchor is the point
          const allowance = other === about ? 0 : overlapAllowed * Math.min(r.w * r.h, o.w * o.h);
          score += Math.max(0, overlapArea(r, o) - allowance);
        }
        if (score < bestScore) {
          bestScore = score;
          best = r;
        }
        if (score === 0) break;
      }

      rects.set(card, best);
      place(card, best.x, best.y);
    }

    // stacking order: random, but about + attached notes on top
    shuffled(free).forEach(toFront);
    if (about) toFront(about);
    attached.forEach(toFront);
  }

  /* Phones: a shuffled column with sideways jitter. Each card tucks slightly
     under the next so every top bar (the touch drag handle) stays visible. */
  function scatterColumn(sizes, about, free, attached) {
    const W = desk.clientWidth;
    let y = PAD + rand(0, 16);
    for (const card of [about, ...free].filter(Boolean)) {
      const s = sizes.get(card);
      place(card, rand(PAD, Math.max(PAD, W - s.w - PAD)), y);
      toFront(card);

      // attached notes go on this card's top-right corner
      for (const note of attached.filter((n) => n.dataset.near === card.dataset.card)) {
        const n = sizes.get(note);
        place(note, Math.max(PAD, W - n.w - PAD - rand(0, 12)), Math.max(PAD, y - n.h * 0.4));
        toFront(note);
      }
      y += s.h + rand(-10, 28);
    }
    desk.style.height = Math.max(window.innerHeight, y + BOTTOM) + "px";
  }

  /* ---------- art pile ---------- */
  function scatterArt(pile) {
    const imgs = shuffled(pile.querySelectorAll(".art__img"));
    const W = pile.clientWidth;
    const H = pile.clientHeight;
    imgs.forEach((img, i) => {
      place(img, rand(0, Math.max(0, W - img.offsetWidth)), rand(0, Math.max(0, H - img.offsetHeight)));
      img.style.zIndex = i + 1;
    });
    pile.dataset.z = imgs.length;
  }

  /* ---------- dragging ---------- */
  function makeDraggable(el, { touchHandle, bounds, onFront, onMoveStart }) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.target.closest("a, button")) return;
      // On touch, cards only drag from their top bar so the page can still scroll.
      if (e.pointerType !== "mouse" && touchHandle && !e.target.closest(touchHandle)) return;

      e.preventDefault();
      e.stopPropagation();
      onFront();

      const start = { x: e.clientX, y: e.clientY };
      const origin = { ...pos.get(el) };
      let moved = false;
      el.setPointerCapture(e.pointerId);

      const move = (ev) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved) {
          if (Math.hypot(dx, dy) < 3) return;
          moved = true;
          el.classList.add("is-dragging");
          document.body.classList.add("is-grabbing");
          onMoveStart && onMoveStart();
        }
        const b = bounds();
        place(el, clamp(origin.x + dx, 0, b.maxX), clamp(origin.y + dy, 0, b.maxY));
      };

      const end = () => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        el.classList.remove("is-dragging");
        document.body.classList.remove("is-grabbing");
      };

      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
    });
  }

  function hideHint() {
    if (hint) hint.classList.add("is-gone");
  }

  cards.forEach((card) => {
    makeDraggable(card, {
      touchHandle: ".card__bar",
      onFront: () => toFront(card),
      onMoveStart: hideHint,
      bounds: () => ({
        maxX: desk.clientWidth - card.offsetWidth,
        maxY: desk.clientHeight - card.offsetHeight,
      }),
    });
    // keyboard users: bring a card forward when tabbing into it
    card.addEventListener("focusin", () => toFront(card));
  });

  piles.forEach((pile) => {
    pile.querySelectorAll(".art__img").forEach((img) => {
      makeDraggable(img, {
        onFront: () => {
          pile.dataset.z = Number(pile.dataset.z || 0) + 1;
          img.style.zIndex = pile.dataset.z;
          toFront(pile.closest(".card"));
        },
        onMoveStart: hideHint,
        bounds: () => ({
          maxX: pile.clientWidth - img.offsetWidth,
          maxY: pile.clientHeight - img.offsetHeight,
        }),
      });
    });
  });

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = desk.clientWidth;
      if (w === lastWidth) return; // ignore height-only changes (mobile URL bar)
      lastWidth = w;
      piles.forEach(scatterArt);
      scatter();
    }, 150);
  });

  /* ---------- go ---------- */
  desk.classList.add("is-live");

  const init = () => {
    piles.forEach(scatterArt);
    scatter();
    lastWidth = desk.clientWidth;

    // fade cards in one by one
    if (!reduceMotion) {
      [...cards]
        .sort((a, b) => a.style.zIndex - b.style.zIndex)
        .forEach((c, i) => (c.style.transitionDelay = i * 70 + "ms"));
      setTimeout(() => cards.forEach((c) => (c.style.transitionDelay = "")), 1200);
    }
    requestAnimationFrame(() => desk.classList.add("is-ready"));
  };

  // wait for the font so card sizes are measured correctly
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(init, init);
})();
