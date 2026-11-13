/*
 * Setup flow (Figma: "09 · Wireframes · setup" + "State · join-expired").
 * Landing → Sign up / Log in → Invite partner → (partner) Join → Add to Home Screen.
 * The invite link carries the inviter's name, time zone and expiry. "Works once" is
 * only enforced per device until there's a server.
 */
import { app, esc, initial, firstName, go, toast } from "./ui.js";
import { store } from "./store.js";
import { detectedZone, allZones, zoneLabel } from "./time.js";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;
const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

function newCode() {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // no 0/O/1/I
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => alphabet[b % alphabet.length]).join("");
}

function inviteUrl(space, user) {
  const q = new URLSearchParams({ from: firstName(user.name), tz: user.timeZone, exp: space.expires });
  return `${location.origin}${location.pathname}#/join/${space.code}?${q}`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Native share sheet where available, clipboard otherwise.
async function shareOrCopy(data) {
  if (navigator.share) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (e) {
      if (e.name === "AbortError") return "cancelled";
    }
  }
  return (await copy(data.url ?? data.text)) ? "copied" : "failed";
}

/* Shared markup */

const field = ({ id, label, type = "text", autocomplete }) => `
  <div class="field">
    <label for="${id}">${label}</label>
    <input class="input" id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}"
      aria-describedby="${id}-error" />
    <p class="error" id="${id}-error"></p>
  </div>`;

const timeZoneRow = (tz) => `
  <div class="tz">
    <label for="tz">Your time zone</label>
    <strong id="tz-label" aria-hidden="true">${esc(zoneLabel(tz))}</strong>
    <select id="tz">
      ${allZones().map((z) => `<option value="${esc(z)}"${z === tz ? " selected" : ""}>${esc(z.replace(/_/g, " "))}</option>`).join("")}
    </select>
  </div>`;

function bindTimeZone(onChange) {
  const select = document.getElementById("tz");
  select.addEventListener("change", () => {
    document.getElementById("tz-label").textContent = zoneLabel(select.value);
    onChange(select.value);
  });
}

// Decorative: names are always stated in the surrounding text.
const pair = (left, right, pending = false) => `
  <div class="pair" aria-hidden="true">
    <div class="avatar left"><img src="assets/ellipse-sand.svg" width="70.4" height="70.4" alt="" /><span>${esc(left)}</span></div>
    <div class="avatar right${pending ? " pending" : ""}">
      <img src="${pending ? "assets/ellipse-dashed.png" : "assets/ellipse-blush.svg"}" width="70.4" height="70.4" alt="" />
      <span id="pair-right">${esc(right)}</span>
    </div>
  </div>`;

export function setError(id, msg = "") {
  document.getElementById(id).setAttribute("aria-invalid", String(Boolean(msg)));
  document.getElementById(id + "-error").textContent = msg;
}

/* Screens */

// Landing (77:71)
export function landing() {
  app.innerHTML = `
    <section class="screen">
      <div class="spacer"></div>
      <img class="two-circles" src="assets/two-circles.svg" width="287.76" height="149.6" alt="" />
      <h1 class="hero-title" tabindex="-1">A small way to stay close.</h1>
      <p class="body">One private space for the two of you. Send a heart, a voice note or a doodle, answer one question a day. No feeds, no read receipts.</p>
      <div class="spacer"></div>
      <a class="button primary" href="#/signup">Create an account</a>
      <a class="button secondary" href="#/login">I already have an account</a>
    </section>`;
}

// Returns true when valid; marks each invalid field.
function validateAuth(form, signup) {
  const checks = [
    ["email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.value.trim()), "That email doesn't look right"],
    ["password", form.password.value.length >= 8, "Use at least 8 characters"],
  ];
  if (signup) checks.unshift(["name", form.name.value.trim() !== "", "Tell us what your partner calls you"]);

  checks.forEach(([id, ok, msg]) => setError(id, ok ? "" : msg));
  const firstInvalid = checks.find(([, ok]) => !ok);
  if (firstInvalid) form[firstInvalid[0]].focus();
  return !firstInvalid;
}

// Sign up (77:97) and its Log in variant
export function auth(mode) {
  const signup = mode === "signup";
  app.innerHTML = `
    <form class="screen" novalidate>
      <a class="back" href="#/"><span aria-hidden="true">‹ </span>Back</a>
      <h1 class="title" tabindex="-1">${signup ? "Create your account" : "Welcome back"}</h1>
      ${signup ? field({ id: "name", label: "Your name", autocomplete: "given-name" }) : ""}
      ${field({ id: "email", label: "Email", type: "email", autocomplete: "email" })}
      ${field({ id: "password", label: "Password", type: "password", autocomplete: signup ? "new-password" : "current-password" })}
      <button type="button" class="text-link" data-forgot>Forgot password?</button>
      <div class="spacer"></div>
      <button type="submit" class="button primary">Continue</button>
      <p class="fine center">
        ${signup
          ? `Already have an account? <a class="text-link" href="#/login">Log in</a>`
          : `New here? <a class="text-link" href="#/signup">Create an account</a>`}
      </p>
    </form>`;

  const form = app.querySelector("form");
  form.querySelector("[data-forgot]").addEventListener("click", () => toast("Password reset isn't built yet"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validateAuth(form, signup)) return;

    const email = form.email.value.trim();
    if (signup) {
      store.set("user", { name: form.name.value.trim(), email, timeZone: detectedZone() });
    } else if (store.get("user")?.email?.toLowerCase() !== email.toLowerCase()) {
      setError("email", "We couldn't find that account on this device");
      form.email.focus();
      return;
    }
    afterAuth();
  });
}

