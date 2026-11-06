/* Yana's inbox: read and answer chat messages from the site.
   Add to Home Screen on iPhone (Share → Add to Home Screen) to get notifications. */
(() => {
  const $ = (id) => document.getElementById(id);
  const sections = ["login", "list", "thread"];
  let status = "away";
  let current = null; // open conversation id
  let refreshTimer = null;

  /* ---------- helpers ---------- */
  async function api(query, body) {
    const res = await fetch("/api/inbox" + (query || ""), body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && !(body && body.action === "login")) { show("login"); throw new Error("log in first"); }
    if (!res.ok) throw new Error(data.error || "something went wrong");
    return data;
  }

  function show(name) {
    sections.forEach((s) => ($(s).hidden = s !== name));
    $("status").hidden = name === "login";
    $("notify").hidden = name === "login" || $("notify").dataset.done === "1" || !$("notify-text").textContent;
  }

  function problem(msg) {
    $("problem").textContent = msg || "";
    $("problem").hidden = !msg;
  }

  function ago(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return "now";
    if (m < 60) return m + "m";
    const h = Math.round(m / 60);
    if (h < 24) return h + "h";
    const d = Math.round(h / 24);
    return d < 7 ? d + "d" : new Date(ms).toLocaleDateString();
  }

  /* ---------- around / away ---------- */
  function renderStatus() {
    const around = status === "around";
    $("status").textContent = around ? "● around" : "○ away";
    $("status").setAttribute("aria-pressed", String(around));
    $("status").title = around ? "visitors see you're around (switches to away after 8h)" : "visitors see you're away";
  }
  $("status").addEventListener("click", async () => {
    const next = status === "around" ? "away" : "around";
    try {
      status = (await api("", { action: "status", state: next })).status;
      renderStatus();
    } catch (e) { problem(e.message); }
  });

  /* ---------- list ---------- */
  async function loadList() {
    const data = await api("?view=list");
    status = data.status;
    renderStatus();
    const ul = $("convs");
    ul.replaceChildren(
      ...data.convs.map((c) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = "#c=" + c.id;
        a.className = "conv" + (c.unread ? " is-unread" : "") + (c.blocked ? " is-blocked" : "");
        const top = document.createElement("span");
        top.className = "conv__top";
        const who = document.createElement("span");
        who.textContent = (c.unread ? "● " : "") + (c.email || "visitor");
        const when = document.createElement("span");
        when.className = "muted";
        when.textContent = ago(c.updatedAt);
        top.append(who, when);
        const last = document.createElement("span");
        last.className = "conv__last";
        last.textContent = (c.lastFrom === "yana" ? "you: " : "") + c.lastText;
        a.append(top, last);
        li.append(a);
        return li;
      })
    );
    $("empty").hidden = data.convs.length > 0;
    const unread = data.convs.reduce((n, c) => n + c.unread, 0);
    document.title = unread ? `(${unread}) inbox` : "inbox";
    if (navigator.setAppBadge) (unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge()).catch(() => {});
  }

  /* ---------- one conversation ---------- */
  async function loadThread(id) {
    const c = await api("?view=conv&id=" + encodeURIComponent(id));
    const started = ago(c.createdAt);
    $("t-started").textContent = started === "now" ? "started just now" : /\d[mhd]$/.test(started) ? "started " + started + " ago" : "started " + started;
    $("t-email").hidden = !c.email;
    $("t-blocked").hidden = !c.blocked;
    $("block").hidden = c.blocked;
    if (c.email) {
      $("t-email-addr").textContent = c.email;
      const lastVisitor = [...c.messages].reverse().find((m) => m.from === "visitor");
      const quote = lastVisitor ? "\n\n> " + lastVisitor.text.replace(/\n/g, "\n> ") : "";
      $("t-mailto").href = "mailto:" + c.email + "?subject=" + encodeURIComponent("re: your message on my site") +
        "&body=" + encodeURIComponent(quote);
    }
    const box = $("msgs");
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    const rows = [];
    if (c.question) rows.push(msgRow("yana", c.question, "asked"));
    c.messages.forEach((m) => rows.push(msgRow(m.from, m.text, ago(m.at))));
    box.replaceChildren(...rows);
    if (atBottom || !box.dataset.loaded) box.scrollTop = box.scrollHeight;
    box.dataset.loaded = "1";
  }

  function msgRow(from, text, when) {
    const row = document.createElement("div");
    row.className = "msg msg--" + from;
    const who = document.createElement("span");
    who.className = "msg__who";
    who.textContent = from === "yana" ? "you" : "them";
    const t = document.createElement("span");
    t.className = "msg__text";
    t.textContent = text;
    const w = document.createElement("span");
    w.className = "msg__when";
    w.textContent = when;
    row.append(who, t, w);
    return row;
  }

  $("reply-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("reply").value.trim();
    if (!text || !current) return;
    $("reply-err").hidden = true;
    try {
      await api("", { action: "reply", id: current, text });
      $("reply").value = "";
      await loadThread(current);
      $("msgs").scrollTop = $("msgs").scrollHeight;
    } catch (err) {
      $("reply-err").textContent = err.message;
      $("reply-err").hidden = false;
    }
  });
  // Enter sends, Shift+Enter adds a line (on a keyboard)
  $("reply").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      $("reply-form").requestSubmit();
    }
  });

  $("back").addEventListener("click", () => (location.hash = ""));
  $("delete").addEventListener("click", async () => {
    if (!current || !confirm("delete this conversation? this can't be undone.")) return;
    await api("", { action: "delete", id: current }).catch((e) => problem(e.message));
    location.hash = "";
  });
  $("block").addEventListener("click", async () => {
    if (!current || !confirm("block this person? their new messages won't reach you.")) return;
    await api("", { action: "block", id: current }).catch((e) => problem(e.message));
    loadThread(current);
  });

  /* ---------- routing + refresh ---------- */
  async function route() {
    const m = location.hash.match(/c=([\w-]+)/);
    current = m ? m[1] : null;
    try {
      if (current) {
        $("msgs").dataset.loaded = "";
        show("thread");
        await loadThread(current);
      } else {
        show("list");
        await loadList();
      }
      problem("");
    } catch (e) {
      if (e.message !== "log in first") problem(e.message);
    }
    scheduleRefresh();
  }
  window.addEventListener("hashchange", route);

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (document.visibilityState !== "visible" || !$("login").hidden) return;
    refreshTimer = setTimeout(async () => {
      try { current ? await loadThread(current) : await loadList(); } catch (_) {}
      scheduleRefresh();
    }, 6000);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && $("login").hidden) route();
    else clearTimeout(refreshTimer);
  });

  /* ---------- login ---------- */
  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-err").hidden = true;
    try {
      await api("", { action: "login", password: $("password").value });
      $("password").value = "";
      await setupNotifications();
      route();
    } catch (err) {
      $("login-err").textContent = err.message;
      $("login-err").hidden = false;
    }
  });

  /* ---------- notifications ---------- */
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const pushSupported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  function notifyState(text, { button = false, done = false } = {}) {
    $("notify-text").textContent = text;
    $("notify-btn").hidden = !button;
    $("notify").dataset.done = done ? "1" : "";
    $("notify").hidden = done || !$("login").hidden;
  }

  const b64ToBytes = (b64) => {
    const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  };

  async function subscribe() {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { publicKey } = await api("?view=vapid");
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    }
    await api("", { action: "subscribe", subscription: sub.toJSON() });
  }

  async function setupNotifications() {
    if (isIOS && !standalone) {
      return notifyState("to get notifications: tap Share → Add to Home Screen, then open inbox from your home screen and log in there.");
    }
    if (!pushSupported) return notifyState("this browser can't do notifications. try Safari (iPhone) or Chrome.");
    await navigator.serviceWorker.register("/inbox/sw.js", { scope: "/inbox/" });
    if (Notification.permission === "denied") {
      return notifyState("notifications are blocked for this app. turn them on in Settings → Notifications → inbox.");
    }
    if (Notification.permission === "granted") {
      try { await subscribe(); notifyState("", { done: true }); }
      catch (e) { notifyState("couldn't turn on notifications: " + e.message, { button: true }); }
      return;
    }
    notifyState("get a notification when someone messages you.", { button: true });
  }

  $("notify-btn").addEventListener("click", async () => {
    try {
      const perm = await Notification.requestPermission(); // must come from a tap on iPhone
      if (perm !== "granted") return notifyState("no notifications then. you can change this in Settings later.");
      await subscribe();
      notifyState("", { done: true });
    } catch (e) {
      notifyState("couldn't turn on notifications: " + e.message, { button: true });
    }
  });

  // Tapping a notification while the app is open: jump to that conversation.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.open) location.hash = new URL(e.data.open, location.origin).hash;
    });
  }

  /* ---------- start ---------- */
  (async () => {
    try {
      const res = await fetch("/api/inbox?view=me", { cache: "no-store" });
      if (res.status === 503) {
        return problem("the chat isn't set up yet: add Upstash Redis and INBOX_PASSWORD in Vercel (see README).");
      }
      const me = await res.json();
      if (!me.loggedIn) return show("login");
      status = me.status;
      renderStatus();
      await setupNotifications();
      route();
    } catch (e) {
      problem("can't reach the server. check your connection?");
    }
  })();
})();
