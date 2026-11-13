export const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));
export const initial = (name) => (name || "").trim().charAt(0).toUpperCase();
export const firstName = (name) => (name || "").trim().split(/\s+/)[0];
export const go = (path) => { location.hash = "#" + path; };

// Moves focus to the screen's heading so screen readers announce the change.
export const focusHeading = () => app.querySelector("h1")?.focus({ preventScroll: true });

let toastTimer;
export function toast(msg) {
  toastEl.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.textContent = ""; }, 2500);
}
