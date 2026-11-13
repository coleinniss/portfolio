/*
 * Daily loop (Figma: "10 · Wireframes · daily loop", states on "13 · feedback" and "14 · errors").
 * Home → heart / voice note / doodle / today's question → back home.
 *
 * Copy uses the partner's name rather than "her": the app doesn't know anyone's pronouns.
 * Sending is simulated (no backend): "offline" is navigator.onLine.
 */
import { app, esc, go, toast, focusHeading } from "./ui.js";
import { store, partner, partnerName, addItem, queue, hasQueued, flushOutbox, isOnline, resetDevice } from "./store.js";
import { clockIn, zoneCity, dayGreeting, nextTimeIn, todayKey, weekday, clock, detectedZone } from "./time.js";
import { recorderMarkup, createRecorder, waveBars, togglePlayback, PLAY_ICON } from "./recorder.js";

const QUESTIONS = [
  "What made you laugh today?",
  "What's something small you noticed today?",
  "Which song has been stuck in your head?",
  "What would you cook for us tonight?",
  "What are you looking forward to this week?",
  "Where would you take me for a walk right now?",
  "What's one thing you'd tell me in person today?",
];
const todaysQuestion = () => QUESTIONS[Math.floor(Date.parse(todayKey()) / 86_400_000) % QUESTIONS.length];

const INKS = [
  { id: "ink", label: "Ink", color: "#1e1b18" },
  { id: "clay", label: "Clay", color: "#b4533a" },
  { id: "blue", label: "Blue", color: "#4a6fa5" },
];
const PARTNER_INK = "#b4533a";
const REVEAL_HOUR = 21;
const NOTE_MAX = 140;

/* Shared markup */

const banner = (tone, text) => `<p class="banner ${tone}" role="status">${text}</p>`;

const topBar = (title, { right = "", heading = true } = {}) => `
  <header class="top-bar">
    <div class="top-left">
      <a class="top-back" href="#/home" aria-label="Back to Home"><span aria-hidden="true">‹</span></a>
      ${heading ? `<h1 class="top-title" tabindex="-1">${title}</h1>` : `<p class="top-title">${title}</p>`}
    </div>
    ${right}
  </header>`;

const TABS = [["home", "Home"], ["keepsakes", "Keepsakes"], ["settings", "Settings"]];
const tabBar = (active) => `
  <nav class="tab-bar" aria-label="Main">
    ${TABS.map(([id, label]) => `
      <a class="tab" href="#/${id}"${id === active ? ' aria-current="page"' : ""}>
        <span class="tab-icon" aria-hidden="true"></span>${label}
      </a>`).join("")}
  </nav>`;

const noteField = (label, text = "") => `
  <div class="answer-box">
    <label class="visually-hidden" for="note">${label}</label>
    <textarea id="note" name="note" maxlength="${NOTE_MAX}" rows="3" aria-describedby="note-count">${esc(text)}</textarea>
    <p class="count" id="note-count">${text.length} / ${NOTE_MAX}</p>
  </div>`;

function bindNoteField(onInput) {
  const note = app.querySelector("#note");
  const count = app.querySelector("#note-count");
  note.addEventListener("input", () => {
    count.textContent = `${note.value.length} / ${NOTE_MAX}`;
    onInput(note.value);
  });
  return note;
}

const micBlocked = (error) => {
  const unsupported = error.message === "unsupported";
  return `
    <div class="error-panel" role="alert">
      <h2>${unsupported ? "This browser can't record audio" : "The microphone is blocked"}</h2>
      <p>${unsupported
        ? "You can still write a short note instead."
        : "Your browser didn't give this site access to the mic. Allow it in your browser's site settings, then try again."}</p>
      ${unsupported ? "" : `<button type="button" class="button-small" data-retry>Try again</button>`}
    </div>`;
};

/* Home (77:241) with states: sent (78:71), nothing new (78:212), offline (78:289) */

