export const detectedZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const allZones = () => Intl.supportedValuesOf?.("timeZone") ?? [detectedZone()];
export const zoneCity = (tz) => tz.split("/").pop().replace(/_/g, " ");
export const zoneLabel = (tz) => zoneCity(tz) + (tz === detectedZone() ? " (auto)" : "");

// "4:41 am" in the given zone
export const clockIn = (tz) =>
  new Date().toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).toLowerCase();

function minutesIntoDay(tz) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hourCycle: "h23" })
    .formatToParts(new Date());
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get("hour") * 60 + get("minute");
}

// Timestamp of the next hour:minute wall-clock time in the given zone.
export function nextTimeIn(tz, hour, minute) {
  const wait = (hour * 60 + minute - minutesIntoDay(tz) + 1440) % 1440 || 1440;
  return Date.now() + wait * 60_000;
}

// "Tuesday evening"
export function dayGreeting(date = new Date()) {
  const h = date.getHours();
  const part = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  return `${date.toLocaleDateString("en-US", { weekday: "long" })} ${part}`;
}

export const todayKey = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD, local
export const weekday = (ts) => new Date(ts).toLocaleDateString("en-US", { weekday: "short" });
export const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
