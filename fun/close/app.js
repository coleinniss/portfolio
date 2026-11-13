import { app, go, focusHeading } from "./ui.js";
import { store } from "./store.js";
import * as setup from "./setup.js";
import * as loop from "./loop.js";

const routes = {
  "": () => (store.get("user") ? setup.afterAuth() : setup.landing()),
  signup: () => setup.auth("signup"),
  login: () => setup.auth("login"),
  join: setup.join,
  invite: setup.invite,
  install: setup.install,
  home: loop.home,
  voice: loop.voice,
  doodle: loop.doodle,
  ritual: loop.ritual,
  keepsakes: loop.keepsakes,
  settings: loop.settings,
  demo: loop.demo,
};
const PUBLIC = new Set(["", "signup", "login", "join", "demo"]);

function route() {
  const [path, query = ""] = location.hash.slice(1).split("?");
  const [name = "", arg] = path.split("/").filter(Boolean);
  if (!Object.hasOwn(routes, name)) return go("/");
  if (!PUBLIC.has(name) && !store.get("user")) return go("/");

  routes[name](arg, new URLSearchParams(query));
  scrollTo(0, 0);
  focusHeading();
}

app.addEventListener("input", (e) => {
  if (e.target.getAttribute("aria-invalid") === "true") setup.setError(e.target.id);
});
addEventListener("hashchange", route);
route();

// Offline support is a nice-to-have; the app works without it.
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