const HUB_VISUALS = {
  idle: `
    <img class="hub-ring" src="assets/hub-ring.svg" width="149.6" height="149.6" alt="" />
    <img class="hub-core" src="assets/hub-core.svg" width="123.2" height="123.2" alt="" />
    <img class="hub-heart" src="assets/hub-heart.svg" width="41.8" height="42.0569" alt="" />`,
  sent: `
    <img class="hub-ring-outer" src="assets/sent-ring-outer.svg" width="168.56" height="168.56" alt="" />
    <img class="hub-ring" src="assets/sent-ring-inner.svg" width="146.2" height="146.2" alt="" />
    <img class="hub-core" src="assets/sent-core.svg" width="120.4" height="120.4" alt="" />
    <img class="hub-heart" src="assets/hub-heart.svg" width="41.8" height="42.0569" alt="" />`,
  queued: `
    <img class="hub-ring" src="assets/offline-ring.svg" width="146.2" height="146.2" alt="" />
    <img class="hub-core" src="assets/offline-core.png" width="120.4" height="120.4" alt="" />
    <img class="hub-heart" src="assets/offline-heart.svg" width="40.85" height="41.1011" alt="" />`,
};

// Warm the cache so the first "sent" or "queued" state doesn't flash in.
["sent-ring-outer.svg", "sent-ring-inner.svg", "sent-core.svg", "offline-ring.svg", "offline-core.png", "offline-heart.svg"]
  .forEach((file) => { new Image().src = `assets/${file}`; });

const hubCaption = (state, p) => ({
  idle: p ? `thinking of ${p.name}?` : "you can send hearts once your partner joins",
  sent: "sent, softly",
  queued: "will send when you're back online",
}[state]);

function heartHub(p) {
  const state = hasQueued() ? "queued" : "idle";
  return `
    <div class="hub">
      <button type="button" class="hub-button" data-heart aria-label="Send a heart${p ? ` to ${esc(p.name)}` : ""}"${p ? "" : " disabled"}>
        <span class="hub-visual" data-hub-visual>${HUB_VISUALS[state]}</span>
      </button>
      <p class="hub-caption ${state}" data-hub-caption aria-live="polite">${esc(hubCaption(state, p))}</p>
    </div>`;
}

function setHub(state, p) {
  const visual = app.querySelector("[data-hub-visual]");
  const caption = app.querySelector("[data-hub-caption]");
  if (!visual) return; // left Home already
  visual.innerHTML = HUB_VISUALS[state];
  caption.className = `hub-caption ${state}`;
  caption.textContent = hubCaption(state, p);
}

function sendHeart(p) {
  const heart = { type: "heart", from: "me", at: Date.now() };
  if (!isOnline()) {
    queue(heart);
    setHub("queued", p);
    return;
  }
  addItem(heart);
  setHub("sent", p);
  setTimeout(() => setHub("idle", p), 1500);
}

function arrivalCard(p) {
  if (!p) {
    return `
      <a class="card sand" href="#/invite">
        <span class="card-text"><strong>Waiting for your partner</strong><span>Share your invite link</span></span>
      </a>`;
  }
  const page = store.get("page", {});
  if ((page.partnerUpdatedAt ?? 0) > (page.seenAt ?? 0)) {
    return `
      <a class="card blush" href="#/doodle">
        <img src="assets/icon-arrival-doodle.svg" width="30.96" height="30.96" alt="" />
        <span class="card-text"><strong>${esc(p.name)} left you a doodle</strong><span>tap to see your page</span></span>
      </a>`;
  }
  return `
    <div class="card sand">
      <span class="card-text"><strong>Nothing new right now</strong><span>That's okay. Send something whenever you like.</span></span>
    </div>`;
}

const questionCard = () => `
  <a class="card sand question-card" href="#/ritual">
    <span class="eyebrow">Today's question</span>
    <span class="question">${esc(todaysQuestion())}</span>
  </a>`;

const sendRow = () => `
  <div class="send-row">
    <a class="send" href="#/voice"><img src="assets/icon-voice.svg" width="41.28" height="41.28" alt="" />Voice note</a>
    <a class="send" href="#/doodle"><img src="assets/icon-doodle.svg" width="41.28" height="41.28" alt="" />Doodle</a>
  </div>`;

const partnerMeta = (p) => {
  if (!p) return "Not paired yet";
  return esc(p.name) + (p.timeZone ? ` · ${clockIn(p.timeZone)} in ${esc(zoneCity(p.timeZone))}` : "");
};

