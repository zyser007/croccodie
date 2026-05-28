/* ===========================================================
   Crocodile Tooth Trap - game logic (vanilla JS)

   Rules:
   - The lower teeth are clickable. One random tooth is the trap.
   - Tapping a safe tooth presses it down and disables it.
   - Tapping the trap tooth snaps the mouth shut -> game over.
   - "Play Again" resets the teeth and picks a new trap tooth.
   =========================================================== */

// --- Configuration -------------------------------------------------
const LOWER_TEETH = 8; // clickable teeth
const UPPER_TEETH = 8; // decorative teeth
const BEST_KEY = "crocTrapBest"; // localStorage key for best streak

// --- DOM references ------------------------------------------------
const croc = document.getElementById("croc");
const lowerTeethEl = document.getElementById("lowerTeeth");
const upperTeethEl = document.getElementById("upperTeeth");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const messageEl = document.getElementById("message");
const replayBtn = document.getElementById("replay");

// --- Game state ----------------------------------------------------
let trapIndex = 0; // which lower tooth is the trap
let pressedCount = 0; // safe teeth pressed this round
let bestScore = 0; // best streak (persisted)
let gameOver = false;
let toothButtons = []; // the clickable lower-tooth elements

// ===================================================================
// Setup
// ===================================================================

function init() {
  buildUpperTeeth();
  buildLowerTeeth();

  bestScore = Number(localStorage.getItem(BEST_KEY)) || 0;
  bestEl.textContent = bestScore;

  replayBtn.addEventListener("click", () => {
    sound.unlock();
    startRound();
  });

  startRound();
}

// Decorative upper teeth - not clickable
function buildUpperTeeth() {
  for (let i = 0; i < UPPER_TEETH; i++) {
    const tooth = document.createElement("div");
    tooth.className = "tooth";
    upperTeethEl.appendChild(tooth);
  }
}

// Clickable lower teeth - these are the buttons the player taps
function buildLowerTeeth() {
  for (let i = 0; i < LOWER_TEETH; i++) {
    const tooth = document.createElement("button");
    tooth.type = "button";
    tooth.className = "tooth";
    tooth.dataset.index = i;
    tooth.addEventListener("click", () => onToothTap(i));
    lowerTeethEl.appendChild(tooth);
    toothButtons.push(tooth);
  }
}

// ===================================================================
// Round lifecycle
// ===================================================================

function startRound() {
  gameOver = false;
  pressedCount = 0;
  trapIndex = Math.floor(Math.random() * LOWER_TEETH);

  // Reset visuals on every tooth
  toothButtons.forEach((tooth) => {
    tooth.classList.remove("pressed", "trap");
    tooth.disabled = false;
  });

  croc.classList.remove("biting");
  messageEl.classList.remove("gameover");
  messageEl.textContent = "Tap the teeth… one is a trap!";
  updateScore();
}

function onToothTap(index) {
  if (gameOver) return;

  const tooth = toothButtons[index];
  if (tooth.classList.contains("pressed")) return; // already used

  sound.unlock(); // first tap also enables audio on mobile

  if (index === trapIndex) {
    triggerTrap(tooth);
  } else {
    pressSafeTooth(tooth);
  }
}

// Safe tooth: sink it down, score a point, keep playing
function pressSafeTooth(tooth) {
  tooth.classList.add("pressed");
  tooth.disabled = true;
  pressedCount++;
  updateScore();

  sound.squeak();
  vibrate(15);

  // If every safe tooth was pressed, the player cleared the round
  const safeTeeth = LOWER_TEETH - 1;
  if (pressedCount >= safeTeeth) {
    winRound();
  }
}

// Trap tooth: SNAP! Game over.
function triggerTrap(tooth) {
  gameOver = true;
  tooth.classList.add("trap");

  croc.classList.add("biting");
  disableAllTeeth();

  messageEl.textContent = "CHOMP! Game Over";
  messageEl.classList.add("gameover");

  sound.snap();
  setTimeout(() => sound.lose(), 180);
  vibrate([0, 60, 40, 120]);

  saveBest();
}

// Cleared every safe tooth without hitting the trap
function winRound() {
  gameOver = true;
  disableAllTeeth();
  messageEl.textContent = "You survived! \u{1F389}";
  sound.win();
  saveBest();
}

// ===================================================================
// Helpers
// ===================================================================

function updateScore() {
  scoreEl.textContent = pressedCount;
}

function disableAllTeeth() {
  toothButtons.forEach((tooth) => (tooth.disabled = true));
}

function saveBest() {
  if (pressedCount > bestScore) {
    bestScore = pressedCount;
    bestEl.textContent = bestScore;
    localStorage.setItem(BEST_KEY, String(bestScore));
  }
}

// Vibration support (no-op on unsupported devices)
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// ===================================================================
// Sound - tiny Web Audio synth so we need no audio files.
// The AudioContext must be created/resumed from a user gesture.
// ===================================================================
const sound = (() => {
  let ctx = null;

  function unlock() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  // Play a simple oscillator tone
  function tone(freqStart, freqEnd, duration, type = "square", gain = 0.15) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const vol = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.linearRampToValueAtTime(freqEnd, now + duration);

    vol.gain.setValueAtTime(gain, now);
    vol.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(vol).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  // Short noise burst for the bite "snap"
  function noise(duration, gain = 0.3) {
    if (!ctx) return;
    const size = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / size); // fade out
    }
    const src = ctx.createBufferSource();
    const vol = ctx.createGain();
    vol.gain.value = gain;
    src.buffer = buffer;
    src.connect(vol).connect(ctx.destination);
    src.start();
  }

  return {
    unlock,
    squeak: () => tone(520, 880, 0.12, "square", 0.12),
    snap: () => {
      noise(0.12, 0.35);
      tone(180, 60, 0.18, "sawtooth", 0.2);
    },
    lose: () => tone(400, 90, 0.5, "triangle", 0.18),
    win: () => {
      tone(523, 523, 0.12, "square", 0.14);
      setTimeout(() => tone(659, 659, 0.12, "square", 0.14), 120);
      setTimeout(() => tone(784, 784, 0.18, "square", 0.14), 240);
    },
  };
})();

// Kick everything off
init();
