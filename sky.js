/* The background follows the sky in New York.
   - Where the sun is right now (worked out from the date, no network) picks the colors:
     pale blue by day, peach/pink near the horizon at sunrise and sunset, a dim rust glow
     after sunset, near-black navy at night.
   - The site is light while the sun is up and dark at night (flips around dusk/dawn,
     with a slow cross-fade if you happen to be watching).
   - Clouds (from the weather lookup in script.js) pull the colors toward grey.
   Loaded in <head> so the right colors are there before anything paints. */
(() => {
  const NYC = { lat: 40.7128, lon: -74.006 };
  const DARK_BELOW = -4; // degrees: site goes dark once the sun is this far below the horizon

  /* Sun elevation in degrees above the horizon (standard low-precision formula, ~0.5° accurate),
     plus whether it's morning (sun rising) or evening. */
  function sun(date, { lat, lon }) {
    const rad = Math.PI / 180;
    const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
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

  /* Sky colors (top of screen → bottom/horizon) at different sun heights.
     Subtle on purpose: mostly the plain background with a wash of color. */
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
      [-90, "#0d0f15", "#121214"], // night
      [-14, "#0f121b", "#141319"], // late night, a little blue
      [-8,  "#111526", "#1d1720"], // pre-dawn
      [-4,  "#141829", "#271b22"], // dawn glow (just before the site goes light)
    ],
    evening: [
      [-90, "#0d0f15", "#121214"],
      [-14, "#0f111a", "#141217"],
      [-8,  "#121423", "#1f1519"], // fading dusk
      [-4,  "#161727", "#2b1a1b"], // dusk glow right after the switch to dark
    ],
  };
  const CLOUD = { light: "#e8e8e7", dark: "#17181b" }; // what an overcast sky leans toward

  const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };

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

  let cloudiness = 0; // 0 = clear, 1 = fully grey

  function paint(date = new Date()) {
    const { elevation, morning } = sun(date, NYC);
    const dark = elevation < DARK_BELOW;
    const set = (dark ? NIGHT : DAY)[morning ? "morning" : "evening"];
    let [top, bottom] = at(set, elevation);
    if (cloudiness > 0) {
      const grey = dark ? CLOUD.dark : CLOUD.light;
      top = mix(top, grey, cloudiness);
      bottom = mix(bottom, grey, cloudiness);
    }
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.style.setProperty("--sky-top", top);
    root.style.setProperty("--sky-bottom", bottom);
    return { elevation, morning, dark, top, bottom };
  }

  // Cloud cover is 0–100 (%). Rain/snow/fog read greyer still.
  function setClouds(cover, weatherCode) {
    let c = Math.max(0, Math.min(100, Number(cover) || 0)) / 100;
    if (weatherCode >= 45) c = Math.max(c, 0.9); // fog, drizzle, rain, snow, storms
    cloudiness = c * 0.8; // never fully grey: keep a hint of the time of day
    paint();
  }

  paint();
  setInterval(() => paint(), 60 * 1000);
  // Turn on the slow cross-fade only after the first paint, so the page doesn't fade in from the wrong colors.
  window.addEventListener("load", () => requestAnimationFrame(() => document.documentElement.classList.add("sky-ready")));

  window.sky = { sun: (d) => sun(d || new Date(), NYC), paint, setClouds };
})();