export function afterAuth() {
  go(store.get("space")?.partner ? "/home" : "/invite");
}

function currentInvite() {
  const space = store.get("space");
  if (space && !space.partner && Date.now() < space.expires) return space;
  const fresh = { code: newCode(), expires: Date.now() + INVITE_TTL_MS, partner: null };
  store.set("space", fresh);
  return fresh;
}

// Invite partner (77:129)
export function invite() {
  const user = store.get("user");
  const url = inviteUrl(currentInvite(), user);
  app.innerHTML = `
    <section class="screen">
      <h1 class="title" tabindex="-1">Invite your partner</h1>
      <p class="body">This space is for the two of you. Send this link to one person.</p>
      ${pair(initial(user.name), "?", true)}
      <div class="link-field">
        <a class="url" href="${esc(url)}">${esc(url.replace(/^https?:\/\//, ""))}</a>
        <button type="button" class="text-link" data-copy aria-label="Copy invite link">Copy</button>
      </div>
      <button type="button" class="button primary" data-share>Share link</button>
      ${timeZoneRow(user.timeZone || detectedZone())}
      <p class="fine">The link works once and expires after 24 hours.</p>
      <div class="spacer"></div>
      <a class="text-link next-link" href="#/install">Next: add to Home Screen</a>
    </section>`;

  app.querySelector("[data-copy]").addEventListener("click", async () => {
    toast((await copy(url)) ? "Link copied" : "Couldn't copy. Press and hold the link instead");
  });
  app.querySelector("[data-share]").addEventListener("click", async () => {
    const result = await shareOrCopy({
      title: "Join my space",
      text: `${firstName(user.name)} made a private space for the two of you.`,
      url,
    });
    if (result === "copied") toast("Link copied");
    if (result === "failed") toast("Couldn't share. Try Copy instead");
  });
  bindTimeZone((tz) => store.set("user", { ...user, timeZone: tz }));
}

function isInviteUsable(code, expires) {
  return Boolean(code && expires) && Date.now() < expires && !store.get("usedInvites", []).includes(code);
}

// State · join-expired (78:530)
function joinExpired(from) {
  app.innerHTML = `
    <section class="screen">
      <h1 class="title alert" tabindex="-1">This invite has expired</h1>
      <p class="body">Invites work once and last 24 hours, so your space stays private. ${esc(from)} can send a new one in a few seconds.</p>
      <div class="spacer"></div>
      <button type="button" class="button primary" data-ask>Ask ${esc(from)} for a new link</button>
    </section>`;

  app.querySelector("[data-ask]").addEventListener("click", async () => {
    const result = await shareOrCopy({ text: `Hey ${from}, the invite link expired. Could you send me a new one?` });
    if (result === "copied") toast(`Message copied. Paste it to ${from}`);
    if (result === "failed") toast(`Ask ${from} to open Invite again`);
  });
}

// Partner joins (77:161)
export function join(code, params) {
  const from = (params.get("from") || "Your partner").slice(0, 40);
  const fromZone = params.get("tz");
  const expires = Number(params.get("exp"));
  if (!isInviteUsable(code, expires)) return joinExpired(from);

  let tz = detectedZone();
  app.innerHTML = `
    <form class="screen" novalidate>
      <h1 class="title" tabindex="-1">${esc(from)} invited you</h1>
      <p class="body">This is a private space for the two of you. Nobody else can join.</p>
      ${pair(initial(from), "")}
      ${field({ id: "name", label: "Your name", autocomplete: "given-name" })}
      ${timeZoneRow(tz)}
      <div class="spacer"></div>
      <button type="submit" class="button primary">Join ${esc(from)}'s space</button>
    </form>`;

  const form = app.querySelector("form");
  form.name.addEventListener("input", () => {
    document.getElementById("pair-right").textContent = initial(form.name.value);
  });
  bindTimeZone((z) => { tz = z; });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    if (!name) {
      setError("name", `Tell us what ${from} calls you`);
      form.name.focus();
      return;
    }
    store.set("usedInvites", [...store.get("usedInvites", []), code]);
    store.set("user", { name, email: null, timeZone: tz });
    store.set("space", { code, expires, partner: { name: from, timeZone: allZones().includes(fromZone) ? fromZone : null } });
    go(isStandalone() ? "/home" : "/install");
  });
}

// Add to Home Screen (77:192)
export function install() {
  const tiles = Array.from({ length: 8 }, (_, i) => i === 4
    ? `<div class="tile app-icon"><img src="assets/heart-white.svg" width="21.736" height="21.8696" alt="" /></div>`
    : `<div class="tile"></div>`).join("");

  app.innerHTML = `
    <section class="screen">
      <h1 class="title" tabindex="-1">Put it on your Home Screen</h1>
      <p class="body">It opens like an app, and on iPhone it's the only way to get gentle notifications.</p>
      <div class="home-screen" aria-hidden="true">${tiles}</div>
      <ol class="steps">
        <li><span class="num" aria-hidden="true">1</span>Tap Share in your browser</li>
        <li><span class="num" aria-hidden="true">2</span>Choose 'Add to Home Screen'</li>
        <li><span class="num" aria-hidden="true">3</span>Open the app from its icon</li>
      </ol>
      <div class="spacer"></div>
      <a class="button primary" href="#/home">I've added it</a>
      <a class="button secondary" href="#/home">Maybe later</a>
    </section>`;
}
