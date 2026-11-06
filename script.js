(() => {
  const desk = document.getElementById("desk");
  if (!desk) return;

  const cards = [...desk.querySelectorAll(".card")];
  const piles = [...desk.querySelectorAll(".art__pile")];
  const hint = document.querySelector(".hint");

  const PAD = 16;      // min distance from screen edges
  const BOTTOM = 40;   // breathing room at the bottom (keeps clear of the hint)
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pos = new Map();   // where each element is drawn right now
  const home = new Map();  // where it was put (by the shuffle or by a drag)
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

  function place(el, x, y, { remember = true } = {}) {
    x = Math.round(x);
    y = Math.round(y);
    el.style.left = x + "px";
    el.style.top = y + "px";
    pos.set(el, { x, y });
    if (remember) home.set(el, { x, y });
  }

  function toFront(card) {
    card.style.zIndex = ++z;
  }

  /* How far a card's stuck-on note (e.g. "currently" on work) pokes out
     above and to the right of the card. Layout treats card + note as one box. */
  function overhang(card) {
    const note = card.querySelector(".note");
    if (!note) return { top: 0, right: 0 };
    return {
      top: Math.max(0, -note.offsetTop),
      right: Math.max(0, note.offsetLeft + note.offsetWidth - card.clientWidth),
    };
  }

  /* ---------- layout: curated random ----------
     Cards land randomly, but each one tries a bunch of spots and keeps one
     that only overlaps others a little. The about card is never covered and
     always lands in the first screenful. */
  function scatter() {
    const W = desk.clientWidth;
    const VH = window.innerHeight;
    const boxes = new Map(
      cards.map((c) => {
        const o = overhang(c);
        return [c, { w: c.offsetWidth + o.right, h: c.offsetHeight + o.top, top: o.top }];
      })
    );
    const totalArea = [...boxes.values()].reduce((s, v) => s + v.w * v.h, 0);

    const about = cards.find((c) => c.dataset.card === "about");
    const order = [about, ...shuffled(cards.filter((c) => c !== about))].filter(Boolean);

    if (W < 640) return scatterColumn(boxes, order);

    const H = Math.max(VH, Math.ceil(totalArea / (W * 0.55)) + BOTTOM);
    desk.style.height = H + "px";
    const overlapAllowed = 0.15;
    const rects = new Map();

    for (const card of order) {
      const s = boxes.get(card);
      const maxX = W - s.w - PAD;
      const maxY = H - s.h - BOTTOM;

      let best = null;
      let bestScore = Infinity;

      for (let i = 0; i < 120; i++) {
        const x = clamp(rand(PAD, maxX), PAD, maxX);
        const y = clamp(card === about ? rand(PAD, Math.min(maxY, VH * 0.45)) : rand(PAD, maxY), PAD, maxY);

        const r = { x, y, w: s.w, h: s.h };
        let score = 0;
        for (const [other, o] of rects) {
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
      place(card, best.x, best.y + s.top);
    }

    // stacking order: random, but about on top
    shuffled(order).forEach(toFront);
    if (about) toFront(about);
  }

  /* Phones: a shuffled column with sideways jitter. Each card tucks slightly
     under the next so every top bar (the touch drag handle) stays visible. */
  function scatterColumn(boxes, order) {
    const W = desk.clientWidth;
    let y = PAD + rand(0, 16);
    for (const card of order) {
      const s = boxes.get(card);
      place(card, rand(PAD, Math.max(PAD, W - s.w - PAD)), y + s.top);
      toFront(card);
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
        place(el, clamp(origin.x + dx, b.minX || 0, b.maxX), clamp(origin.y + dy, b.minY || 0, b.maxY));
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
      bounds: () => {
        const o = overhang(card);
        return {
          minY: o.top,
          maxX: desk.clientWidth - card.offsetWidth - o.right,
          maxY: desk.clientHeight - card.offsetHeight,
        };
      },
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

  /* Resizing never reshuffles. Everything stays put; a box only slides in if
     it would otherwise hang off the right edge, and slides back to its spot
     when there's room again. */
  function keepInView() {
    for (const card of cards) {
      const h = home.get(card);
      if (!h) continue;
      place(card, clamp(h.x, 0, desk.clientWidth - card.offsetWidth - overhang(card).right - PAD), h.y, { remember: false });
    }
    for (const pile of piles) {
      for (const img of pile.querySelectorAll(".art__img")) {
        const h = home.get(img);
        if (!h) continue;
        place(img, clamp(h.x, 0, pile.clientWidth - img.offsetWidth), h.y, { remember: false });
      }
    }
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(keepInView, 100);
  });

  /* ---------- go ---------- */
  desk.classList.add("is-live");

  const init = () => {
    piles.forEach(scatterArt);
    scatter();

    // fade cards in one by one
    if (!reduceMotion) {
      [...cards]
        .sort((a, b) => a.style.zIndex - b.style.zIndex)
        .forEach((c, i) => (c.style.transitionDelay = i * 70 + "ms"));
      setTimeout(() => cards.forEach((c) => (c.style.transitionDelay = "")), 1200);
    }
    requestAnimationFrame(() => desk.classList.add("is-ready"));
  };

  /* ---------- email (assembled only when someone reaches for it) ---------- */
  document.querySelectorAll(".js-email").forEach((a) => {
    const reveal = () => {
      const flip = (s) => [...s].reverse().join("");
      a.href = "mailto:" + flip(a.dataset.u) + "@" + flip(a.dataset.d);
    };
    ["pointerenter", "focus", "click"].forEach((ev) => a.addEventListener(ev, reveal, { once: true }));
  });

  /* ---------- listening now (/api/now-playing, Spotify: not set up yet) ---------- */
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