export function home() {
  const p = partner();
  const offline = !isOnline();
  app.innerHTML = `
    <section class="screen loop-screen">
      ${offline ? banner("amber", "You're offline. Anything you send will go out when you reconnect.") : ""}
      <header class="home-header">
        <h1 class="home-title" tabindex="-1">${dayGreeting()}</h1>
        <p class="meta">${partnerMeta(p)}</p>
      </header>
      ${heartHub(p)}
      ${arrivalCard(p)}
      ${questionCard()}
      ${offline ? "" : sendRow()}
      <div class="spacer"></div>
      ${tabBar("home")}
    </section>`;
  app.querySelector("[data-heart]").addEventListener("click", () => sendHeart(p));
}

const onHome = () => location.hash.startsWith("#/home");
addEventListener("online", () => {
  flushOutbox();
  if (onHome()) home();
});
addEventListener("offline", () => {
  if (onHome()) home();
});

/* Voice note (77:298) with states: left (78:121), mic blocked (78:329) */

function confirmLeft(name, deliverNow, tz) {
  const detail = deliverNow
    ? `It's on its way to ${esc(name)}.`
    : `It arrives with ${esc(name)}'s morning:<br />7:30 am in ${esc(zoneCity(tz))}.`;
  app.insertAdjacentHTML("beforeend", `
    <div class="sheet-backdrop" data-sheet>
      <div class="sheet" role="status" tabindex="-1">
        <img src="assets/check.svg" width="48.16" height="48.16" alt="" />
        <h2 class="sheet-title">Left for ${esc(name)}</h2>
        <p class="body center">${detail}</p>
        <p class="fine">You won't be asked to check on it.</p>
      </div>
    </div>`);

  const sheet = app.querySelector("[data-sheet]");
  const close = () => sheet.isConnected && go("/home");
  sheet.querySelector(".sheet").focus();
  sheet.addEventListener("click", close);
  sheet.addEventListener("keydown", (e) => ["Escape", "Enter", " "].includes(e.key) && close());
  setTimeout(close, 3000);
}

export function voice() {
  const name = partnerName();
  const tz = partner()?.timeZone ?? detectedZone();
  app.innerHTML = `
    <form class="screen" novalidate>
      ${topBar(`Voice note for ${esc(name)}`)}
      <p class="hint">Up to 30 seconds. Say one thing.</p>
      <div class="voice-body" data-body></div>
      <fieldset class="segmented">
        <legend class="eyebrow">When should it arrive?</legend>
        <div class="segmented-options">
          <label><input type="radio" name="deliver" value="now" />Now</label>
          <label><input type="radio" name="deliver" value="morning" checked />${esc(name)}'s morning · 7:30 am</label>
        </div>
      </fieldset>
      <div class="spacer"></div>
      <p class="fine">${esc(name)} won't be asked to reply, and you won't see when it's played.</p>
      <button type="submit" class="button primary" data-submit disabled>Leave it for ${esc(name)}</button>
    </form>`;

  const form = app.querySelector("form");
  const body = form.querySelector("[data-body]");
  const submit = form.querySelector("[data-submit]");
  let mode = "record"; // record | blocked | note
  let payload = null;

  const setPayload = (value) => {
    payload = value;
    submit.disabled = !value;
  };

  function showRecorder(autostart = false) {
    mode = "record";
    body.innerHTML = recorderMarkup();
    submit.textContent = `Leave it for ${name}`;
    const recorder = createRecorder(body, {
      onChange: (r) => setPayload(r && { type: "voice", ...r }),
      onBlocked: showBlocked,
    });
    if (autostart) recorder.start();
  }

  function showBlocked(error) {
    mode = "blocked";
    setPayload(null);
    body.innerHTML = micBlocked(error);
    body.querySelector("[data-retry]")?.addEventListener("click", () => showRecorder(true));
    submit.textContent = "Write a short note instead";
    submit.disabled = false;
  }

  function showNote() {
    mode = "note";
    body.innerHTML = noteField(`Note for ${name}`);
    submit.textContent = `Leave it for ${name}`;
    setPayload(null);
    bindNoteField((text) => setPayload(text.trim() && { type: "note", text: text.trim() })).focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (mode === "blocked") return showNote();
    if (!payload) return;

    const deliverNow = form.deliver.value === "now";
    const item = { ...payload, from: "me", at: Date.now(), deliverAt: deliverNow ? Date.now() : nextTimeIn(tz, 7, 30) };
    const saved = isOnline() ? addItem(item) : queue(item);
    if (!saved) return toast("This phone is out of space for recordings");
    confirmLeft(name, deliverNow, tz);
  });

  showRecorder();
}

