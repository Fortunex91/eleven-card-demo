window.addEventListener("DOMContentLoaded", () => {
  const peakRow = document.getElementById("peakRow");
  const deckEl = document.getElementById("deck");
  const wasteEl = document.getElementById("waste");
  const stockCount = document.getElementById("stockCount");
  let restartBtn = document.getElementById("restartBtn");

  // ---------- Score/HUD ----------
  let score = 0;
  let streak = 0;

  // Scoring-Konstanten – frei anpassbar:
  const WRONG_COMBO_PENALTY = -5;   // Minuspunkte bei falscher Kombi (>11)
  const PEAK_CLEAR_BONUS = 50;      // Bonus pro komplett geleertem Peak
  const WIN_BONUS = 100;            // Bonus, wenn das gesamte Feld leer ist

  // Für Peak-Clear-Erkennung
  const clearedPeaks = new Set();

  function ensureScoreHud() {
    let hud = document.getElementById("scoreHud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "scoreHud";
      hud.className = "hud-bar";
      hud.innerHTML = `
        <span>Score: <strong id="scoreValue">0</strong></span>
        <span>Streak: <strong id="streakValue">0</strong></span>
      `;
    }
    const target =
      deckEl?.parentElement ||
      document.querySelector(".deck-area") ||
      document.querySelector(".game-container") ||
      document.body;

    if (!hud.isConnected) {
      target.insertBefore(hud, target.firstChild);
    }
    updateScoreHud();
    return hud;
  }

  function updateScoreHud() {
    const s = document.getElementById("scoreValue");
    const st = document.getElementById("streakValue");
    if (s) s.textContent = String(score);
    if (st) st.textContent = String(streak);
  }

  function adjustScore(delta) {
    score += delta;
    if (score < 0) score = 0;
    updateScoreHud();
  }

  // ---------- Tutorial ----------
  function ensureTutorialButton() {
    let btn = document.getElementById("tutorialBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "tutorialBtn";
      btn.type = "button";
      btn.textContent = "Tutorial";
      btn.className = "ui-button";
      btn.onclick = toggleTutorial;
    }
    const target =
      document.querySelector(".hud-right") ||
      document.getElementById("scoreHud")?.parentElement ||
      document.querySelector(".deck-area") ||
      document.body;

    if (!btn.isConnected) {
      // Wenn eine HUD-Zeile existiert, hänge rechts an; sonst vor das Deck
      const hudRight = document.querySelector(".hud-right");
      if (hudRight) {
        hudRight.appendChild(btn);
      } else if (deckEl && deckEl.parentElement === target) {
        target.insertBefore(btn, deckEl);
      } else {
        target.insertBefore(btn, target.firstChild);
      }
    }
    return btn;
  }

  function ensureTutorialOverlay() {
    let overlay = document.getElementById("tutorialOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tutorialOverlay";
      overlay.className = "tutorial-overlay hidden";
      overlay.innerHTML = `
        <div class="tutorial-card">
          <h2>Wie spielt man Eleven?</h2>
          <ul>
            <li>Wähle offene Karten, deren Summe <strong>11</strong> ergibt.</li>
            <li>Nutze die oberste Karte vom <strong>Waste</strong> als zusätzliche Option.</li>
            <li>Gedeckte Karten (grau) werden erst spielbar, wenn darunterliegende Karten entfernt sind.</li>
            <li>Jede erfolgreiche 11‑Kombi erhöht deine <strong>Streak</strong> (+Bonus).</li>
            <li><strong>Falsche Kombination &gt; 11</strong> gibt Minuspunkte und wird automatisch aufgehoben.</li>
            <li>Leere einen kompletten Peak für einen <strong>Peak‑Bonus</strong>.</li>
            <li>Ist das Feld komplett geleert, gibt es einen <strong>Win‑Bonus</strong>.</li>
          </ul>
          <button id="tutorialClose" class="ui-button">Schließen</button>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector("#tutorialClose").addEventListener("click", toggleTutorial);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) toggleTutorial();
      });
    }
    return overlay;
  }

  function toggleTutorial() {
    const overlay = ensureTutorialOverlay();
    overlay.classList.toggle("hidden");
  }

  // ---------- Diamond/Peak Layout ----------
  const rowsPerDiamond = [1, 2, 3, 2, 1];
  const NUM_DIAMONDS = 3;

  // Kartenwerte / Stapel
  const cardValues = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  let stock = Array.from({ length: 24 }, () => getRandomCardValue());
  const wasteStack = []; // DOM-Elemente der Waste-Karten (oberste = last)

  let gameOver = false;

  function getRandomCardValue() {
    return cardValues[Math.floor(Math.random() * cardValues.length)];
  }
  function getCardNumericValue(cardText) {
    return cardText === "A" ? 1 : parseInt(cardText, 10);
  }

  // ---------- Hilfen: IDs & Mapping ----------
  function makeCardId(d, r, c) {
    return `card-d${d}-r${r}-c${c}`;
  }

  /**
   * Mapping Eltern → Kinder für TriPeaks-Diamant [1,2,3,2,1]
   */
  function childrenIndicesTripeaks(curLen, nextLen, c) {
    if (nextLen === 1) return [0];
    if (curLen === 1) {
      return nextLen >= 2 ? [0, nextLen - 1] : [0];
    }
    if (nextLen === curLen + 1) {
      return [c, c + 1];
    }
    if (nextLen === curLen) {
      return [c];
    }
    if (nextLen === curLen - 1) {
      if (c === 0) return [0];
      if (c === curLen - 1) return [nextLen - 1];
      return [c - 1, c];
    }
    const x = Math.round(c * (nextLen - 1) / Math.max(1, (curLen - 1)));
    return [Math.max(0, Math.min(nextLen - 1, x))];
  }

  // ---------- Peak erzeugen, data-children setzen ----------
  function createDiamond(diamondIndex) {
    const peak = document.createElement("div");
    peak.classList.add("peak");

    const cardHeight = 90;
    const overlap = cardHeight * 0.2;

    const cardMatrix = [];
    rowsPerDiamond.forEach((numCards, rowIndex) => {
      const row = document.createElement("div");
      row.classList.add("card-row");
      row.style.top = `${rowIndex * (cardHeight - overlap)}px`;

      const rowCards = [];
      for (let i = 0; i < numCards; i++) {
        const card = document.createElement("div");
        card.classList.add("card", "field");
        card.textContent = getRandomCardValue();

        card.dataset.diamond = String(diamondIndex);
        card.dataset.row = String(rowIndex);
        card.dataset.col = String(i);

        const cid = makeCardId(diamondIndex, rowIndex, i);
        card.id = cid;

        row.appendChild(card);
        rowCards.push(card);
      }
      peak.appendChild(row);
      cardMatrix.push(rowCards);
    });

    // Eltern → Kinder (darunterliegende Row) mappen
    for (let r = 0; r < cardMatrix.length - 1; r++) {
      const curRow = cardMatrix[r];
      const nextRow = cardMatrix[r + 1];
      const curLen = curRow.length;
      const nextLen = nextRow.length;

      for (let c = 0; c < curLen; c++) {
        const parentCard = curRow[c];
        const idxs = childrenIndicesTripeaks(curLen, nextLen, c);
        const childIds = idxs.map(i => nextRow[i]?.id).filter(Boolean);
        if (childIds.length) {
          parentCard.dataset.children = childIds.join(",");
        }
      }
    }

    return peak;
  }

  // ---------- Coverage-Logik ----------
  function isCardCovered(cardEl) {
    if (!cardEl || cardEl.classList.contains("removed")) return false;

    const children = (cardEl.dataset.children || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (children.length === 0) return false;

    for (const cid of children) {
      const childEl = document.getElementById(cid);
      if (
        childEl &&
        childEl.isConnected &&
        childEl.classList.contains("field") &&
        !childEl.classList.contains("removed")
      ) {
        return true;
      }
    }
    return false;
  }

  function updateCoverageState() {
    const fieldCards = document.querySelectorAll(".card.field");
    fieldCards.forEach(card => {
      const covered = isCardCovered(card);
      card.classList.toggle("covered", covered);
      const clickable = !covered && !card.classList.contains("removed");
      card.classList.toggle("clickable", clickable);
    });

    if (stock.length === 0) maybeTriggerLoss();
  }

  // ---------- Delegierter Klick-Handler ----------
  document.addEventListener("click", (ev) => {
    if (gameOver) return;

    const card = ev.target.closest?.(".card");
    if (!card) return;

    // Feldkarten
    if (card.classList.contains("field")) {
      if (card.classList.contains("removed")) {
        ev.preventDefault(); ev.stopPropagation(); return;
      }
      if (card.classList.contains("covered")) {
        ev.preventDefault(); ev.stopPropagation();
        triggerShake(card);
        return;
      }
      card.classList.toggle("selected");
      checkSelectedCards();
      return;
    }

    // Waste-Karten
    if (card.classList.contains("waste-card")) {
      card.classList.toggle("selected");
      checkSelectedCards();
      return;
    }
  }, true);

  function triggerShake(el) {
    if (!el.classList.contains("covered")) return;
    if (el.classList.contains("shake")) return;
    el.classList.add("shake");
    const off = () => {
      el.classList.remove("shake");
      el.removeEventListener("animationend", off);
    };
    el.addEventListener("animationend", off);
  }

  // ---------- Refill: exakt 1 Feld-Slot pro Zug (row-basiert, L→R) ----------
  function refillOneRemovedSlot() {
    const removedSlots = Array.from(document.querySelectorAll(".card.field.removed"));
    if (removedSlots.length === 0) return false;

    const groupedByRow = {};
    removedSlots.forEach(slot => {
      const top = slot.parentElement?.style?.top || "";
      if (!groupedByRow[top]) groupedByRow[top] = [];
      groupedByRow[top].push(slot);
    });

    const sortedTops = Object.keys(groupedByRow).sort((a, b) => {
      const na = parseFloat(a), nb = parseFloat(b);
      if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
      if (Number.isNaN(na)) return 1;
      if (Number.isNaN(nb)) return -1;
      return na - nb;
    });

    for (const top of sortedTops) {
      const rowSlots = groupedByRow[top];
      for (const slot of rowSlots) {
        if (wasteStack.length === 0) return false;

        const prevCardEl = wasteStack.pop();
        if (prevCardEl?.parentElement === wasteEl) {
          wasteEl.removeChild(prevCardEl);
        }

        slot.classList.remove("removed", "selected", "covered");
        slot.textContent = prevCardEl?.textContent || getRandomCardValue();
        slot.style.visibility = "visible";

        updateCoverageState();

        if (wasteStack.length === 0) {
          ensureWasteCard();
        }

        if (stock.length === 0) maybeTriggerLoss();

        return true; // exakt 1 Slot
      }
    }
    return false;
  }

  // ---------- Waste-Helpers ----------
  function pushWasteCardWithValue(value, source = "stock") {
    const newCard = document.createElement("div");
    newCard.classList.add("waste-card", "card", "clickable");
    newCard.textContent = value;
    newCard.dataset.source = source; // "stock" | "synthetic"
    newCard.style.zIndex = String(wasteStack.length);
    wasteEl.appendChild(newCard);
    wasteStack.push(newCard);
  }

  function ensureWasteCard() {
    if (wasteStack.length > 0) return;
    pushWasteCardWithValue(getRandomCardValue(), "synthetic");
  }

  // ---------- Ziehen vom Deck ----------
  function drawCard(initial = false) {
    if (!initial) {
      // Ziehen unterbricht die Streak, aber KEIN Penalty mehr
      if (streak > 0) {
        streak = 0;
        updateScoreHud();
      }
      refillOneRemovedSlot();
      updateCoverageState();
    }
    if (stock.length === 0) {
      maybeTriggerLoss();
      return;
    }

    const newCardValue = stock.pop();
    stockCount.textContent = stock.length;

    pushWasteCardWithValue(newCardValue, "stock");

    if (stock.length === 0) maybeTriggerLoss();
  }

  deckEl.addEventListener("click", () => {
    if (gameOver) return;
    drawCard();
  });

  // ---------- Kombination prüfen + Scoring ----------
  function checkSelectedCards() {
    const selectedCards = Array.from(document.querySelectorAll(".card.selected"));
    if (selectedCards.length === 0) return;

    const total = selectedCards
      .map(el => getCardNumericValue(el.textContent))
      .reduce((a, b) => a + b, 0);

    // FALSCHE KOMBI: Summe > 11 => Penalty + Auswahl löschen
    if (total > 11) {
      adjustScore(WRONG_COMBO_PENALTY);
      // Auswahl zurücksetzen
      selectedCards.forEach(el => el.classList.remove("selected"));
      return;
    }

    // Nur ausführen, wenn exakt 11
    if (total !== 11) return;

    // Scoring: Basispunkte + Feldkarten-Bonus + Streak-Bonus (Multiplikator fix/linear)
    const fieldCount = selectedCards.filter(el => el.classList.contains("field")).length;
    const basePoints = 10 + (2 * fieldCount);
    const streakBonus = 2 * streak;
    const movePoints = basePoints + streakBonus;

    // Entfernen / Anwenden des Zugs
    selectedCards.forEach(card => {
      card.classList.remove("selected");

      if (card.classList.contains("field")) {
        card.classList.remove("clickable");
        card.classList.add("removed");
        card.style.visibility = "hidden";
      } else if (card.classList.contains("waste-card")) {
        const idx = wasteStack.indexOf(card);
        if (idx >= 0) wasteStack.splice(idx, 1);
        if (card.parentElement === wasteEl) {
          wasteEl.removeChild(card);
        }
      }
    });

    // Punkte gutschreiben & Streak erhöhen
    adjustScore(movePoints);
    streak += 1;
    updateScoreHud();

    // Peak-Clear prüfen (kein Row-Clear)
    checkAndAwardPeakBonuses();

    updateCoverageState();
    checkWinCondition();

    ensureWasteCard();
    setTimeout(ensureWasteCard, 0);

    if (stock.length === 0) maybeTriggerLoss();
  }

  function checkAndAwardPeakBonuses() {
    for (let d = 0; d < NUM_DIAMONDS; d++) {
      if (clearedPeaks.has(d)) continue;
      const remainingInPeak = document.querySelectorAll(`.card.field[data-diamond="${d}"]:not(.removed)`);
      if (remainingInPeak.length === 0) {
        clearedPeaks.add(d);
        adjustScore(PEAK_CLEAR_BONUS);
        flashBadge(`Peak +${PEAK_CLEAR_BONUS}`);
      }
    }
  }

  function flashBadge(text) {
    const badge = document.createElement("div");
    badge.className = "score-badge";
    badge.textContent = text;
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 1200);
  }

  // ---------- Win/Lose ----------
  function checkWinCondition() {
    const remainingField = document.querySelectorAll(".card.field:not(.removed)");
    if (remainingField.length === 0) {
      adjustScore(WIN_BONUS);
      showWinMessage();
    }
  }

  function getPlayableFieldValues() {
    const cards = Array.from(document.querySelectorAll(".card.field"))
      .filter(el => !el.classList.contains("removed") && !el.classList.contains("covered"));
    return cards.map(el => getCardNumericValue(el.textContent));
  }

  function getTopWasteValueOrNull() {
    if (wasteStack.length === 0) return null;
    const top = wasteStack[wasteStack.length - 1];
    return getCardNumericValue(top.textContent);
  }

  function existsAnyElevenCombo() {
    const vals = getPlayableFieldValues();
    // Paare
    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        if (vals[i] + vals[j] === 11) return true;
      }
    }
    // Waste-Top + Feld
    const wasteTop = getTopWasteValueOrNull();
    if (wasteTop != null) {
      for (const v of vals) {
        if (wasteTop + v === 11) return true;
      }
    }
    return false;
  }

  function maybeTriggerLoss() {
    if (gameOver) return;
    if (stock.length > 0) return;
    if (existsAnyElevenCombo()) return;
    showLoseMessage();
  }

  // ---------- Restart & Messages ----------
  function ensureRestartButton() {
    let btn = document.getElementById("restartBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "restartBtn";
      btn.type = "button";
      btn.textContent = "Restart";
      btn.className = "ui-button";
    }
    const target =
      deckEl?.parentElement ||
      document.querySelector(".deck-area") ||
      document.querySelector(".game-container") ||
      document.body;

    if (!btn.isConnected) {
      const hud = document.getElementById("scoreHud");
      if (hud && target.contains(hud)) {
        target.insertBefore(btn, hud.nextSibling);
      } else if (deckEl && deckEl.parentElement === target) {
        target.insertBefore(btn, deckEl);
      } else {
        target.insertBefore(btn, target.firstChild);
      }
    }
    btn.onclick = restartGame;
    return btn;
  }

  function showWinMessage() {
    if (gameOver) return;
    gameOver = true;
    ensureRestartButton();
    const message = document.createElement("div");
    message.innerText = `🎉 You Win! 🎉\nScore: ${score}`;
    message.classList.add("win-message");
    document.body.appendChild(message);
  }

  function showLoseMessage() {
    if (gameOver) return;
    gameOver = true;
    ensureRestartButton();
    const message = document.createElement("div");
    message.innerText = `💀 No moves left!\nScore: ${score}`;
    message.classList.add("win-message");
    message.style.background = "#e74c3c";
    message.style.color = "#fff";
    document.body.appendChild(message);
  }

  function restartGame() {
    gameOver = false;
    score = 0;
    streak = 0;
    clearedPeaks.clear();
    updateScoreHud();

    document.querySelectorAll(".win-message").forEach(el => el.remove());
    wasteStack.splice(0, wasteStack.length);
    while (wasteEl.firstChild) wasteEl.removeChild(wasteEl.firstChild);
    while (peakRow.firstChild) peakRow.removeChild(peakRow.firstChild);

    stock = Array.from({ length: 24 }, () => getRandomCardValue());
    stockCount.textContent = stock.length;

    for (let d = 0; d < NUM_DIAMONDS; d++) {
      peakRow.appendChild(createDiamond(d));
    }
    updateCoverageState();
    drawCard(true); // kein Penalty, Streak bleibt 0
    ensureWasteCard();
  }

  // ---------- Initiales Setup ----------
  ensureScoreHud();
  ensureRestartButton();
  ensureTutorialButton();
  for (let d = 0; d < NUM_DIAMONDS; d++) {
    peakRow.appendChild(createDiamond(d));
  }
  updateCoverageState();
  drawCard(true);
  if (wasteStack.length === 0) ensureWasteCard();
  window.addEventListener("resize", updateCoverageState);
});
