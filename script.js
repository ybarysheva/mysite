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

  /* Phones get a canvas about two screens wide that you swipe around;
     desktop's canvas is just the window. */
  const viewportWidth = () => document.documentElement.clientWidth;
  const isPhone = () => viewportWidth() < 640;
  function sizeDesk() {
    desk.style.width = isPhone() ? Math.max(viewportWidth() * 2, 760) + "px" : "";
  }

  /* ---------- layout: curated random ----------
     Cards land randomly, but each one tries a bunch of spots and keeps one
     that only overlaps others a little. The about card is never covered and
     always lands in the first screenful (on phones: the first screen you see). */
  function scatter() {
    sizeDesk();
    const W = desk.clientWidth;
    const VW = viewportWidth();
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
        const x = clamp(card === about ? rand(PAD, Math.min(maxX, VW - s.w - PAD)) : rand(PAD, maxX), PAD, maxX);
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

  /* ---------- dragging ----------
     Mouse: drag a box from anywhere (links still click).
     Touch: swiping moves around the canvas. To move a box, either drag its top
     bar, or press and hold anywhere on it (~0.4s) until it lifts. */
  const HOLD_MS = 400; // how long to hold before a box lifts
  const SLOP = 8;      // finger can wobble this much (px) and still count as holding
  let holding = false; // a touch is waiting to become a hold
  let lifted = false;  // a box is being moved by touch: don't scroll the page
  let swallowClick = false;

  // While a box is lifted, stop the page from scrolling under the finger.
  document.addEventListener("touchmove", (e) => { if (lifted) e.preventDefault(); }, { passive: false });
  // No long-press menus / link previews while holding a box.
  document.addEventListener("contextmenu", (e) => { if (holding || lifted) e.preventDefault(); });
  // A hold that started on a link shouldn't open the link when you let go.
  document.addEventListener("click", (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  function makeDraggable(el, { handle, bounds, onFront, onMoveStart }) {
    function drag(startEvent, { liftedByHold = false } = {}) {
      const start = { x: startEvent.clientX, y: startEvent.clientY };
      const origin = { ...pos.get(el) };
      let moved = false;
      const begin = () => {
        moved = true;
        el.classList.add("is-dragging");
        document.body.classList.add("is-grabbing");
        onMoveStart && onMoveStart();
      };
      if (liftedByHold) {
        lifted = true;
        el.classList.add("is-lifted");
        begin();
      }
      try { el.setPointerCapture(startEvent.pointerId); } catch (_) {}

      const move = (ev) => {
        if (ev.pointerId !== startEvent.pointerId) return;
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!moved) {
          if (Math.hypot(dx, dy) < 3) return;
          begin();
        }
        const b = bounds();
        place(el, clamp(origin.x + dx, b.minX || 0, b.maxX), clamp(origin.y + dy, b.minY || 0, b.maxY));
      };

      const end = (ev) => {
        if (ev.pointerId !== startEvent.pointerId) return;
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", end);
        el.removeEventListener("pointercancel", end);
        el.classList.remove("is-dragging", "is-lifted");
        document.body.classList.remove("is-grabbing");
        if (liftedByHold) {
          lifted = false;
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
      if (e.target.closest(touch ? "button" : "a, button")) return;
      e.stopPropagation(); // the innermost draggable wins (an art image, not its card)

      // Mouse, or touch on the top bar: drag right away.
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
    makeDraggable(card, {
      handle: ".card__bar",
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
    sizeDesk(); // e.g. a phone rotating past the phone/desktop width
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
  document.body.classList.add("is-live");
  // Always open at the top-left of the canvas (where the about card is), even on reload.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const canvas = document.getElementById("canvas");

  const init = () => {
    piles.forEach(scatterArt);
    scatter();
    window.scrollTo(0, 0);
    if (canvas) canvas.scrollTo(0, 0);

    // fade cards in one by one
    if (!reduceMotion) {
      [...cards]
        .sort((a, b) => a.style.zIndex - b.style.zIndex)
        .forEach((c, i) => (c.style.transitionDelay = i * 70 + "ms"));
      setTimeout(() => cards.forEach((c) => (c.style.transitionDelay = "")), 1200);
    }
    requestAnimationFrame(() => desk.classList.add("is-ready"));
  };

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

  /* ---------- light / dark toggle (dark by default; choice remembered) ---------- */
  const themeBtn = document.querySelector(".theme-toggle");
  function labelThemeButton() {
    const label = document.documentElement.dataset.theme === "dark" ? "switch to light mode" : "switch to dark mode";
    themeBtn.setAttribute("aria-label", label);
    themeBtn.title = label;
  }
  if (themeBtn) {
    labelThemeButton();
    themeBtn.addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch (_) {}
      labelThemeButton();
    });
  }

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
          "&current=temperature_2m,weather_code&temperature_unit=fahrenheit"
      );
      if (!res.ok) return;
      const { current } = await res.json();
      if (!current || typeof current.temperature_2m !== "number") return;
      weatherText = [Math.round(current.temperature_2m) + "°F", weatherWord(current.weather_code)].filter(Boolean).join(" ");
      renderLocal();
    } catch (_) {
      /* offline or blocked: just show the time */
    }
  }

  renderLocal();
  loadWeather();
  setInterval(renderLocal, 30 * 1000);
  setInterval(() => document.visibilityState === "visible" && loadWeather(), 15 * 60 * 1000);

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
