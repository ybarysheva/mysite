/* The background follows the sky in New York.
   - Where the sun is right now (worked out from the date, no network) picks the colors:
     pale blue by day, peach/pink near the horizon at sunrise and sunset, a dim blue
     "blue hour" at dusk and dawn, deep navy at night.
   - The site is light while the sun is up and dark at night (flips around dusk/dawn,
     with a slow cross-fade if you happen to be watching).
   - At night: a sparse field of faint stars, and the real moon (actual phase, and only
     when it's actually up over New York, placed roughly where it is in the sky).
   - Clouds (from the weather lookup in script.js) grey the sky and hide the stars.
   Loaded in <head> so the right colors are there before anything paints. */
(() => {
  const NYC = { lat: 40.7128, lon: -74.006 };
  const DARK_BELOW = -4; // degrees: site goes dark once the sun is this far below the horizon
  const rad = Math.PI / 180;
  const daysSinceJ2000 = (date) => date.getTime() / 86400000 + 2440587.5 - 2451545.0;

  /* ---------- sun: height above the horizon (low-precision formula, ~0.5°) ---------- */
  function sun(date, { lat, lon }) {
    const d = daysSinceJ2000(date);
    const g = ((357.529 + 0.98560028 * d) % 360) * rad;          // mean anomaly
    const q = (280.459 + 0.98564736 * d) % 360;                  // mean longitude
    const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad; // ecliptic longitude
    const e = (23.439 - 0.00000036 * d) * rad;                   // tilt of the earth
    const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / rad;
    const dec = Math.asin(Math.sin(e) * Math.sin(L));
    const gmst = (18.697374558 + 24.06570982441908 * d) % 24;    // sidereal time, hours
    let h = (gmst * 15 + lon - ra) % 360;                        // hour angle, degrees
    if (h > 180) h -= 360;
    if (h < -180) h += 360;
    const la = lat * rad;
    const elevation = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(h * rad)) / rad;
    return { elevation, morning: h < 0 };
  }

  /* ---------- moon: where it is (altitude/azimuth, ~1°) and its phase ---------- */
  function moon(date, { lat, lon }) {
    const d = daysSinceJ2000(date);
    const L = rad * (218.316 + 13.176396 * d);  // mean longitude
    const M = rad * (134.963 + 13.064993 * d);  // mean anomaly
    const F = rad * (93.272 + 13.22935 * d);    // mean distance from its node
    const l = L + rad * 6.289 * Math.sin(M);    // ecliptic longitude
    const b = rad * 5.128 * Math.sin(F);        // ecliptic latitude
    const e = rad * 23.4397;
    const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
    const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    const H = rad * (280.16 + 360.9856235 * d) + rad * lon - ra; // hour angle
    const phi = rad * lat;
    const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / rad;
    // azimuth measured from south, positive toward the west (east = negative)
    const azimuth = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)) / rad;
    // phase: 0 = new, 0.25 = first quarter, 0.5 = full, 0.75 = last quarter
    const SYNODIC = 29.530588853;
    const age = (((date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000) % SYNODIC + SYNODIC) % SYNODIC;
    const phase = age / SYNODIC;
    const lit = (1 - Math.cos(2 * Math.PI * phase)) / 2; // fraction of the disk that's lit
    return { altitude, azimuth, phase, lit };
  }

  /* Outline of the lit part of the moon in a 100×100 box (as seen from New York:
     waxing = lit on the right, waning = lit on the left). */
  function moonPath(phase, r = 46) {
    const c = 50;
    const waxing = phase < 0.5;
    const rx = Math.abs(Math.cos(2 * Math.PI * phase)) * r; // how wide the shadow edge bulges
    const crescent = phase < 0.25 || phase > 0.75;
    const edge = waxing ? 1 : 0;                       // which side the bright half is on
    const back = waxing ? (crescent ? 0 : 1) : (crescent ? 1 : 0);
    return `M ${c} ${c - r} A ${r} ${r} 0 0 ${edge} ${c} ${c + r} A ${rx.toFixed(2)} ${r} 0 0 ${back} ${c} ${c - r} Z`;
  }

  /* ---------- palette ----------
     Sky colors (top of screen → bottom/horizon) at different sun heights. */
  const DAY = { // light site
    morning: [
      [-4, "#e4e4ee", "#f2d9d6"], // first light: lavender over pink
      [0,  "#e9eaf2", "#f6e0db"], // sunrise
      [6,  "#ebeff5", "#f7ebe2"], // early morning, warm glow fading
      [20, "#e6eef5", "#f5f4f0"], // morning blue
      [90, "#e4edf6", "#f5f5f2"], // midday
    ],
    evening: [
      [-4, "#e2e0ea", "#f2d3c4"], // just after sunset: lilac over apricot
      [0,  "#e8e6ee", "#f7dccb"], // sunset
      [6,  "#ebebef", "#f8e6d6"], // golden hour
      [20, "#e7eef4", "#f6f2ec"], // afternoon
      [90, "#e4edf6", "#f5f5f2"], // midday
    ],
  };
  const NIGHT = { // dark site
    morning: [
      [-90, "#0e1322", "#1a1d2b"], // night: deep navy, a little city glow low down
      [-14, "#111830", "#202436"], // late night
      [-8,  "#1a2240", "#2f3049"], // early blue hour
      [-4,  "#222b49", "#3e3a52"], // dawn blue hour, a hint of rose at the bottom
    ],
    evening: [
      [-90, "#0e1322", "#1a1d2b"],
      [-14, "#121930", "#212436"], // night settling in
      [-8,  "#1b2341", "#30304a"], // blue hour deepening
      [-4,  "#232c4b", "#423b52"], // dusk: dim blue, faint warmth at the horizon
    ],
  };
  const CLOUD = { light: "#dcdddf", dark: "#1d1f25" }; // what an overcast sky goes to

  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  function at(stops, elev) {
    if (elev <= stops[0][0]) return [stops[0][1], stops[0][2]];
    for (let i = 1; i < stops.length; i++) {
      const [e1, t1, b1] = stops[i];
      const [e0, t0, b0] = stops[i - 1];
      if (elev <= e1) {
        const t = (elev - e0) / (e1 - e0);
        return [mix(t0, t1, t), mix(b0, b1, t)];
      }
    }
    const last = stops[stops.length - 1];
    return [last[1], last[2]];
  }

  /* ---------- stars + moon (built once the page exists) ---------- */
  let moonEl = null;
  let moonLit = null;

  function buildSky() {
    const sky = document.querySelector(".sky");
    if (!sky || sky.dataset.built) return;
    sky.dataset.built = "1";

    // Same star field every visit (seeded random), sparse because it's New York.
    let seed = 20261107;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const stars = document.createElement("div");
    stars.className = "stars";
    for (let i = 0; i < 55; i++) {
      const s = document.createElement("i");
      const size = rnd() < 0.7 ? 1 : rnd() < 0.85 ? 1.5 : 2;
      s.style.cssText =
        `left:${(rnd() * 100).toFixed(2)}%;top:${(Math.pow(rnd(), 1.4) * 80).toFixed(2)}%;` +
        `width:${size}px;height:${size}px;--o:${(0.5 + rnd() * 0.5).toFixed(2)};` +
        (rnd() < 0.4 ? `animation-duration:${(3 + rnd() * 5).toFixed(1)}s;animation-delay:-${(rnd() * 8).toFixed(1)}s;` : "animation:none;");
      stars.appendChild(s);
    }
    sky.appendChild(stars);

    const NS = "http://www.w3.org/2000/svg";
    moonEl = document.createElementNS(NS, "svg");
    moonEl.setAttribute("class", "moon");
    moonEl.setAttribute("viewBox", "0 0 100 100");
    const disk = document.createElementNS(NS, "circle");
    disk.setAttribute("class", "moon__dark");
    disk.setAttribute("cx", "50"); disk.setAttribute("cy", "50"); disk.setAttribute("r", "46");
    moonLit = document.createElementNS(NS, "path");
    moonLit.setAttribute("class", "moon__lit");
    moonEl.append(disk, moonLit);
    sky.appendChild(moonEl);
    paint();
  }

  /* ---------- paint ---------- */
  let cloudiness = 0; // 0 = clear, 1 = fully overcast

  function paint(date = new Date()) {
    const { elevation, morning } = sun(date, NYC);
    const dark = elevation < DARK_BELOW;
    const set = (dark ? NIGHT : DAY)[morning ? "morning" : "evening"];
    let [top, bottom] = at(set, elevation);
    if (cloudiness > 0) {
      const grey = dark ? CLOUD.dark : CLOUD.light;
      top = mix(top, grey, cloudiness);
      bottom = mix(bottom, grey, cloudiness * 0.9);
    }
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.style.setProperty("--sky-top", top);
    root.style.setProperty("--sky-bottom", bottom);

    // Stars fade in as the sky darkens (from about -8° down to -14°); clouds hide them.
    const starAmount = clamp((-elevation - 8) / 6, 0, 1) * clamp(1 - cloudiness * 1.4, 0, 1);
    root.style.setProperty("--stars", starAmount.toFixed(3));

    // The moon: only when it's above New York's horizon. Left = east, right = west; higher = higher.
    const m = moon(date, NYC);
    let moonOpacity = 0;
    if (m.altitude > 0 && m.lit > 0.02) {
      moonOpacity = (dark ? 1 : 0.55) * clamp(1 - cloudiness * 0.75, 0.15, 1) * clamp(m.altitude / 3, 0, 1);
      root.style.setProperty("--moon-x", clamp(50 + (m.azimuth / 180) * 90, 6, 94).toFixed(2) + "%");
      root.style.setProperty("--moon-y", clamp(84 - (m.altitude / 90) * 76, 8, 84).toFixed(2) + "%");
      if (moonLit) moonLit.setAttribute("d", moonPath(m.phase));
    }
    root.style.setProperty("--moon", moonOpacity.toFixed(3));

    return { elevation, morning, dark, top, bottom, stars: starAmount, moon: { ...m, opacity: moonOpacity } };
  }

  // Cloud cover is 0–100 (%). Fog, rain and snow read as fully overcast.
  function setClouds(cover, weatherCode) {
    let c = clamp(Number(cover) || 0, 0, 100) / 100;
    if (weatherCode >= 45) c = 1;
    cloudiness = Math.pow(c, 0.8) * 0.95; // overcast is properly grey, with just a hint of the time of day
    paint();
  }

  paint();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildSky);
  else buildSky();
  setInterval(() => paint(), 60 * 1000);
  // Turn on the slow cross-fade only after the first paint, so the page doesn't fade in from the wrong colors.
  window.addEventListener("load", () => requestAnimationFrame(() => document.documentElement.classList.add("sky-ready")));

  window.sky = { sun: (d) => sun(d || new Date(), NYC), moon: (d) => moon(d || new Date(), NYC), moonPath, paint, setClouds };
})();
