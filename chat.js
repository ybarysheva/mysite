/* "say hi" card: visitors chat with Yana; she answers from /inbox on her phone.
   Talks to /api/chat. If that isn't set up (or is down), the card removes itself
   before the layout runs, so nobody sees a broken chat. */
(() => {
  const card = document.querySelector(".card--chat");
  if (!card) {
    window.chatReady = Promise.resolve();
    return;
  }

  const QUESTIONS = [
    "if you were stuck doing only one thing for the rest of your life, what would it be?",
    "what's a hill you'll die on that nobody else cares about?",
    "what's the best thing you've ever found on the street?",
    "what's a sound you love?",
    "what's the most useless skill you have?",
    "what food would you defend in court?",
    "what would you name a boat?",
    "what's something you believe but can't prove?",
    "what did you think a word meant for way too long?",
    "what's in your fridge right now that you're slightly embarrassed by?",
    "if a cat could leave you a review, what would it say?",
  ];

  const KEY = "chat:v1";
  const $ = (sel) => card.querySelector(sel);
  const thread = $(".chat__thread");
  const statusEl = $(".chat__status");
  const form = $(".chat__form");
  const input = $(".chat__input");
  const emailBox = $(".chat__email");
  const emailForm = $(".chat__email-form");
  const emailInput = $(".chat__email-input");
  const emailToggle = $(".chat__email-toggle");
  const errorEl = $(".chat__error");

  /* ---------- saved state (this browser only) ---------- */
  let state = { id: null, token: null, question: null, messages: [], email: null };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && saved.id && saved.token) state = { ...state, ...saved };
  } catch (_) {}
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {}
  };
  if (!state.question) state.question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];

  let status = "away";
  let pending = []; // messages being sent / that failed
  let emailOpen = false;

  /* ---------- rendering ---------- */
  function line(who, text, cls = "") {
    const row = document.createElement("div");
    row.className = "chat__msg chat__msg--" + who + (cls ? " " + cls : "");
    const name = document.createElement("span");
    name.className = "chat__who";
    name.textContent = who === "yana" ? "yana" : "you";
    const body = document.createElement("span");
    body.className = "chat__text";
    body.textContent = text;
    row.append(name, body);
    return row;
  }

  function render() {
    const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 30;
    thread.replaceChildren(
      line("yana", state.question),
      ...state.messages.map((m) => line(m.from, m.text)),
      ...pending.map((p) => line("visitor", p.text, p.ghost ? "" : "is-pending"))
    );
    if (nearBottom || pending.length) thread.scrollTop = thread.scrollHeight;

    statusEl.classList.toggle("is-around", status === "around");
    statusEl.querySelector(".chat__status-text").textContent =
      status === "around" ? "around. I'll reply here soon" : "away right now. I'll reply when I'm back";

    // "let me know when Yana replies": shown once a conversation exists and no email is saved yet
    const started = Boolean(state.id);
    emailBox.hidden = !started || Boolean(state.email);
    const showField = status === "away" || emailOpen;
    emailForm.hidden = !showField;
    emailToggle.hidden = showField;
    $(".chat__email-saved").hidden = !state.email;
  }

  function showError(msg) {
    errorEl.textContent = msg || "";
    errorEl.hidden = !msg;
  }

  /* ---------- network ---------- */
  const since = () => (state.messages.length ? state.messages[state.messages.length - 1].n + 1 : 0);

  async function poll() {
    const q = state.id
      ? `?id=${encodeURIComponent(state.id)}&token=${encodeURIComponent(state.token)}&since=${since()}`
      : "";
    const res = await fetch("/api/chat" + q, { cache: "no-store" });
    if (!res.ok) throw new Error("chat unavailable");
    const data = await res.json();
    status = data.status || "away";

    if (data.gone) {
      // conversation was deleted on Yana's side: start fresh
      state = { id: null, token: null, question: state.question, messages: [], email: null };
      save();
    } else if (data.messages) {
      if (data.question) state.question = data.question;
      if (data.email) state.email = data.email;
      const known = new Set(state.messages.map((m) => m.n));
      const fresh = data.messages.filter((m) => !known.has(m.n));
      if (fresh.length) {
        state.messages.push(...fresh);
        state.messages.sort((a, b) => a.n - b.n);
        if (fresh.some((m) => m.from === "yana")) {
          lastActivity = Date.now();
          card.dispatchEvent(new CustomEvent("chat:new", { bubbles: true }));
        }
      }
      save();
    }
    render();
  }

  async function post(body) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, id: state.id, token: state.token, website: form.website.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "couldn't send. try again?");
    if (data.id && data.id !== state.id) {
      state.id = data.id;
      state.token = data.token;
      state.messages = [];
    }
    if (data.status) status = data.status;
    return data;
  }

  /* ---------- polling: quick while a conversation is active, slow otherwise ---------- */
  let lastActivity = 0;
  let timer = null;
  function schedule() {
    clearTimeout(timer);
    if (!state.id || document.visibilityState !== "visible") return;
    const active = Date.now() - lastActivity < 10 * 60 * 1000;
    timer = setTimeout(async () => {
      try { await poll(); } catch (_) {}
      schedule();
    }, active ? 4000 : 20000);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.id) poll().catch(() => {}).finally(schedule);
    else clearTimeout(timer);
  });

  /* ---------- sending ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    showError("");
    const p = { text };
    pending.push(p);
    render();
    try {
      const data = await post({ text, question: state.messages.length ? undefined : state.question });
      pending = pending.filter((x) => x !== p);
      if (data.message && data.message.n >= 0) state.messages.push(data.message);
      else if (data.message) pending.push({ text, ghost: true }); // shown here, not stored
      lastActivity = Date.now();
      save();
      render();
      schedule();
    } catch (err) {
      pending = pending.filter((x) => x !== p);
      render();
      showError(err.message);
      input.value = text; // give them their words back
    }
  });

  emailToggle.addEventListener("click", () => {
    emailOpen = true;
    render();
    emailInput.focus();
  });

  emailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) return;
    showError("");
    try {
      await post({ email });
      state.email = email;
      save();
      render();
    } catch (err) {
      showError(err.message);
    }
  });

  /* ---------- start ---------- */
  render();
  const check = poll().then(
    () => {
      if (state.id) {
        const last = state.messages[state.messages.length - 1];
        lastActivity = last ? last.at : 0;
        schedule();
      }
    },
    () => card.remove() // API not set up: no chat card at all
  );
  // Don't hold up the page layout for more than a moment.
  window.chatReady = Promise.race([check, new Promise((r) => setTimeout(r, 1500))]);
})();
