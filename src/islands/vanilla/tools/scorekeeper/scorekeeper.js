import { esc, showConfirm } from "../../../../lib/ui.js";

// Every player is stored under this prefix so "Delete All Players" only ever
// touches scorekeeper data — localStorage is shared with the rest of the app
// (today/week streaks, barcode scan rate limiting live there too).
const STORAGE_PREFIX = "nawtch-scorekeeper:";

document.getElementById("player-input").addEventListener("submit", (event) => {
  event.preventDefault();
  checkPlayer();
});

document.getElementById("clear-all-btn").addEventListener("click", async (event) => {
  event.preventDefault();
  if (!(await showConfirm("Delete all players? This cannot be undone.", "Delete All"))) return;
  clearAllPlayers();
});

document.getElementById("reset-all-btn").addEventListener("click", async (event) => {
  event.preventDefault();
  if (!(await showConfirm("Reset all player scores to 0?", "Reset All"))) return;
  resetAllScores();
});

document.getElementById("plus").addEventListener("click", (event) => {
  event.preventDefault();
  addScore();
});

document.getElementById("minus").addEventListener("click", (event) => {
  event.preventDefault();
  subtractScore();
});

retrieveAllPlayers();

function updateEmptyState() {
  const target = document.getElementById("card-set");
  let hint = document.getElementById("sk-empty-hint");
  if (target.querySelector(".sk-player-card")) {
    hint?.remove();
    return;
  }
  if (!hint) {
    hint = document.createElement("p");
    hint.id = "sk-empty-hint";
    hint.className = "sk-empty-hint";
    hint.textContent = "No players yet — add one above to get started.";
    target.appendChild(hint);
  }
}

// Add new player. Checks if user entered info and creates a new card
function addNewPlayer(name, score) {
  const target = document.getElementById("card-set");
  const nameHandle = name.replace(/ /g, "-");

  if (name.includes("-")) {
    name = name.replace(/-/g, " ");
  }

  const card = document.createElement("div");
  card.className = "sk-player-card";
  card.dataset.player = nameHandle;
  card.innerHTML = `
    <div class="sk-player-name" id="${nameHandle}">${esc(name)}</div>
    <div class="sk-player-score" id="${nameHandle}-score">${esc(String(score))}</div>
  `;

  card.addEventListener("click", () => {
    document.querySelectorAll(".sk-player-card.selected").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
  });

  target.appendChild(card);
  addToStorage(nameHandle, score);
  updateEmptyState();
}

// Add the new player to localStorage
function addToStorage(name, score) {
  const player = {
    userName: name,
    userScore: score,
  };
  localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(player));
}

// Get all players currently in localStorage so cards persist across reloads
function retrieveAllPlayers() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(STORAGE_PREFIX)) continue;
    const player = JSON.parse(localStorage.getItem(key));
    if (player && player.userName) {
      addNewPlayer(player.userName, player.userScore);
    }
  }
  orderPlayers(true);
  updateEmptyState();
}

// check if player name and score exist then call addNewPlayer
function checkPlayer() {
  let name = document.getElementById("player-name").value.trim();
  let score = document.getElementById("player-score").value;
  const nameHandle = name.replace(/ /g, "-");

  if (!name) {
    // nothing entered
  } else if (localStorage.getItem(STORAGE_PREFIX + nameHandle) || document.getElementById(nameHandle)) {
    // player already exists
  } else {
    if (score === "") {
      score = 0;
    }
    addNewPlayer(name, score);
  }
  document.getElementById("player-name").value = "";
  document.getElementById("player-score").value = "";
}

// Clear all players from the DOM and from localStorage
function clearAllPlayers() {
  document.querySelectorAll(".sk-player-card").forEach((card) => {
    localStorage.removeItem(STORAGE_PREFIX + card.dataset.player);
    card.remove();
  });
  updateEmptyState();
}

// reset all player scores back to 0
function resetAllScores() {
  document.querySelectorAll(".sk-player-card").forEach((card) => {
    const name = card.dataset.player;
    document.getElementById(name + "-score").textContent = "0";
    const player = JSON.parse(localStorage.getItem(STORAGE_PREFIX + name));
    player.userScore = "0";
    localStorage.setItem(STORAGE_PREFIX + name, JSON.stringify(player));
  });
}

// subtract user score with score increment
function subtractScore() {
  const target = getTarget();
  if (!target) return;

  const scoreIncrement = Number(document.getElementById("score-update").value);
  if (!scoreIncrement) return;

  const scoreEl = document.getElementById(target + "-score");
  const totalScore = Number(scoreEl.textContent) - scoreIncrement;
  scoreEl.textContent = totalScore;

  const player = JSON.parse(localStorage.getItem(STORAGE_PREFIX + target));
  player.userScore = totalScore.toString();
  localStorage.setItem(STORAGE_PREFIX + target, JSON.stringify(player));

  orderPlayers(false);
}

// add score increment to user score
function addScore() {
  const target = getTarget();
  if (!target) return;

  const scoreIncrement = Number(document.getElementById("score-update").value);
  if (!scoreIncrement) return;

  const scoreEl = document.getElementById(target + "-score");
  const totalScore = Number(scoreEl.textContent) + scoreIncrement;
  scoreEl.textContent = totalScore;

  const player = JSON.parse(localStorage.getItem(STORAGE_PREFIX + target));
  player.userScore = totalScore.toString();
  localStorage.setItem(STORAGE_PREFIX + target, JSON.stringify(player));

  orderPlayers(false);
}

// order players highest score to lowest; skips the slide-down animation
// after the initial load so re-sorting on a score change doesn't re-animate.
function orderPlayers(animate) {
  const target = document.getElementById("card-set");
  const cards = Array.from(document.querySelectorAll(".sk-player-card"));

  cards.forEach((card) => card.classList.toggle("no-animate", !animate));

  cards.sort((a, b) => {
    const x = Number(a.querySelector(".sk-player-score").textContent);
    const y = Number(b.querySelector(".sk-player-score").textContent);
    return y - x;
  });

  cards.forEach((card) => target.appendChild(card));
}

// currently selected player, or '' if none
function getTarget() {
  const card = document.querySelector(".sk-player-card.selected");
  return card ? card.dataset.player : "";
}
