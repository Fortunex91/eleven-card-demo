window.addEventListener("DOMContentLoaded", () => {
  const peakRow = document.getElementById("peakRow");
  const deckEl = document.getElementById("deck");
  const wasteEl = document.getElementById("waste");
  const stockCount = document.getElementById("stockCount");

  // Layout-Konfiguration (Diamond/Peak)
  const rowsPerDiamond = [1, 2, 3, 2, 1];
  const NUM_DIAMONDS = 3;

  // Kartenwerte / Stacks
  const cardValues = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
  const stock = Array.from({ length: 24 }, () => getRandomCardValue());
  const wasteStack = []; // DOM-Elemente der Waste-Karten (oben = last)

  function getRandomCardValue() {
    return cardValues[Math.floor(Math.random() * cardValues.length)];
  }
  function getCardNumericValue(cardText) {
    return cardText === "A" ? 1 : parseInt(cardText, 10);
  }

  // ---------- Hilfsfunktionen für IDs und Mapping ----------
  function makeCardId(d, r, c) {
    return `card-d${d}-r${r}-c${c}`;
  }

  /**
   * Liefert für einen Index in einer Row die korrespondierenden Indizes der
   * nächsten Row (darunter). Damit bilden wir die "Kinder" eines Elternknotens.
   * Beispiel: 1 -> 2 -> 3 -> 2 -> 1
   */
  function mapChildrenIndices(curLen, nextLen, idx) {
    if (nextLen === 1) return [0];
    if (curLen === 1) return [0, nextLen - 1]; // Spitze deckt beide darunterliegenden
    const x = idx * (nextLen - 1) / (curLen - 1);
    const left = Math.floor(x);
    const right = Math.ceil(x);
    return left === right ? [left] : [left, right];
  }

  // ---------- Peak erzeugen, data-children verdrahten ----------
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

    // data-children setzen: für jede Karte in Row r → Kinder in Row r+1
    for (let r = 0; r < cardMatrix.length - 1; r++) {
      const curRow = cardMatrix[r];
      const nextRow = cardMatrix[r + 1];
      const curLen = curRow.length;
      const nextLen = nextRow.length;

      for (let c = 0; c < curLen; c++) {
        const parentCard = curRow[c];
        const childIdxs = mapChildrenIndices(curLen, nextLen, c);
        const childIds = childIdxs.map(i => nextRow[i]?.id).filter(Boolean);
        if (childIds.length) {
          parentCard.dataset.children = childIds.join(",");
        }
      }
    }

    return peak;
  }

  // ---------- Coverage: Karte ist covered, solange mind. 1 Kind noch liegt ----------
  function isCardCovered(cardEl) {
    if (!cardEl || cardEl.classList.contains("removed")) return false;
    const children = (cardEl.dataset.children || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    if (children.length === 0) {
      // Unterste Row: hat keine Kinder → niemals covered
      return false;
    }

    for (const cid of children) {
      const childEl = document.getElementById(cid);
      if (
        childEl &&
        childEl.isConnected &&
        childEl.classList.contains("field") &&
        !childEl.classList.contains("removed")
      ) {
        // Ein Kind liegt noch → blockiert
        return true;
      }
    }
    return false; // alle Kinder entfernt → frei spielbar
  }

  function updateCoverageState() {
    const fieldCards = document.querySelectorAll(".card.field");
    fieldCards.forEach(card => {
      const covered = isCardCovered(card);
      card.classList.toggle("covered", covered);
      // "clickable" ist rein visuell für Hover/Cursor – Auswahl steuern wir per Delegation
      card.classList.toggle("clickable", !covered && !card.classList.contains("removed"));
    });
  }

  // ---------- Delegierter Klick-Handler mit Shake für covered ----------
  document.addEventListener(
    "click",
    (ev) => {
      const card = ev.target.closest?.(".card");
      if (!card) return;

      // Feldkarten (Peaks)
      if (card.classList.contains("field")) {
        if (card.classList.contains("removed")) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        if (card.classList.contains("covered")) {
          ev.preventDefault();
          ev.stopPropagation();
          triggerShake(card);
          return;
        }

        // spielbar
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
    true // capture: blockt zuverlässig vor anderen Listenern
  );

  function triggerShake(el) {
    // Klasse setzen und nach Animation wieder entfernen, damit es erneut triggerbar ist
    if (el.classList.contains("shake")) return;
    el.classList.add("shake");
    const off = () => {
      el.classList.remove("shake");
      el.removeEventListener("animationend", off);
    };
    el.addEventListener("animationend", off);
  }

  // ---------- Row-basiertes Refill: genau 1 Slot pro Zug ----------
  function refillOneRemovedSlot() {
    const removedSlots = Array.from(document.querySelectorAll(".card.field.removed"));
    if (removedSlots.length === 0) return false;

    // Gruppiere nach visueller Row (per top-Style)
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
        // Visuell aus Waste entfernen
        if (prevCardEl?.parentElement === wasteEl) {
          wasteEl.removeChild(prevCardEl);
        }

        // Slot auffüllen (nur Text/Wert ersetzen; IDs/Datasets bleiben!)
        slot.classList.remove("removed", "selected", "covered");
        slot.textContent = prevCardEl?.textContent || getRandomCardValue();
        slot.style.visibility = "visible";

        updateCoverageState(); // nach Refill neu bewerten
        return true; // exakt 1 Slot
      }
    }
    return false;
  }

  // ---------- Ziehen vom Deck ----------
  function drawCard(initial = false) {
    if (!initial) {
      refillOneRemovedSlot();
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

    // Entfernen
    selectedCards.forEach(card => {
      card.classList.remove("selected");

      if (card.classList.contains("field")) {
        // Feldkarte „wegnehmen“ (IDs/Datasets bleiben am Element)
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

    // Nach Entfernen Coverage neu berechnen
    updateCoverageState();
    checkWinCondition();
  }

  // ---------- Win Condition: alle Feldkarten weg ----------
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

  // Bei Resize vorsichtshalber neu bewerten (Layout-Shifts)
  window.addEventListener("resize", updateCoverageState);
});