/* Doodle (77:366) with state: save failed (78:360) */

const toPath = (points) => "M" + (points.length === 1 ? [points[0], points[0]] : points).map((p) => p.join(" ")).join("L");

const strokesMarkup = (strokes = []) => strokes.map((s) =>
  `<path d="${esc(s.d)}" stroke="${esc(s.color)}"${s.transform ? ` transform="${esc(s.transform)}"` : ""} />`).join("");

function bindDrawing(svg, layer, getColor, onStroke) {
  let points = null;
  let path = null;
  const toPoint = (e) => {
    const box = svg.getBoundingClientRect();
    return [((e.clientX - box.left) * 324) / box.width, ((e.clientY - box.top) * 360) / box.height].map((n) => Math.round(n * 10) / 10);
  };

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    points = [toPoint(e)];
    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke", getColor());
    path.setAttribute("d", toPath(points));
    layer.append(path);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!points) return;
    points.push(toPoint(e));
    path.setAttribute("d", toPath(points));
  });
  const end = () => {
    if (!points) return;
    onStroke({ color: getColor(), d: toPath(points) });
    points = null;
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
}

function showSaveFailed() {
  app.querySelector(".screen").insertAdjacentHTML("afterbegin",
    banner("error", "Couldn't save your page. Your lines are safe on this phone."));
  app.querySelector(".canvas").classList.add("failed");
  app.querySelector(".palette").hidden = true;
  app.querySelector("[data-leave]").textContent = "Try again";
}

export function doodle() {
  const name = partnerName();
  const page = { mine: [], partner: [], ...store.get("page", {}), seenAt: Date.now() };
  store.set("page", page);
  const inkColor = () => INKS.find((i) => i.id === store.get("ink", "blue")).color;

  app.innerHTML = `
    <section class="screen">
      ${topBar("Our page", { right: `<button type="button" class="top-action" data-clear>Clear mine</button>` })}
      <div class="canvas">
        <svg viewBox="0 0 324 360" data-canvas role="img" aria-label="Your shared page with ${esc(name)}. Draw on it with a finger, stylus or mouse.">
          <defs>
            <pattern id="dots" width="30" height="30" x="27.8" y="27.8" patternUnits="userSpaceOnUse">
              <image href="assets/grid-dot.svg" width="2" height="2" />
            </pattern>
          </defs>
          <rect width="324" height="360" fill="url(#dots)" />
          <g data-partner>${strokesMarkup(page.partner)}</g>
          <g data-mine>${strokesMarkup(page.mine)}</g>
        </svg>
      </div>
      <ul class="legend" aria-label="Key">
        <li><span class="dot" data-my-dot style="--dot: ${inkColor()}"></span>you</li>
        <li><span class="dot" style="--dot: ${PARTNER_INK}"></span>${esc(name)}</li>
      </ul>
      <fieldset class="palette">
        <legend class="visually-hidden">Ink colour</legend>
        ${INKS.map((ink) => `
          <label class="swatch">
            <input type="radio" name="ink" value="${ink.id}"${ink.color === inkColor() ? " checked" : ""} />
            <span class="swatch-color" style="--swatch: ${ink.color}"></span>
            <span class="visually-hidden">${ink.label}</span>
          </label>`).join("")}
      </fieldset>
      <div class="spacer"></div>
      <button type="button" class="button primary" data-leave>Leave it on our page</button>
    </section>`;

  const mine = app.querySelector("[data-mine]");
  const saveDraft = () => store.set("page", page);

  bindDrawing(app.querySelector("[data-canvas]"), mine, inkColor, (stroke) => {
    page.mine.push(stroke);
    saveDraft();
  });

  app.querySelector(".palette").addEventListener("change", (e) => {
    store.set("ink", e.target.value);
    app.querySelector("[data-my-dot]").style.setProperty("--dot", inkColor());
  });

  app.querySelector("[data-clear]").addEventListener("click", () => {
    page.mine = [];
    mine.replaceChildren();
    saveDraft();
    toast("Cleared your lines");
  });

  app.querySelector("[data-leave]").addEventListener("click", () => {
    if (!isOnline()) return showSaveFailed();
    store.set("page", { ...page, savedAt: Date.now() });
    addItem({ type: "doodle", from: "me", at: Date.now() });
    go("/home");
    toast("Left on our page");
  });
}

