import { TOWERS } from "./data.js";

export function createUI({ onSelectTower, onStartWave }) {
  const gold = document.querySelector("#gold-value");
  const lives = document.querySelector("#lives-value");
  const wave = document.querySelector("#wave-value");
  const waveButton = document.querySelector("#wave-button");
  const hint = document.querySelector("#hint");
  const toast = document.querySelector("#toast");
  const intro = document.querySelector("#intro-card");
  let toastTimeout;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 1900);
  }

  document.querySelector("#dismiss-intro").addEventListener("click", () => intro.classList.add("hidden"));
  document.querySelectorAll("[data-tower]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-tower]").forEach((other) => {
        const selected = other === button;
        other.classList.toggle("selected", selected);
        other.setAttribute("aria-pressed", String(selected));
      });
      onSelectTower(button.dataset.tower);
      hint.textContent = "Click a grassy tile to place your " + TOWERS[button.dataset.tower].name + ".";
    });
  });
  waveButton.addEventListener("click", onStartWave);

  window.addEventListener("keydown", (event) => {
    if (event.repeat || event.target instanceof HTMLInputElement) return;
    if (event.key === "1" || event.key === "2") {
      const type = event.key === "1" ? "bolt" : "cannon";
      document.querySelector('[data-tower="' + type + '"]').click();
    }
    if (event.key.toLowerCase() === " " || event.key.toLowerCase() === "enter") {
      if (!intro.classList.contains("hidden")) intro.classList.add("hidden");
    }
  });

  function render(state) {
    gold.textContent = state.gold;
    lives.textContent = state.lives;
    wave.textContent = state.wave;
    waveButton.disabled = state.waveActive || state.gameOver;
    waveButton.innerHTML = state.gameOver
      ? 'SKYHOLD LOST'
      : state.waveActive
        ? 'WAVE IN PROGRESS <span>…</span>'
        : state.wave > 0
          ? 'NEXT WAVE <span>→</span>'
          : 'START WAVE <span>→</span>';
    if (state.waveActive) hint.textContent = "Defend the island! Towers target the closest enemy to the exit.";
    else if (state.gameOver) hint.textContent = "Your Skyhold has fallen. Refresh to begin a new run.";
    else if (state.wave > 0) hint.textContent = "Build or reposition your strategy, then launch the next wave.";
  }

  return { render, showToast };
}
