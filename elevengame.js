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

  // 7-Runden-Konfiguration: Zeit sinkt von 90s auf 60s, Multiplier steigt leicht
  const MAX_ROUNDS = 7;
  function getRoundTimeLimitMs(round) { return 90_000 - (round - 1) * 5_000; } // 90s → 60s
  function getRoundMultiplier(round) { return 1.0 + (round - 1) * 0.3; }        // x1.0 → x2.8

  let stock = [];                // via generateBiasedStock()
  const wasteStack = [];         // Array von .waste-card DOM-Elementen (Stack: last = top)
  let gameOver = false;          // gesamtes Spiel fertig (nach 7 Runden) ODER harter Abbruch

  // Runden- und Score-Status
  let currentRound = 1;
  let totalScore = 0;            // Summe über alle Runden
  let roundScore = 0;            // nur aktuelle Runde
  let roundHistory = [];         // [{round, status:"win|lose|timeup", score, timeMs, stockLeft}]
  const WRONG_COMBO_PENALTY = -5;
  const PEAK_CLEAR_BONUS = 50;
  const WIN_BONUS = 100;
  const clearedPeaks = new Set();

  // ---- Timer / Zeitleiste ---- (pro Runde)
  let timer = null;
  let timeStart = 0;
  let timeRemaining = getRoundTimeLimitMs(currentRound);

  // ---------- Utils ----------
  const supportsPointer = "PointerEvent" in window;

  function getRandomCardValue() {
    return cardValues[Math.floor(Math.random() * cardValues.length)];
  }
  function getCardNumericValue(cardText) {
    return cardText === "A" ? 1 : parseInt(cardText, 10);
  }
  function complementFor(v) { return 11 - v; }

  // ---------- Popups + Anti-Overlap ----------
  const activePopups = []; // {el, expires}
  function spawnPopupAt(x, y, text, type = "pos") {
    const pop = document.createElement("div");
    pop.className = `points-pop ${type}`;
    pop.textContent = text;
    document.body.appendChild(pop);
    const rect = pop.getBoundingClientRect();
    pop.style.left = `${Math.round(x - rect.width / 2)}px`;
    pop.style.top  = `${Math.round(y - rect.height)}px`;
    requestAnimationFrame(() => avoidOverlap(pop));

    const ttl = 900;
    const item = { el: pop, expires: performance.now() + ttl };
    activePopups.push(item);
    pop.addEventListener("animationend", () => {
      pop.remove();
      const i = activePopups.indexOf(item);
      if (i >= 0) activePopups.splice(i, 1);
    }, { once: true });
  }
  function isOverlap(a, b) {
    return !(a.left > b.right || a.right < b.left || a.top > b.bottom || a.bottom < b.top);
  }
  function avoidOverlap(el) {
    const MAX_NUDGE = 90;
    const STEP = 18;
    let nudge = 0, collided = true;
    const rect = () => el.getBoundingClientRect();
    const anyCollision = () => {
      const r = rect();
      const others = activePopups
        .map(p => p.el)
        .filter(n => n !== el && document.body.contains(n))
        .map(n => n.getBoundingClientRect());
      return others.some(o => isOverlap(r, o));
    };
    while (collided && nudge <= MAX_NUDGE) {
      collided = anyCollision();
      if (collided) {
        nudge += STEP;
        el.style.top = (parseFloat(el.style.top || "0") - STEP) + "px";
      }
    }
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
    const area = peakRow?.getBoundingClientRect?.();
    const x = area ? (area.left + area.right) / 2 : window.innerWidth / 2;
    const y = area ? (area.top) : 80;
    spawnPopupAt(x, y, text, type);
  }

  // ---------- UI: Top-Bar (Tutorial + Restart + Round/Total HUD) ----------
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
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); toggleTutorial(); }, { passive: false });
      btn.addEventListener("touchstart", (e) => { e.preventDefault(); toggleTutorial(); }, { passive: false });
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
      btn.addEventListener("pointerdown", (e) => { e.preventDefault(); restartGameFully(); }, { passive: false });
      btn.addEventListener("touchstart", (e) => { e.preventDefault(); restartGameFully(); }, { passive: false });
      bar.appendChild(btn);
    } else if (!btn.isConnected) {
      bar.appendChild(btn);
    }
    return btn;
  }

  // ---------- Score & Round HUD ----------
  function ensureScoreHud() {
    let hud = document.getElementById("scoreHud");
    if (!hud) {
      hud = document.createElement("div");
      hud.id = "scoreHud";
      hud.className = "score-hud";
      hud.innerHTML = `
        <span>Round: <strong id="roundValue">1/${MAX_ROUNDS}</strong></span>
        <span>Round Score: <strong id="scoreValue">0</strong></span>
        <span>Total: <strong id="totalValue">0</strong></span>
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
  let streak = 0;
  function updateScoreHud() {
    const s = document.getElementById("scoreValue");
    const st = document.getElementById("streakValue");
    const rd = document.getElementById("roundValue");
    const tot = document.getElementById("totalValue");
    if (s) s.textContent = String(roundScore);
    if (st) st.textContent = String(streak);
    if (rd) rd.textContent = `${currentRound}/${MAX_ROUNDS}`;
    if (tot) tot.textContent = String(totalScore);
  }

  // Score-Helfer: Multiplikator pro Runde nur auf positive Punkte
  function addScore(delta, { penalty = false } = {}) {
    let effective = delta;
    if (!penalty && delta > 0) {
      effective = Math.round(delta * getRoundMultiplier(currentRound));
    }
    roundScore += effective;
    if (roundScore < 0) roundScore = 0;
    updateScoreHud();
  }

  // ---------- Tutorial Overlay ----------
  function ensureTutorialOverlay() {
    let overlay = document.getElementById("tutorialOverlay");
    const contentList = `
      <li>Select open cards that sum exactly to <strong>11</strong>.</li>
      <li>You can also use the top card from the <strong>waste</strong>.</li>
      <li>Greyed cards are covered and cannot be selected until their children are removed.</li>
      <li>Each successful 11 increases your <strong>streak</strong> and grants extra points.</li>
      <li><strong>Wrong selection &gt; 11</strong> deducts points and is auto-cleared.</li>
      <li>Clear an entire peak to get a <strong>Peak Bonus</strong>.</li>
      <li>A small <strong>time bar</strong> at the bottom counts down the round time. When it empties, you <strong>lose the round</strong>.</li>
      <li>Later rounds have <strong>less time</strong> and a <strong>higher score multiplier</strong>.</li>
    `;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "tutorialOverlay";
      overlay.className = "tutorial-overlay hidden";
      overlay.innerHTML = `
        <div class="tutorial-card">
          <h2>How to play Eleven</h2>
          <ul>${contentList}</ul>
          <button id="tutorialClose" class="ui-button">Close</button>
        </div>
      `;
      document.body.appendChild(overlay);
      overlay.querySelector("#tutorialClose").addEventListener("pointerdown", (e) => { e.preventDefault(); toggleTutorial(); }, { passive: false });
      overlay.querySelector("#tutorialClose").addEventListener("touchstart", (e) => { e.preventDefault(); toggleTutorial(); }, { passive: false });
      overlay.addEventListener("pointerdown", (e) => { if (e.target === overlay) { e.preventDefault(); toggleTutorial(); } }, { passive: false });
      overlay.addEventListener("touchstart", (e) => { if (e.target === overlay) { e.preventDefault(); toggleTutorial(); } }, { passive: false });
    } else {
      const ul = overlay.querySelector("ul");
      if (ul) ul.innerHTML = contentList;
    }
    return overlay;
  }
  function toggleTutorial() {
    const ov = ensureTutorialOverlay();
    ov.classList.toggle("hidden");
  }

  // ---------- "Stock:"-Label sicher entfernen ----------
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
    const stockLabel = document.getElementById("stockLabel") || document.querySelector(".stock-label");
    if (stockLabel) stockLabel.style.display = "none";
    killStrayStockLabels();
  }
  function killStrayStockLabels() {
    const candidates = Array.from(document.querySelectorAll("div, span, p, h1, h2, h3, h4, h5"));
    for (const el of candidates) {
      const txt = (el.textContent || "").trim();
      if (txt === "Stock:" || txt === "Stock :") {
        el.style.display = "none";
      }
    }
  }

  // ---------- Mapping & Layout ----------
  function makeCardId(d, r, c) { return `card-d${d}-r${r}-c${c}`; }
  function childrenIndicesTripeaks(curLen, nextLen, c) {
    if (nextLen === 1) return [0];
    if (curLen === 1) return nextLen >= 2 ? [0, nextLen - 1] : [0];
    if (nextLen === curLen + 1) return [c, c + 1];
    if (nextLen === curLen) return [c];
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
        card.id = makeCardId(diamondIndex, rowIndex, i);
        row.appendChild(card);
        rowCards.push(card);
      }
      peak.appendChild(row);
      cardMatrix.push(rowCards);
    });
    for (let r = 0; r < cardMatrix.length - 1; r++) {
      const curRow = cardMatrix[r], nextRow = cardMatrix[r + 1];
      for (let c = 0; c < curRow.length; c++) {
        const idxs = childrenIndicesTripeaks(curRow.length, nextRow.length, c);
        const childIds = idxs.map(i => nextRow[i]?.id).filter(Boolean);
        if (childIds.length) curRow[c].dataset.children = childIds.join(",");
      }
    }
    return peak;
  }

  // ---------- Coverage ----------
  function isCardCovered(cardEl) {
    if (!cardEl || cardEl.classList.contains("removed")) return false;
    const children = (cardEl.dataset.children || "").split(",").map(s => s.trim()).filter(Boolean);
    if (children.length === 0) return false;
    for (const cid of children) {
      const childEl = document.getElementById(cid);
      if (childEl && childEl.isConnected && childEl.classList.contains("field") && !childEl.classList.contains("removed")) {
        return true;
      }
    }
    return false;
  }
  function updateCoverageState() {
    document.querySelectorAll(".card.field").forEach(card => {
      const covered = isCardCovered(card);
      card.classList.toggle("covered", covered);
      const clickable = !covered && !card.classList.contains("removed");
      card.classList.toggle("clickable", clickable);
      card.classList.toggle("unselectable", !clickable);
    });
    if (stock.length === 0) maybeTriggerLoss();
  }

  // ---------- Unified Input Handling (PointerDown + TouchStart Fallback) ----------
  function handleCardActivation(targetEl) {
    if (!targetEl) return;
    if (gameOver) return;

    const card = targetEl.closest?.(".card");
    if (!card) return;

    if (card.classList.contains("field")) {
      if (card.classList.contains("removed")) return;
      if (card.classList.contains("covered")) { triggerShake(card); return; }
      card.classList.toggle("selected");
      checkSelectedCards();
      return;
    }
    if (card.classList.contains("waste-card")) {
      card.classList.toggle("selected");
      checkSelectedCards();
      return;
    }
  }

  const pointerHandler = (ev) => { ev.preventDefault(); handleCardActivation(ev.target); };
  const touchHandler = (ev) => {
    ev.preventDefault();
    const touch = ev.changedTouches ? ev.changedTouches[0] : null;
    const target = document.elementFromPoint(touch ? touch.clientX : 0, touch ? touch.clientY : 0) || ev.target;
    handleCardActivation(target);
  };
  if (supportsPointer) document.addEventListener("pointerdown", pointerHandler, { passive: false, capture: true });
  else document.addEventListener("touchstart", touchHandler, { passive: false, capture: true });

  // Deck: manuelles Ziehen
  const deckPointer = (e) => { e.preventDefault(); if (!gameOver) drawCardFromStockToWaste_Manual(); };
  if (supportsPointer) deckEl.addEventListener("pointerdown", deckPointer, { passive: false });
  else deckEl.addEventListener("touchstart", deckPointer, { passive: false });

  function triggerShake(el) {
    if (!el.classList.contains("covered") || el.classList.contains("shake")) return;
    el.classList.add("shake");
    const off = () => { el.classList.remove("shake"); el.removeEventListener("animationend", off); };
    el.addEventListener("animationend", off);
  }

  // ---------- Refill (genau 1 Slot/Zug; row-basiert L→R) ----------
  function refillOneRemovedSlotUsingPrevWaste() {
    const removed = Array.from(document.querySelectorAll(".card.field.removed"));
    if (removed.length === 0) return false;
    if (wasteStack.length === 0) return false;

    const groupedByRow = {};
    removed.forEach(slot => {
      const top = slot.parentElement?.style?.top || "";
      (groupedByRow[top] ||= []).push(slot);
    });
    const sortedTops = Object.keys(groupedByRow).sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));

    for (const top of sortedTops) {
      for (const slot of groupedByRow[top]) {
        const prev = wasteStack.pop();
        if (prev?.parentElement === wasteEl) wasteEl.removeChild(prev);

        slot.classList.remove("removed", "selected", "covered", "unselectable");
        slot.textContent = prev?.textContent || getRandomCardValue();
        slot.style.visibility = "visible";
        updateCoverageState();
        return true;
      }
    }
    return false;
  }

  // ---------- Waste Helpers ----------
  function pushWasteCardWithValue(value) {
    const newCard = document.createElement("div");
    newCard.classList.add("waste-card", "card", "clickable", "deal-anim", "flip-anim");
    newCard.textContent = value;
    newCard.style.zIndex = String(wasteStack.length);
    wasteEl.appendChild(newCard);
    newCard.addEventListener("animationend", () => newCard.classList.remove("deal-anim", "flip-anim"), { once: true });
    wasteStack.push(newCard);
  }
  function topWasteValueOrNull() {
    if (wasteStack.length === 0) return null;
    return getCardNumericValue(wasteStack[wasteStack.length - 1].textContent);
  }

  // ---------- Ziehen vom Stock auf Waste ----------
  function drawCardFromStockToWaste_Auto() {
    if (stock.length === 0) return false;
    const newCardValue = stock.pop();
    updateStockCount();
    pushWasteCardWithValue(newCardValue);
    return true;
  }
  function drawCardFromStockToWaste_Manual() {
    if (streak > 0) { streak = 0; updateScoreHud(); }
    refillOneRemovedSlotUsingPrevWaste();
    updateCoverageState();
    if (stock.length === 0) { maybeTriggerLoss(); return; }
    const newCardValue = stock.pop();
    updateStockCount();
    pushWasteCardWithValue(newCardValue);
    if (stock.length === 0) maybeTriggerLoss();
  }

  // ---------- Kombination prüfen + Scoring + Popups ----------
  function checkSelectedCards() {
    const selectedCards = Array.from(document.querySelectorAll(".card.selected"));
    if (selectedCards.length === 0) return;

    const total = selectedCards.map(el => getCardNumericValue(el.textContent)).reduce((a, b) => a + b, 0);

    if (total > 11) {
      const center = centerOfElements(selectedCards);
      spawnPopupAt(center.x, center.y, `${WRONG_COMBO_PENALTY}`, "neg");
      selectedCards.forEach(el => el.classList.remove("selected"));
      addScore(WRONG_COMBO_PENALTY, { penalty: true }); // Penalty NICHT multiplizieren
      return;
    }
    if (total !== 11) return;

    const usedWaste = selectedCards.some(el => el.classList.contains("waste-card"));
    const fieldCards = selectedCards.filter(el => el.classList.contains("field"));

    // Punkte-Berechnung (positive Werte werden multipiziert)
    const basePoints = 10;
    const perField = 2 * fieldCards.length;
    const streakBonus = 2 * streak;
    const movePoints = basePoints + perField + streakBonus;

    fieldCards.forEach(el => spawnPopupOnElement(el, "+2", "pos"));
    const center = centerOfElements(selectedCards);
    spawnPopupAt(center.x, center.y, `+${Math.round(movePoints * getRoundMultiplier(currentRound))}`, "pos");
    if (streakBonus > 0) spawnPopupAt(center.x, center.y - 22, `+${Math.round(streakBonus * getRoundMultiplier(currentRound))} streak`, "pos");

    // Entfernen
    selectedCards.forEach(card => {
      card.classList.remove("selected");
      if (card.classList.contains("field")) {
        card.classList.remove("clickable", "unselectable");
        card.classList.add("removed");
        card.style.visibility = "hidden";
      } else if (card.classList.contains("waste-card")) {
        const idx = wasteStack.indexOf(card);
        if (idx >= 0) wasteStack.splice(idx, 1);
        if (card.parentElement === wasteEl) wasteEl.removeChild(card);
      }
    });

    addScore(movePoints);        // mit Multiplikator
    streak += 1;
    updateScoreHud();

    checkAndAwardPeakBonuses();
    updateCoverageState();

    if (allFieldCleared()) {
      handleRoundWin();          // beendet Runde inkl. Endboni & Weiterleitung
      return;
    }

    // Nach Verbrauch der Waste-Karte automatisch vom Stock nachlegen
    if (usedWaste) {
      if (!drawCardFromStockToWaste_Auto()) {
        endNowIfNoWasteAndNoStock(); // Stock leer & Waste gerade verbraucht → sofortiger Rundenausgang
      }
    }

    if (stock.length === 0) maybeTriggerLoss();
  }

  function checkAndAwardPeakBonuses() {
    for (let d = 0; d < NUM_DIAMONDS; d++) {
      if (clearedPeaks.has(d)) continue;
      const remainingInPeak = document.querySelectorAll(`.card.field[data-diamond="${d}"]:not(.removed)`);
      if (remainingInPeak.length === 0) {
        clearedPeaks.add(d);
        spawnCenterPopup(`Peak +${Math.round(PEAK_CLEAR_BONUS * getRoundMultiplier(currentRound))}`, "pos");
        addScore(PEAK_CLEAR_BONUS);
      }
    }
  }

  // ---------- Win/Lose auf Rundenebene ----------
  function allFieldCleared() {
    const remainingField = document.querySelectorAll(".card.field:not(.removed)");
    return remainingField.length === 0;
  }

  function handleRoundWin() {
    pauseTimer();
    // Endboni (mit Multiplikator)
    const remainingSeconds = Math.ceil(timeRemaining / 1000);
    const timeBonus = Math.max(0, remainingSeconds * 5);
    const stockBonus = Math.max(0, stock.length * 10);

    const area = peakRow?.getBoundingClientRect?.();
    const cx = area ? (area.left + area.width / 2) : (window.innerWidth / 2);
    const cy = area ? (area.top + 40) : 120;

    if (timeBonus > 0) spawnPopupAt(cx - 40, cy, `Time +${Math.round(timeBonus * getRoundMultiplier(currentRound))}`, "pos");
    if (stockBonus > 0) spawnPopupAt(cx + 40, cy, `Stock +${Math.round(stockBonus * getRoundMultiplier(currentRound))}`, "pos");
    addScore(timeBonus);
    addScore(stockBonus);

    spawnCenterPopup(`Win +${Math.round(WIN_BONUS * getRoundMultiplier(currentRound))}`, "pos");
    addScore(WIN_BONUS);

    endRound("win");
  }

  function existsAnyElevenCombo() {
    const vals = Array.from(document.querySelectorAll(".card.field"))
      .filter(el => !el.classList.contains("removed") && !el.classList.contains("covered"))
      .map(el => getCardNumericValue(el.textContent));

    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        if (vals[i] + vals[j] === 11) return true;
      }
    }
    const wasteTop = topWasteValueOrNull();
    if (wasteTop != null) {
      for (const v of vals) if (wasteTop + v === 11) return true;
    }
    return false;
  }

  function endNowIfNoWasteAndNoStock() {
    // Harte Regel: stock==0 & waste leer → Runde sofort zu Ende
    if (stock.length === 0 && wasteStack.length === 0) {
      if (allFieldCleared()) handleRoundWin();
      else endRound("lose");
    }
  }

  function maybeTriggerLoss() {
    if (gameOver) return;

    if (stock.length === 0 && wasteStack.length === 0) {
      if (allFieldCleared()) handleRoundWin();
      else endRound("lose");
      return;
    }
    if (stock.length === 0 && !existsAnyElevenCombo()) {
      endRound("lose");
    }
  }

  // ---------- Round Orchestration ----------
  function endRound(status /*"win"|"lose"|"timeup"*/) {
    pauseTimer();

    // fixiere Rundenwerte
    const snapshot = {
      round: currentRound,
      status,
      score: roundScore,
      timeMs: getRoundTimeLimitMs(currentRound) - timeRemaining,
      stockLeft: stock.length
    };
    roundHistory.push(snapshot);
    totalScore += roundScore;

    // Overlay mit Ergebnis der Runde
    showRoundSummary(status, snapshot);

    // Weiterleitung: entweder nächste Runde oder Finalscreen
    if (currentRound < MAX_ROUNDS) {
      currentRound += 1;
    } else {
      // gesamtes Spiel vorbei
      showFinalSummary();
      gameOver = true;
    }
  }

  function showRoundSummary(status, snap) {
    const ovId = "roundSummaryOverlay";
    let ov = document.getElementById(ovId);
    if (ov) ov.remove();

    ov = document.createElement("div");
    ov.id = ovId;
    ov.className = "tutorial-overlay"; // reuse styles
    const title = status === "win" ? "Round Cleared!" : (status === "timeup" ? "Time's up!" : "Round Over");
    const canContinue = currentRound < MAX_ROUNDS;

    ov.innerHTML = `
      <div class="tutorial-card">
        <h2>${title} (Round ${currentRound}/${MAX_ROUNDS})</h2>
        <p><strong>Round Score:</strong> ${roundScore}</p>
        <p><strong>Total Score:</strong> ${totalScore + (canContinue ? 0 : 0)}</p>
        <p><strong>Time Used:</strong> ${Math.round(snap.timeMs/1000)}s</p>
        <p><strong>Stock Left:</strong> ${snap.stockLeft}</p>
        <div style="display:flex; gap:12px; justify-content:center; margin-top:10px;">
          ${canContinue ? `<button id="nextRoundBtn" class="ui-button">Next Round</button>` : `<button id="finalOkBtn" class="ui-button">OK</button>`}
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const proceed = () => {
      ov.remove();
      if (currentRound <= MAX_ROUNDS && !gameOver) {
        // Nächste Runde dealen
        dealNewRound();
      }
    };
    const finish = () => { ov.remove(); /* Finalscreen bleibt sichtbar */ };

    if (canContinue) {
      ov.querySelector("#nextRoundBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); proceed(); }, { passive: false });
      ov.querySelector("#nextRoundBtn").addEventListener("touchstart", (e) => { e.preventDefault(); proceed(); }, { passive: false });
    } else {
      ov.querySelector("#finalOkBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); finish(); }, { passive: false });
      ov.querySelector("#finalOkBtn").addEventListener("touchstart", (e) => { e.preventDefault(); finish(); }, { passive: false });
    }
  }

  function showFinalSummary() {
    const ovId = "finalSummaryOverlay";
    let ov = document.getElementById(ovId);
    if (ov) ov.remove();

    // History Tabelle
    const rows = roundHistory.map(r =>
      `<tr>
        <td>${r.round}</td>
        <td>${r.status}</td>
        <td>${r.score}</td>
        <td>${Math.round(r.timeMs/1000)}s</td>
        <td>${r.stockLeft}</td>
      </tr>`
    ).join("");

    ov = document.createElement("div");
    ov.id = ovId;
    ov.className = "tutorial-overlay";
    ov.innerHTML = `
      <div class="tutorial-card" style="max-width:680px;">
        <h2>Game Over — Final Results</h2>
        <p><strong>Total Score:</strong> ${totalScore}</p>
        <table class="final-table">
          <thead><tr><th>Round</th><th>Status</th><th>Score</th><th>Time</th><th>Stock Left</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="display:flex; gap:12px; justify-content:center; margin-top:10px;">
          <button id="restartAllBtn" class="ui-button">Play Again</button>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const again = () => { ov.remove(); restartGameFully(); };
    ov.querySelector("#restartAllBtn").addEventListener("pointerdown", (e) => { e.preventDefault(); again(); }, { passive: false });
    ov.querySelector("#restartAllBtn").addEventListener("touchstart", (e) => { e.preventDefault(); again(); }, { passive: false });
  }

  function dealNewRound() {
    // Reset nur rundenbezogen (Board, stock, waste, timer, streak, roundScore, peaks)
    streak = 0;
    roundScore = 0;
    clearedPeaks.clear();
    updateScoreHud();

    // Board & Waste leeren
    wasteStack.splice(0, wasteStack.length);
    while (wasteEl.firstChild) wasteEl.removeChild(wasteEl.firstChild);
    while (peakRow.firstChild) peakRow.removeChild(peakRow.firstChild);

    // Board neu aufbauen
    for (let d = 0; d < NUM_DIAMONDS; d++) peakRow.appendChild(createDiamond(d));
    updateCoverageState();

    // Stock neu
    stock = generateBiasedStock(24);
    updateStockCount();

    // Start: 1 Karte vom Stock auf den Waste
    if (stock.length > 0) {
      const v = stock.pop();
      updateStockCount();
      pushWasteCardWithValue(v);
    }

    // Timer der neuen Runde
    resetTimerForRound();
    startTimer();
  }

  // ---------- Timebar (ohne Text-Label) ----------
  function ensureTimebar() {
    let bar = document.getElementById("timebar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "timebar";
      bar.innerHTML = `<div class="fill"></div>`;
      document.body.appendChild(bar);
    } else {
      const oldLabel = bar.querySelector(".label");
      if (oldLabel) oldLabel.remove();
    }
    return bar;
  }
  const timebar = ensureTimebar();

  function startTimer() {
    clearInterval(timer);
    timeStart = performance.now();
    timer = setInterval(() => {
      const elapsed = performance.now() - timeStart;
      timeRemaining = Math.max(0, getRoundTimeLimitMs(currentRound) - elapsed);
      updateTimebar(timeRemaining);
      if (timeRemaining <= 0) {
        clearInterval(timer);
        endRound("timeup");
      }
    }, 120);
  }
  function pauseTimer() { clearInterval(timer); }
  function resetTimerForRound() {
    clearInterval(timer);
    timeRemaining = getRoundTimeLimitMs(currentRound);
    updateTimebar(timeRemaining);
  }
  function colorForPct(p) {
    if (p > 0.66) return "#41c77d";  // grün
    if (p > 0.33) return "#e6c14a";  // gelb
    return "#e85b5b";                // rot
  }
  function updateTimebar(ms) {
    const fill = timebar.querySelector(".fill");
    const pct = (ms / getRoundTimeLimitMs(currentRound));
    if (fill) {
      fill.style.width = Math.max(0, Math.min(100, pct * 100)) + "%";
      fill.style.background = colorForPct(pct);
    }
  }

  // ---------- Restart / Init ----------
  function updateStockCount() {
    const el = document.getElementById("stockCount");
    if (el) el.textContent = String(stock.length);
  }

  function restartGameFully() {
    // vollständiger Neustart (alle Runden zurücksetzen)
    gameOver = false;
    currentRound = 1;
    totalScore = 0;
    roundScore = 0;
    streak = 0;
    clearedPeaks.clear();
    roundHistory = [];
    updateScoreHud();

    document.querySelectorAll(".win-message").forEach(el => el.remove());
    document.querySelectorAll("#roundSummaryOverlay,#finalSummaryOverlay").forEach(el => el.remove());
    wasteStack.splice(0, wasteStack.length);
    while (wasteEl.firstChild) wasteEl.removeChild(wasteEl.firstChild);
    while (peakRow.firstChild) peakRow.removeChild(peakRow.firstChild);

    for (let d = 0; d < NUM_DIAMONDS; d++) peakRow.appendChild(createDiamond(d));
    updateCoverageState();

    stock = generateBiasedStock(24);
    updateStockCount();

    if (stock.length > 0) {
      const v = stock.pop();
      updateStockCount();
      pushWasteCardWithValue(v);
    }

    resetTimerForRound();
    startTimer();
    killStrayStockLabels();
  }

  // ---------- Initial Setup ----------
  ensureTopBar();
  ensureTutorialButton();
  ensureRestartButton();
  ensureScoreHud();
  ensureStockWrapAndLabel();

  for (let d = 0; d < NUM_DIAMONDS; d++) peakRow.appendChild(createDiamond(d));
  updateCoverageState();

  stock = generateBiasedStock(24);
  updateStockCount();

  if (stock.length > 0) {
    const v = stock.pop();
    updateStockCount();
    pushWasteCardWithValue(v);
  }

  resetTimerForRound();
  startTimer();

  killStrayStockLabels();

  window.addEventListener("resize", updateCoverageState, { passive: true });

  // ---------- Deck/Stock: Komplement-Bias ----------
  function generateBiasedStock(size) {
    const fieldVals = Array.from(document.querySelectorAll(".card.field"))
      .map(el => getCardNumericValue(el.textContent));
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
      let pickNum = (pool.length > 0 && Math.random() < 0.7)
        ? pool[Math.floor(Math.random() * pool.length)]
        : Math.floor(Math.random() * 10) + 1;
      result.push(pickNum === 1 ? "A" : String(pickNum));
    }
    return result;
  }
});