/* Daily question: answer (77:514), sealed (78:190), failed (78:500), reveal (77:548) */

const isRevealed = (entry) => Boolean(entry.partner) || new Date().getHours() >= REVEAL_HOUR;

export function ritual() {
  const entry = store.get("answers", {})[todayKey()];
  if (!entry?.me) return ritualAnswer();
  return isRevealed(entry) ? ritualReveal(entry) : ritualSealed();
}

function showSealFailed() {
  app.querySelector(".banner")?.remove();
  app.querySelector(".screen").insertAdjacentHTML("afterbegin",
    banner("error", "Couldn't seal your answer. The connection dropped, but your draft is saved."));
  app.querySelector(".answer-box")?.classList.add("failed");
  app.querySelector("[data-submit]").textContent = "Try sealing again";
}

function sealAnswer(question, answer) {
  const answers = store.get("answers", {});
  answers[todayKey()] = { ...answers[todayKey()], question, me: answer, sealedAt: Date.now() };
  if (!store.set("answers", answers)) return toast("This phone is out of space for recordings");
  store.clear("ritualDraft");
  addItem({ type: "answer", from: "me", at: Date.now(), question });
  ritual();
  focusHeading();
}

function ritualAnswer() {
  const question = todaysQuestion();
  app.innerHTML = `
    <form class="screen" novalidate>
      ${topBar("Today's question", { heading: false })}
      <h1 class="question-title" tabindex="-1">${esc(question)}</h1>
      <fieldset class="modes">
        <legend class="visually-hidden">Answer by</legend>
        <label class="mode"><input type="radio" name="mode" value="write" checked />Write</label>
        <label class="mode"><input type="radio" name="mode" value="voice" />Voice · 30 s</label>
      </fieldset>
      <div class="answer-body" data-body></div>
      <p class="fine">You answer once. It stays sealed until you've both answered, or 9 pm.</p>
      <div class="spacer"></div>
      <button type="submit" class="button primary" data-submit>Seal my answer</button>
    </form>`;

  const form = app.querySelector("form");
  const body = form.querySelector("[data-body]");
  const submit = form.querySelector("[data-submit]");
  let answer = null;

  const setAnswer = (value) => {
    answer = value;
    submit.disabled = !value;
  };

  function showWrite() {
    body.innerHTML = noteField("Your answer", store.get("ritualDraft", ""));
    const note = bindNoteField((text) => {
      store.set("ritualDraft", text);
      setAnswer(text.trim() && { kind: "text", text: text.trim() });
    });
    setAnswer(note.value.trim() && { kind: "text", text: note.value.trim() });
  }

  function showVoice() {
    setAnswer(null);
    body.innerHTML = recorderMarkup();
    createRecorder(body, {
      onChange: (r) => setAnswer(r && { kind: "voice", ...r }),
      onBlocked: (error) => {
        body.innerHTML = micBlocked(error);
        body.querySelector("[data-retry]")?.addEventListener("click", showVoice);
      },
    });
  }

  form.addEventListener("change", (e) => {
    if (e.target.name === "mode") (e.target.value === "voice" ? showVoice : showWrite)();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!answer) return;
    if (!isOnline()) return showSealFailed();
    sealAnswer(question, answer);
  });

  showWrite();
}

function ritualSealed() {
  app.innerHTML = `
    <section class="screen">
      ${topBar("Today's question", { heading: false })}
      <h1 class="question-title" tabindex="-1">${esc(todaysQuestion())}</h1>
      <div class="card blush sealed-card">
        <span class="card-text"><strong>Your answer is sealed</strong><span>Opens when you've both answered, or at 9 pm.</span></span>
      </div>
      <div class="spacer"></div>
      <a class="button secondary" href="#/home">Back to Home</a>
    </section>`;
}

const answerOf = (label) => (label === "You" ? "your answer" : `${label}'s answer`);

function answerCard(label, answer, tone, index) {
  const content = answer.kind === "voice"
    ? `<div class="voice-player">
         <button type="button" class="play" data-play="${index}" aria-label="Play ${esc(answerOf(label))}">${PLAY_ICON}</button>
         <div class="wave" aria-hidden="true">${waveBars(answer.bars)}</div>
       </div>
       <p class="meta">voice answer · ${clock(answer.duration)}</p>`
    : `<p class="answer-text">${esc(answer.text)}</p>`;
  return `<article class="answer-card ${tone}"><h2 class="eyebrow">${esc(label)}</h2>${content}</article>`;
}

