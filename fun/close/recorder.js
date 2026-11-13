import { clock } from "./time.js";

const MAX_MS = 30_000;
const BAR_COUNT = 28;

export const waveBars = (bars = []) =>
  bars.map((level) => `<span style="height: ${Math.max(14, Math.round(level * 100))}%"></span>`).join("");

// Play icon from the reveal screen's voice answer (77:567).
export const PLAY_ICON = `
  <svg viewBox="0 0 29.92 29.92" aria-hidden="true">
    <circle cx="14.96" cy="14.96" r="14.96" fill="#1E1B18"/>
    <path d="M10.56 7.04L22.88 14.96L10.56 22.88V7.04Z" fill="white"/>
  </svg>`;

export function togglePlayback(button, src, label) {
  button.audio ??= new Audio(src);
  const audio = button.audio;
  const setLabel = (playing) => button.setAttribute("aria-label", `${playing ? "Pause" : "Play"} ${label}`);
  audio.onended = () => setLabel(false);
  if (audio.paused) audio.play(); else audio.pause();
  setLabel(!audio.paused);
}

export const recorderMarkup = () => `
  <div class="recorder">
    <button type="button" class="rec-button" data-rec aria-label="Start recording">
      <img class="rec-track" src="assets/rec-track.svg" width="149.6" height="149.6" alt="" />
      <svg class="rec-progress" viewBox="0 0 170 170" aria-hidden="true"><circle cx="85" cy="85" r="80" pathLength="100" /></svg>
      <span class="rec-icon" aria-hidden="true"></span>
    </button>
    <p class="rec-time" data-rec-time>0:00 / 0:30</p>
  </div>
  <div class="rec-controls" data-rec-controls hidden>
    <button type="button" class="text-link muted" data-redo>Redo</button>
    <button type="button" class="wave" data-play aria-label="Play your recording" disabled></button>
    <button type="button" class="text-link" data-done>Done</button>
  </div>`;

const loudness = (samples) =>
  Math.min(1, 4 * Math.sqrt(samples.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / samples.length));

const downsample = (levels, n) =>
  Array.from({ length: n }, (_, i) => levels[Math.floor((i * levels.length) / n)] ?? 0);

/*
 * Wires up recorderMarkup() inside `root`. Calls onChange({ audio, duration, bars })
 * when a recording is ready (null when discarded) and onBlocked(error) when the mic
 * can't be used.
 */
export function createRecorder(root, { onChange, onBlocked }) {
  const $ = (selector) => root.querySelector(selector);
  const button = $("[data-rec]");
  const timeEl = $("[data-rec-time]");
  const ring = $(".rec-progress circle");
  const controls = $("[data-rec-controls]");
  const wave = $("[data-play]");
  let session = null;
  let result = null;

  function draw(ms, levels) {
    timeEl.textContent = `${clock(ms / 1000)} / 0:30`;
    ring.style.strokeDashoffset = String(100 - (ms / MAX_MS) * 100);
    wave.innerHTML = waveBars(levels.slice(-BAR_COUNT));
  }

  function finish(blob, ms, levels) {
    const reader = new FileReader();
    reader.onload = () => {
      result = { audio: reader.result, duration: Math.round(ms / 1000), bars: downsample(levels, BAR_COUNT) };
      wave.innerHTML = waveBars(result.bars);
      wave.disabled = false;
      onChange(result);
    };
    reader.readAsDataURL(blob);
  }

  function release() {
    clearInterval(session.timer);
    session.stream.getTracks().forEach((track) => track.stop());
    session.audioCtx.close();
    session = null;
    button.classList.remove("recording");
  }

  function stop() {
    if (!session) return;
    session.recorder.stop();
    release();
    button.setAttribute("aria-label", "Record again");
  }

  function discard() {
    if (session) {
      session.recorder.onstop = null;
      session.recorder.stop();
      release();
    }
    wave.audio?.pause();
    wave.audio = null;
    result = null;
    draw(0, []);
    controls.hidden = true;
    wave.disabled = true;
    button.setAttribute("aria-label", "Start recording");
    onChange(null);
  }

  async function start() {
    if (!window.MediaRecorder || !navigator.mediaDevices) return onBlocked(new Error("unsupported"));
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      return onBlocked(error);
    }
    discard();

    const recorder = new MediaRecorder(stream);
    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const chunks = [];
    const levels = [];
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = () => finish(new Blob(chunks, { type: recorder.mimeType }), Date.now() - startedAt, levels);
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      levels.push(loudness(samples));
      const elapsed = Math.min(Date.now() - startedAt, MAX_MS);
      draw(elapsed, levels);
      if (elapsed >= MAX_MS) stop();
    }, 150);

    session = { recorder, stream, audioCtx, timer };
    recorder.start();
    button.classList.add("recording");
    button.setAttribute("aria-label", "Stop recording");
    controls.hidden = false;
  }

  button.addEventListener("click", () => (session ? stop() : start()));
  $("[data-done]").addEventListener("click", stop);
  $("[data-redo]").addEventListener("click", discard);
  wave.addEventListener("click", () => result && togglePlayback(wave, result.audio, "your recording"));

  return { start };
}
