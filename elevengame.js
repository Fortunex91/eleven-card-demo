window.addEventListener("DOMContentLoaded", () => {
  const peakRow = document.getElementById("peakRow");
  const deckEl = document.getElementById("deck");
  const wasteEl = document.getElementById("waste");
  const stockCount = document.getElementById("stockCount");

  // Layout-Konfiguration (Diamond/Peak)
  const rowsPerDiamond = [1, 2, 3, 2, 1];
  const NUM_DIAMONDS = 3;

  // Kartenwerte
  const cardValues = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const stock = Array.from({ length: 24 }, () => getRandomCardValue());
  const wasteStack = []; // hält DOM-Elemente der Waste-Karten (oben = last)

  function getRandomCardValue() {
    return cardValues[Math.floor(Math.random() * cardValues.length)];
  }

  function getCardNumericValue(cardText) {
    return cardText === "A" ? 1 : parseInt(cardText, 10);
  }

  // ---------- Peak-Erzeugung mit stabilen IDs & Blocker-Mapping ----------
  let cardIdCounter = 0;
  function makeCardId(d, r, c) {
    // eindeutige, lesbare ID
    return `card-d${d}-r${r}-c${c}`;
  }

  function createDiamond(diamondIndex) {
    const peak = document.createElement("div");
    peak.classList.add("peak");

    const cardHeight = 90;
    const overlap = cardHeight * 0.2;

    // Matrix der Rows/Karten pro Peak
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
        // Indizes & ID setzen
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

    // Blocker-Beziehungen (pro Karte die Karten der VORHERIGEN Row)
    for (let r = 1; r < cardMatrix.length; r++) {
      const prevRow = cardMatrix[r - 1];
      const curRow = cardMatrix[r];
      const prevLen = prevRow.length;
      const curLen = curRow.length;

      for (let c = 0; c < curLen; c++) {
        const curCard = curRow[c];

        // Mappe aktuelle Spalte c auf Index(e) in der vorherigen Row
        let indices = [];
        if (prevLen === 1) {
          indices = [0];
        } else if (curLen === 1) {
          // selten im Diamond, aber der Vollständigkeit halber
          indices = [0, prevLen - 1];
        } else {
          const x = c * (prevLen - 1) / (curLen - 1);
          const left = Math.floor(x);
          const right = Math.ceil(x);
          indices = left === right ? [left] : [left, right];
        }

        const blockers = indices
          .map(idx => prevRow[idx]?.id)
          .filter(Boolean);

        if (blockers.length > 0) {
          curCard.dataset.blockers = blockers.join(",");
        }
      }
    }

    return peak;
  }

  // ---------- Coverage: blockierte Karten zuverlässig via data-blockers ----------
  function isCardCovered(cardEl) {
    if (!cardEl || cardEl.classList.contains("removed")) return false;
    const blockers = (cardEl.dataset.blockers || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (blockers.length === 0) return false;

    for (const bid of blockers) {
      const blockerEl = document.getElementById(bid);
      if (
        blockerEl &&
        blockerEl.isConnected &&
        blockerEl.classList.contains("field") &&
        !blockerEl.classList.contains("removed")
      ) {
        return true; // mindestens ein Blocker liegt noch drüber
      }
    }
    return false;
  }

  function updateCoverageState() {
    const fieldCards = document.querySelectorAll(".card.field");
    fieldCards.forEach(card => {
      const covered = isCardCovered(card);
      card.classList.toggle("covered", covered);
      card.classList.toggle("clickable", !covered && !card.classList.contains("removed"));
      // Keine per-Card-Listener hier setzen – alles via Delegation
    });
  }

  // ---------- Delegierter Klick-Handler (verhindert alte Listener-Probleme) ----------
  document.addEventListener(
    "click",
    (ev) => {
      const card = ev.target.closest?.(".card");
      if (!card) return;

      // Feldkarten (Peaks)
      if (card.classList.contains("field")) {
        // Harte Blockade für entfernte
        if (card.classList.contains("removed")) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        // Covered → nur Shake, keine Auswahl
        if (card.classList.contains("covered")) {
          ev.preventDefault();
          ev.stopPropagation();
          triggerShake(card);
          return;
        }

        // Spielbar
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
    },
    true // capture, um vor evtl. anderen Listenern zu greifen
  );

  function triggerShake(el) {
    if (el.classList.contains("shake")) return;
    el.classList.add("shake");
    const off = () => {
      el.classList.remove("shake");
      el.removeEventListener("animationend", off);
    };
    el.addEventListener("animationend", off);
  }

  // ---------- Row-basiertes Refill: genau 1 Slot pro Zug, nur Feldkarten ----------
  function refillOneRemovedSlot() {
    const removedSlots = Array.from(document.querySelectorAll(".card.field.removed"));
    if (removedSlots.length === 0) return false;

    // Gruppiere nach Row-Top (visuelle Reihenfolge)
    const groupedByRow = {};
    removedSlots.forEach(slot => {
      const top = slot.parentElement?.style?.top || "";
      if (!groupedByRow[top]) groupedByRow[top] = [];
      groupedByRow[top].push(slot);
    });

    const sortedTops = Object.keys(groupedByRow).sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
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
        // Karte aus dem Waste-Container visuell "verbrauchen"
        if (prevCardEl?.parentElement === wasteEl) {
          wasteEl.removeChild(prevCardEl);
        }

        // Slot auffüllen (Wert übernehmen)
        slot.classList.remove("removed", "selected", "covered");
        slot.textContent = prevCardEl?.textContent || getRandomCardValue();
        slot.style.visibility = "visible";
        // Nach einem Refill direkt Coverage neu bewerten
        updateCoverageState();
        return true;
      }
    }
    return false;
  }

  // ---------- Ziehen vom Deck ----------
  function drawCard(initial = false) {
    if (!initial) {
      refillOneRemovedSlot(); // genau ein Slot
      updateCoverageState();
    }
    if (stock.length === 0) return;

    const newCardValue = stock.pop();
    stockCount.textContent = stock.length;

    const newCard = document.createElement("div");
    newCard.classList.add("waste-card", "card", "clickable");
    newCard.textContent = newCardValue;
    newCard.style.zIndex = String(wasteStack.length);

    wasteEl.appendChild(newCard);
    wasteStack.push(newCard);
  }

  deckEl.addEventListener("click", () => drawCard());

  // ---------- Kombination prüfen ----------
  function checkSelectedCards() {
    const selectedCards = Array.from(document.querySelectorAll(".card.selected"));
    if (selectedCards.length === 0) return;

    const total = selectedCards
      .map(el => getCardNumericValue(el.textContent))
      .reduce((a, b) => a + b, 0);

    if (total !== 11) return;

    // Entferne ausgewählte Karten (Feld & Waste)
    selectedCards.forEach(card => {
      card.classList.remove("selected");

      if (card.classList.contains("field")) {
        // Feldkarte wird "weggenommen"
        card.classList.remove("clickable");
        card.classList.add("removed");
        card.style.visibility = "hidden";
      } else if (card.classList.contains("waste-card")) {
        // Waste-Karte entfernen
        const idx = wasteStack.indexOf(card);
        if (idx >= 0) wasteStack.splice(idx, 1);
        if (card.parentElement === wasteEl) {
          wasteEl.removeChild(card);
        }
      }
    });

    // Nach dem Entfernen neu berechnen
    updateCoverageState();
    checkWinCondition();
  }

  // ---------- Win Condition (alle Feldkarten entfernt) ----------
  function checkWinCondition() {
    const remainingField = document.querySelectorAll(".card.field:not(.removed)");
    if (remainingField.length === 0) {
      showWinMessage();
    }
  }

  function showWinMessage() {
    const message = document.createElement("div");
    message.innerText = "🎉 You Win! 🎉";
    message.classList.add("win-message");
    document.body.appendChild(message);
  }

  // ---------- Initiales Setup ----------
  for (let d = 0; d < NUM_DIAMONDS; d++) {
    peakRow.appendChild(createDiamond(d));
  }

  updateCoverageState();
  drawCard(true);

  // Bei Resize sicherheitshalber neu bewerten (falls Layout leicht shiftet)
  window.addEventListener("resize", updateCoverageState);
});