function ritualReveal(entry) {
  const name = partnerName();
  const answers = [["You", entry.me, "sand"], entry.partner && [name, entry.partner, "blush"]].filter(Boolean);
  app.innerHTML = `
    <section class="screen">
      ${topBar("Today's answers", { heading: false })}
      <p class="eyebrow moss">${entry.partner ? "Opened · you both answered" : "Opened at 9 pm"}</p>
      <h1 class="reveal-question" tabindex="-1">${esc(entry.question)}</h1>
      ${answers.map(([label, answer, tone], i) => answerCard(label, answer, tone, i)).join("")}
      <p class="fine">Saved to Keepsakes.</p>
      <div class="spacer"></div>
      <a class="button secondary" href="#/home">Back to Home</a>
    </section>`;

  app.querySelectorAll("[data-play]").forEach((button) => {
    const [label, answer] = answers[button.dataset.play];
    button.addEventListener("click", () => togglePlayback(button, answer.audio, answerOf(label)));
  });
}

/* Keepsakes: empty state (78:259). The filled designs (77:627, 77:685) come next. */

const KEEP_LABELS = { heart: "A heart", voice: "A voice note", note: "A note", doodle: "Our page", answer: "Today's question" };

export function keepsakes() {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const recent = store.get("items", []).filter((item) => item.at > weekAgo).reverse();
  app.innerHTML = `
    <section class="screen loop-screen">
      <h1 class="title" tabindex="-1">Keepsakes</h1>
      ${recent.length
        ? `<ul class="keep-list">${recent.map((item) => `
            <li><span>${KEEP_LABELS[item.type]}</span><time datetime="${new Date(item.at).toISOString()}">${weekday(item.at)}</time></li>`).join("")}
          </ul>`
        : `<div class="empty-state">
            <h2>Your first keepsakes will appear here</h2>
            <p>Send a heart, a doodle or answer today's question. There's no rush.</p>
          </div>`}
      <div class="spacer"></div>
      ${tabBar("keepsakes")}
    </section>`;
}

/* Settings: placeholder until the settings design (77:737) is built. */

export function settings() {
  app.innerHTML = `
    <section class="screen loop-screen">
      <h1 class="title" tabindex="-1">Settings</h1>
      <p class="body">Time zone, reveal time, notifications and unpairing come with the next set of screens.</p>
      <div class="spacer"></div>
      <button type="button" class="button secondary" data-reset>Start over (clear this device)</button>
      ${tabBar("settings")}
    </section>`;
  app.querySelector("[data-reset]").addEventListener("click", () => {
    if (!confirm("Clear your account, space and keepsakes from this device?")) return;
    resetDevice();
    go("/");
  });
}

/*
 * #/demo — pairs this device with a sample partner so the loop can be tried without a
 * second phone: Maya's doodle (the swirl from 77:490) and her answer to today's question.
 */
export function demo() {
  const me = store.get("user") ?? { name: "Sam", email: null, timeZone: detectedZone() };
  store.set("user", me);
  store.set("space", {
    code: "DEMO",
    expires: 0,
    partner: { name: "Maya", timeZone: me.timeZone === "Europe/Lisbon" ? "America/Denver" : "Europe/Lisbon" },
  });

  const swirl = {
    color: PARTNER_INK,
    transform: "translate(178.8 208.8) scale(1.136)",
    d: "M1.694 59.7744C1.694 40.4144 21.054 30.7344 35.574 40.4144C48.158 50.0944 40.414 69.4544 25.894 67.5184C13.31 65.5824 15.246 50.0944 26.862 50.0944M50.094 21.0544L57.838 11.3744M63.646 38.4784L75.262 36.5424M42.35 9.4384L40.414 1.6944",
  };
  store.set("page", { mine: [], ...store.get("page", {}), partner: [swirl], partnerUpdatedAt: Date.now(), seenAt: 0 });

  const answers = store.get("answers", {});
  answers[todayKey()] = {
    ...answers[todayKey()],
    question: todaysQuestion(),
    partner: { kind: "text", text: "A pigeon walked onto the tram, rode two stops and got off like it had a meeting." },
  };
  store.set("answers", answers);
  go("/home");
}
