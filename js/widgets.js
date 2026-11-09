// The small live bits: email copy, NYC time + weather, last played (Spotify), currently reading (Goodreads).

/* ---------- email: assembled only when someone reaches for it; a click copies it ---------- */
export function initEmail() {
  for (const a of document.querySelectorAll(".js-email")) {
    const flip = (s) => [...s].reverse().join("");
    const address = `${flip(a.dataset.u)}@${flip(a.dataset.d)}`;
    const reveal = () => (a.href = `mailto:${address}`); // so long-press / right-click "copy" works too
    a.addEventListener("pointerenter", reveal, { once: true });
    a.addEventListener("focus", reveal, { once: true });
    a.title = "copy email address";

    let timer;
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      reveal();
      try {
        await navigator.clipboard.writeText(address);
      } catch {
        location.href = a.href; // can't copy here: open the mail app instead
        return;
      }
      a.textContent = "copied ✓";
      a.classList.add("is-copied");
      clearTimeout(timer);
      timer = setTimeout(() => {
        a.textContent = "email";
        a.classList.remove("is-copied");
      }, 1500);
    });
  }
}

/* ---------- New York time + weather (bottom-left corner; weather from Open-Meteo, no key) ---------- */
const PLACE = { name: "new york", timeZone: "America/New_York", lat: 40.7128, lon: -74.006 };

const WEATHER = [
  [(c) => c === 0, "clear"],
  [(c) => c === 1, "mostly clear"],
  [(c) => c === 2, "partly cloudy"],
  [(c) => c === 3, "cloudy"],
  [(c) => c === 45 || c === 48, "foggy"],
  [(c) => c >= 51 && c <= 57, "drizzle"],
  [(c) => c >= 61 && c <= 67, "rain"],
  [(c) => c >= 71 && c <= 77, "snow"],
  [(c) => c >= 80 && c <= 82, "showers"],
  [(c) => c === 85 || c === 86, "snow showers"],
  [(c) => c >= 95, "thunderstorms"],
];
const weatherWord = (code) => WEATHER.find(([test]) => test(code))?.[1] ?? "";

export function initLocal() {
  const el = document.querySelector(".local");
  if (!el) return;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: PLACE.timeZone, hour: "numeric", minute: "2-digit" });
  let weather = "";

  const render = () => {
    const time = fmt.format(new Date()).replace(/\s*([AP])M$/, (_, x) => `${x.toLowerCase()}m`); // 3:42pm
    el.textContent = [PLACE.name, time, weather].filter(Boolean).join(" · ");
  };

  const load = async () => {
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.search = new URLSearchParams({
        latitude: PLACE.lat,
        longitude: PLACE.lon,
        current: "temperature_2m,weather_code,cloud_cover",
        temperature_unit: "fahrenheit",
      });
      const res = await fetch(url);
      if (!res.ok) return;
      const { current } = await res.json();
      if (typeof current?.temperature_2m !== "number") return;
      weather = [`${Math.round(current.temperature_2m)}°F`, weatherWord(current.weather_code)].filter(Boolean).join(" ");
      if (typeof current.cloud_cover === "number") window.sky?.setClouds(current.cloud_cover, current.weather_code); // greys the sky
      render();
    } catch {
      /* offline or blocked: just the time */
    }
  };

  render();
  load();
  setInterval(render, 30_000);
  setInterval(() => document.visibilityState === "visible" && load(), 15 * 60_000);
}

/* ---------- shared: a cover + title + subtitle row that links out ---------- */
function mediaRow({ url, image, title, subtitle }) {
  const a = Object.assign(document.createElement("a"), { className: "media", href: url || "#", target: "_blank", rel: "noopener" });
  const img = Object.assign(document.createElement("img"), { className: "media__cover", alt: "", width: 40, height: 40 });
  if (image) img.src = image;
  const text = Object.assign(document.createElement("span"), { className: "media__text" });
  text.append(
    Object.assign(document.createElement("span"), { className: "media__title", textContent: title }),
    Object.assign(document.createElement("span"), { className: "media__subtitle", textContent: subtitle ?? "" }),
  );
  a.append(img, text);
  return a;
}

const timeAgo = (ms) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

async function getJSON(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/* ---------- last played / listening now (Spotify via /api/now-playing) ---------- */
export async function loadListening(onShow) {
  const box = document.querySelector(".js-listening");
  const track = (await getJSON("/api/now-playing"))?.track;
  if (!box || !track?.title) return; // not set up / Spotify didn't answer: stay hidden

  box.querySelector(".js-status").textContent = track.nowPlaying
    ? "listening now"
    : `last played${track.playedAt ? ` · ${timeAgo(track.playedAt)}` : ""}`;
  box.querySelector(".js-media").replaceChildren(
    mediaRow({ url: track.url, image: track.image, title: track.title, subtitle: track.artist }),
  );
  box.classList.toggle("is-playing", track.nowPlaying);
  onShow(box);
}

/* ---------- currently reading (Goodreads via /api/reading) ---------- */
export async function loadReading(onShow) {
  const box = document.querySelector(".js-reading");
  const books = (await getJSON("/api/reading"))?.books;
  if (!box || !books?.length) return; // empty shelf / Goodreads didn't answer: stay hidden

  box.querySelector(".js-media").replaceChildren(
    ...books.map((b) => {
      const li = document.createElement("li");
      li.append(mediaRow({ url: b.url, image: b.image, title: b.title, subtitle: b.author }));
      return li;
    }),
  );
  onShow(box);
}
