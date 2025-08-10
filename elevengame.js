window.addEventListener("DOMContentLoaded", () => {
  const peakRow = document.getElementById("peakRow");
  const deckEl = document.getElementById("deck");
  const wasteEl = document.getElementById("waste");
  const stockCount = document.getElementById("stockCount");
  let restartBtn = document.getElementById("restartBtn");        // NEW

  // Diamond/Peak Layout
  const rowsPerDiamond = [1, 2, 3, 2, 1];
  const NUM_DIAMONDS = 3;

  // Kartenwerte / Stapel
  const cardValues = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  let stock = Array.from({ length: 24 }, () => getRandomCardValue()); // CHANGED (let, da Reset)
  const wasteStack = []; // DOM-Elemente der Waste-Karten (oberste = last)

  let gameOver = false;                                         // NEW

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
   * Korrektes Kind-Mapping für TriPeaks-Diamant [1,2,3,2,1]:
   * Eine Karte ist "covered", solange MINDESTENS eines ihrer Kinder (in der nächsten Row darunter) noch liegt.
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

    // --- Loss-Check bei leerem Stock auch hier absichern (z.B. nach Refill) ---
    if (stock.length === 0) maybeTriggerLoss();              // NEW
  }

  // ---------- Delegierter Klick-Handler ----------
  document.addEventListener("click", (ev) => {
    if (gameOver) return;                                    // NEW

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

        if (wasteStack.length === 0) {           // NEW
          ensureWasteCard();
        }

        // Wenn Stock leer ist, könnte jetzt kein Move mehr möglich sein
        if (stock.length === 0) maybeTriggerLoss();          // NEW

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
      refillOneRemovedSlot();
      updateCoverageState();
    }
    if (stock.length === 0) {
      // Stock ist leer -> direkt prüfen, ob Loss vorliegt
      maybeTriggerLoss();                                    // NEW
      return;
    }

    const newCardValue = stock.pop();
    stockCount.textContent = stock.length;

    pushWasteCardWithValue(newCardValue, "stock");

    // Wenn wir gerade die letzte Karte gezogen haben, jetzt prüfen
    if (stock.length === 0) maybeTriggerLoss();              // NEW
  }

  deckEl.addEventListener("click", () => {
    if (gameOver) return;
    drawCard();
  });

  // ---------- Kombination prüfen (mit "Waste nie leer" Fix) ----------
  function checkSelectedCards() {
    const selectedCards = Array.from(document.querySelectorAll(".card.selected"));
    if (selectedCards.length === 0) return;

    const total = selectedCards
      .map(el => getCardNumericValue(el.textContent))
      .reduce((a, b) => a + b, 0);

    if (total !== 11) return;

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

    updateCoverageState();
    checkWinCondition();

    ensureWasteCard();
    setTimeout(ensureWasteCard, 0);

    // Nach jedem erfolgreichen Zug prüfen wir bei leerem Stock auch hier
    if (stock.length === 0) maybeTriggerLoss();              // NEW
  }

  // ---------- Win Condition ----------
  function checkWinCondition() {
    const remainingField = document.querySelectorAll(".card.field:not(.removed)");
    if (remainingField.length === 0) {
      showWinMessage();
    }
  }

  // ---------- Loss-Check ----------
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
    // 1) Pair innerhalb der Feldkarten
    for (let i = 0; i < vals.length; i++) {
      for (let j = i + 1; j < vals.length; j++) {
        if (vals[i] + vals[j] === 11) return true;
      }
    }
    // 2) Waste-Top + irgendeine Feldkarte
    const wasteTop = getTopWasteValueOrNull();
    if (wasteTop != null) {
      for (const v of vals) {
        if (wasteTop + v === 11) return true;
      }
    }
    return false;
  }

  function maybeTriggerLoss() {
    if (gameOver) return;                    // NEW: nicht doppelt
    if (stock.length > 0) return;            // Loss nur, wenn Stock leer
    if (existsAnyElevenCombo()) return;      // Es gibt noch Moves → kein Loss
    showLoseMessage();
  }

  // ---------- Restart-Button & Messages ----------
  function ensureRestartButton() {                                     // NEW
    let btn = document.getElementById("restartBtn");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "restartBtn";
      btn.type = "button";
      btn.textContent = "Restart";
      // Inline-Minimalstil, falls kein CSS vorhanden:
      btn.style.marginBottom = "10px";
      btn.style.padding = "8px 14px";
      btn.style.borderRadius = "8px";
      btn.style.border = "1px solid #ccc";
      btn.style.cursor = "pointer";
    }
    const target =
      deckEl?.parentElement ||
      document.querySelector(".deck-area") ||
      document.querySelector(".game-container") ||
      document.body;

    if (!btn.isConnected) {
      // VOR das Deck setzen, damit er sicher sichtbar ist
      if (deckEl && deckEl.parentElement === target) {
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
    ensureRestartButton();                                         // NEW
    const message = document.createElement("div");
    message.innerText = "🎉 You Win! 🎉";
    message.classList.add("win-message");
    document.body.appendChild(message);
  }

  function showLoseMessage() {
    if (gameOver) return;
    gameOver = true;
    ensureRestartButton();                                         // NEW
    const message = document.createElement("div");
    message.innerText = "💀 No moves left!";
    message.classList.add("win-message");
    message.style.background = "#e74c3c";
    message.style.color = "#fff";
    document.body.appendChild(message);
  }

  function restartGame() {
    gameOver = false;
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
    drawCard(true);
    ensureWasteCard();
  }

  // ---------- Initiales Setup ----------
  ensureRestartButton();                                          // NEW (Button sicher anlegen)
  for (let d = 0; d < NUM_DIAMONDS; d++) {
    peakRow.appendChild(createDiamond(d));
  }
  updateCoverageState();
  drawCard(true);
  if (wasteStack.length === 0) ensureWasteCard();
  window.addEventListener("resize", updateCoverageState);
});
