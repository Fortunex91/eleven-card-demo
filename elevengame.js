window.addEventListener("DOMContentLoaded", () => {
  const peakRow = document.getElementById("peakRow");
  const deckEl = document.getElementById("deck");
  const wasteEl = document.getElementById("waste");
  const stockCountEl = document.getElementById("stockCount");
  let restartBtn = document.getElementById("restartBtn");

  // ---------- Globals / State ----------
  const rowsPerDiamond = [1, 2, 3, 2, 1];
  const NUM_DIAMONDS = 3;
  const cardValues = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  let stock = [];                // via generateBiasedStock()
  const wasteStack = [];         // Array von .waste-card DOM-Elementen (Stack)
  let gameOver = false;

  // Score/Streak & Boni
  let score = 0;
  let streak = 0;
  const WRONG_COMBO_PENALTY = -5;   // falsche Kombi (> 11)
  const PEAK_CLEAR_BONUS = 50;
  const WIN_BONUS = 100;
  const clearedPeaks = new Set();

  // ---------- Utils ----------
  function getRandomCardValue() {
    return cardValues[Math.floor(Math.random() * cardValues.length)];
  }
  function getCardNumericValue(cardText) {
    return cardText === "A" ? 1 : parseInt(cardText, 10);
  }
  function complementFor(v) {
    return 11 - v;
  }

  // Popup‑Utils
  function spawnPopupAt(x, y, text, type = "pos") {
    const pop = document.createElement("div");
    pop.className = `points-pop ${type}`;
    pop.textContent = text;
    document.body.appendChild(pop);
    const rect = pop.getBoundingClientRect();
    pop.style.left = `${Math.round(x - rect.width / 2)}px`;
    pop.style.top  = `${Math.round(y - rect.height)}px`;
    // Auto-remove
    pop.addEventListener("animationend", () => pop.remove(), { once: true });
  }
  function spawnPopupOnElement(el, text, type = "pos") {
    if (!el) return;
    const r = el.getBoundingClientRect();
    spawnPopupAt(r.left + r.width / 2, r.top, text, type);
  }
  function centerOfElements(els) {
    if (!els || els.length === 0) return { x: window.innerWidth / 2, y: 80 };
    let minL = Infinity, minT = Infinity, maxR = -Infinity, maxB = -Infinity;
    els.forEach(el => {
      const r = el.getBoundingClientRect();
      minL = Math.min(minL, r.left);
      minT = Math.min(minT, r.top);
      maxR = Math.max(maxR, r.right);
      maxB = Math.max(maxB, r.bottom);
    });
    return { x: (minL + maxR) / 2, y: minT - 6 };
  }
  function spawnCenterPopup(text, type = "pos") {
    // zentriert über dem Spielfeld (über peakRow)
    const area = peakRow?.getBoundingClientRect?.();
    const x = area ? (area.left + area.right) / 2 : window.innerWidth / 2;
    const y = area ? (area.top) : 80;
    spawnPopupAt(x, y, text, type);
  }

  // ---------- UI: Top-Bar (Tutorial + Restart) ----------
  function ensureTopBar() {
    let topbar = document.getElementById("topBar");
    if (!topbar) {
      topbar = document.createElement("div");
      topbar.id = "topBar";
      topbar.className = "top-bar";
      document.body.appendChild(topbar);
    }
    return topbar;
  }

  function ensureTutorialButton() {
    const bar = ensureTopBar();
    let btn = document.getElementById("tutorialBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "tutorialBtn";
      btn.type = "button";
      btn.textContent = "Tutorial";
      btn.className = "ui-button";
      btn.addEventListener("click", toggleTutorial);
      bar.appendChild(btn);
    }
    return btn;
  }

  function ensureRestartButton() {
    const bar = ensureTopBar();
    let btn = document.getElementById("restartBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "restartBtn";
      btn.type = "button";
      btn.textContent = "Restart";
      btn.className = "ui-button";
      btn.addEventListener("click", restartGame);
      bar.appendChild(btn);
    } else if (!btn.isConnected) {
      bar.appendChild(btn);
    }
    return btn;
  }

  // ---------- Score HUD: zentriert über mittlerem Peak ----------
  function ensureScoreHud() {
    let hud = document.getElementById("scoreHud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "scoreHud";
      hud.className = "score-hud";
      hud.innerHTML = `
        <span>Score: <strong id="scoreValue">0</strong></span>
        <span>Streak: <strong id="streakValue">0</strong></span>
      `;
      if (peakRow && peakRow.parentElement) {
        peakRow.parentElement.appendChild(hud);
      } else {
        document.body.appendChild(hud);
      }
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

  // ---------- Tutorial Overlay (EN) ----------
  function ensureTutorialOverlay() {
    let overlay = document.getElementById("tutorialOverlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tutorialOverlay";
      overlay.className = "tutorial-overlay hidden";
      overlay.innerHTML = `
        <div class="tutorial-card">
          <h2>How to play Eleven</h2>
          <ul>
            <li>Select open cards that sum exactly to <strong>11</strong>.</li>
            <li>You can also use the top card from the <strong>waste</strong>.</li>
            <li>Greyed cards are covered and cannot be selected until their children are removed.</li>
            <li>Each successful 11 increases your <strong>streak</strong> (more points).</li>
            <li><strong>Wrong selection &gt; 11</strong> deducts points and is auto‑cleared.</li>
            <li>Clear an entire peak to get a <strong>Peak Bonus</strong>.</li>
            <li>Clear the entire board for a <strong>Win Bonus</strong>.</li>
          </ul>
          <button id="tutorialClose" class="ui-button">Close</button>
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
    const ov = ensureTutorialOverlay();
    ov.classList.toggle("hidden");
  }

  // ---------- Stock Count unter dem Deck (ohne Label!) ----------
  function ensureStockWrapAndLabel() {
    let wrap = deckEl.closest(".deck-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "deck-wrap";
      const parent = deckEl.parentElement || document.querySelector(".deck-area") || document.body;
      parent.insertBefore(wrap, deckEl);
      wrap.appendChild(deckEl);
    }
    let label = document.getElementById("stockCount");
    if (!label) {
      const lbl = document.createElement("div");
      lbl.id = "stockCount";
      wrap.appendChild(lbl);
    } else if (label.parentElement !== wrap) {
      wrap.appendChild(label);
    }
  }

  // ---------- Mapping & Layout ----------
  function makeCardId(d, r, c) {
    return `card-d${d}-r${r}-c${c}`;
  }

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

    // Eltern → Kinder mappen
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

  // ---------- Coverage ----------
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
      card.classList.toggle("unselectable", !clickable); // visuell grau
    });

    if (stock.length === 0) maybeTriggerLoss();
  }

  // ---------- Click Handling ----------
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

  // ---------- Refill (genau 1 Slot/Zug; row-basiert L→R) ----------
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

        slot.classList.remove("removed", "selected", "covered", "unselectable");
        slot.textContent = prevCardEl?.textContent || getRandomCardValue();
        slot.style.visibility = "visible";

        updateCoverageState();

        if (wasteStack.length === 0) ensureWasteCard();

        if (stock.length === 0) maybeTriggerLoss();
        return true; // genau 1
      }
    }
    return false;
  }

  // ---------- Waste Helpers (Flip/Deal Animation) ----------
  function pushWasteCardWithValue(value, source = "stock") {
    const newCard = document.createElement("div");
    newCard.classList.add("waste-card", "card", "clickable", "deal-anim", "flip-anim");
    newCard.textContent = value;
    newCard.dataset.source = source; // "stock" | "synthetic"
    newCard.style.zIndex = String(wasteStack.length);
    wasteEl.appendChild(newCard);
    newCard.addEventListener("animationend", () => {
      newCard.classList.remove("deal-anim");
      newCard.classList.remove("flip-anim");
    }, { once: true });
    wasteStack.push(newCard);
  }

  function ensureWasteCard() {
    if (wasteStack.length > 0) return;
    const playable = getPlayableFieldValuesWithIds();
    let value;
    if (playable.length > 0 && Math.random() < 0.7) {
      const pick = playable[Math.floor(Math.random() * playable.length)];
      value = complementFor(pick.v);
      value = Math.min(10, Math.max(1, value));
      value = value === 1 ? "A" : String(value);
    } else {
      value = getRandomCardValue();
    }
    pushWasteCardWithValue(value, "synthetic");
  }

  // ---------- Draw vom Deck ----------
  function drawCard(initial = false) {
    if (!initial) {
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
    updateStockCount();
    pushWasteCardWithValue(newCardValue, "stock");

    if (stock.length === 0) maybeTriggerLoss();
  }

  deckEl.addEventListener("click", () => {
    if (gameOver) return;
    drawCard();
  });

  // ---------- Kombination prüfen + Scoring + Popups ----------
  function checkSelectedCards() {
    const selectedCards = Array.from(document.querySelectorAll(".card.selected"));
    if (selectedCards.length === 0) return;

    const total = selectedCards
      .map(el => getCardNumericValue(el.textContent))
      .reduce((a, b) => a + b, 0);

    // Falsche Kombi: > 11 => Penalty + Auto-Deselect + zentrales Popup
    if (total > 11) {
      adjustScore(WRONG_COMBO_PENALTY);
      const center = centerOfElements(selectedCards);
      spawnPopupAt(center.x, center.y, `${WRONG_COMBO_PENALTY}`, "neg");
      selectedCards.forEach(el => el.classList.remove("selected"));
      return;
    }

    if (total !== 11) return;

    // Punkte berechnen
    const fieldCards = selectedCards.filter(el => el.classList.contains("field"));
    const basePoints = 10;
    const perField = 2 * fieldCards.length;
    const streakBonus = 2 * streak;
    const movePoints = basePoints + perField + streakBonus;

    // Popups: pro Feldkarte "+2"
    fieldCards.forEach(el => spawnPopupOnElement(el, "+2", "pos"));

    // Zentrale Popup(s): +Gesamt und ggf. +Streak
    const center = centerOfElements(selectedCards);
    spawnPopupAt(center.x, center.y, `+${movePoints}`, "pos");
    if (streakBonus > 0) {
      spawnPopupAt(center.x, center.y - 22, `+${streakBonus} streak`, "pos");
    }

    // Entfernen / Anwenden
    selectedCards.forEach(card => {
      card.classList.remove("selected");

      if (card.classList.contains("field")) {
        card.classList.remove("clickable", "unselectable");
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

    // Punkte + Streak
    adjustScore(movePoints);
    streak += 1;
    updateScoreHud();

    // Peak Bonus prüfen (Popup zentriert über dem Feld)
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
        spawnCenterPopup(`Peak +${PEAK_CLEAR_BONUS}`, "pos");
      }
    }
  }

  // ---------- Win/Lose ----------
  function checkWinCondition() {
    const remainingField = document.querySelectorAll(".card.field:not(.removed)");
    if (remainingField.length === 0) {
      adjustScore(WIN_BONUS);
      spawnCenterPopup(`Win +${WIN_BONUS}`, "pos");
      showWinMessage();
    }
  }

  function getPlayableFieldValues() {
    const cards = Array.from(document.querySelectorAll(".card.field"))
      .filter(el => !el.classList.contains("removed") && !el.classList.contains("covered"));
    return cards.map(el => getCardNumericValue(el.textContent));
  }

  function getPlayableFieldValuesWithIds() {
    const cards = Array.from(document.querySelectorAll(".card.field"))
      .filter(el => !el.classList.contains("removed") && !el.classList.contains("covered"));
    return cards.map(el => ({ v: getCardNumericValue(el.textContent), id: el.id }));
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

  // ---------- Deck/Stock: Komplement-Bias ----------
  function generateBiasedStock(size) {
    const allFieldCards = Array.from(document.querySelectorAll(".card.field"));
    const fieldVals = allFieldCards.map(el => getCardNumericValue(el.textContent));
    const pool = [];
    const freq = {};
    fieldVals.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    Object.keys(freq).forEach(k => {
      const v = parseInt(k, 10);
      const comp = complementFor(v);
      const weight = Math.max(1, Math.min(6, freq[v] + 2));
      for (let i = 0; i < weight; i++) pool.push(comp);
    });

    const result = [];
    for (let i = 0; i < size; i++) {
      let pickNum;
      if (pool.length > 0 && Math.random() < 0.7) {
        pickNum = pool[Math.floor(Math.random() * pool.length)];
      } else {
        pickNum = Math.floor(Math.random() * 10) + 1;
      }
      const val = pickNum === 1 ? "A" : String(pickNum);
      result.push(val);
    }
    return result;
  }

  // ---------- Restart / Init ----------
  function updateStockCount() {
    const el = document.getElementById("stockCount");
    if (el) el.textContent = String(stock.length);
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

    for (let d = 0; d < NUM_DIAMONDS; d++) {
      peakRow.appendChild(createDiamond(d));
    }

    updateCoverageState();
    stock = generateBiasedStock(24);
    updateStockCount();

    drawCard(true);
    ensureWasteCard();
  }

  // ---------- Initial Setup ----------
  ensureTopBar();
  ensureTutorialButton();
  ensureRestartButton();
  ensureScoreHud();
  ensureStockWrapAndLabel();

  for (let d = 0; d < NUM_DIAMONDS; d++) {
    peakRow.appendChild(createDiamond(d));
  }
  updateCoverageState();

  stock = generateBiasedStock(24);
  updateStockCount();

  drawCard(true);
  if (wasteStack.length === 0) ensureWasteCard();

  window.addEventListener("resize", updateCoverageState);
});
