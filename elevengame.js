window.addEventListener("DOMContentLoaded", () => {
  const peakRow = document.getElementById("peakRow");
  const deckEl = document.getElementById("deck");
  const wasteEl = document.getElementById("waste");
  const stockCount = document.getElementById("stockCount");
  const rowsPerDiamond = [1, 2, 3, 2, 1];
  const cardValues = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

  function getCardNumericValue(cardText) {
    return cardText === "A" ? 1 : parseInt(cardText, 10);
  }

  function getRandomCardValue() {
    return cardValues[Math.floor(Math.random() * cardValues.length)];
  }

  const stock = Array.from({ length: 24 }, () => getRandomCardValue());
  const wasteStack = [];

  function refillOneRemovedSlot() {
    const removedSlots = Array.from(document.querySelectorAll(".card.removed"));
    const groupedByRow = {};
    removedSlots.forEach(slot => {
      const top = slot.parentElement.style.top;
      if (!groupedByRow[top]) groupedByRow[top] = [];
      groupedByRow[top].push(slot);
    });
    const sortedTops = Object.keys(groupedByRow).sort((a, b) => parseFloat(a) - parseFloat(b));
    for (const top of sortedTops) {
      const rowSlots = groupedByRow[top];
      for (const slot of rowSlots) {
        if (wasteStack.length === 0) return false;
        const prevCard = wasteStack.pop();
        slot.classList.remove("removed", "clickable", "selected", "covered");
        slot.textContent = prevCard.textContent;
        slot.style.visibility = "visible";
        return true;
      }
    }
    return false;
  }

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
    newCard.style.zIndex = wasteStack.length;
    newCard.addEventListener("click", () => {
      newCard.classList.toggle("selected");
      checkSelectedCards();
    });
    wasteEl.appendChild(newCard);
    wasteStack.push(newCard);
  }

  deckEl.addEventListener("click", () => drawCard());

  function createDiamond() {
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
        card.dataset.row = rowIndex; // row-Info für Coverage-Check
        card.textContent = getRandomCardValue();
        row.appendChild(card);
        rowCards.push(card);
      }
      peak.appendChild(row);
      cardMatrix.push(rowCards);
    });
    return peak;
  }

  function checkSelectedCards() {
    const selectedCards = document.querySelectorAll(".card.clickable.selected");
    const selectedValues = Array.from(selectedCards).map(card => getCardNumericValue(card.textContent));
    let total = selectedValues.reduce((a, b) => a + b, 0);
    if (total === 11) {
      selectedCards.forEach(card => {
        card.classList.remove("clickable", "selected");
        card.classList.add("removed");
        card.style.visibility = "hidden";
      });
      updateCoverageState();
      checkWinCondition();
    }
  }

  function checkWinCondition() {
    const remainingCards = document.querySelectorAll('.card-slot:not(.removed)');
    const remainingPeakCards = Array.from(remainingCards).filter((slot) => {
      const parent = slot.closest('.peak-row');
      return parent !== null;
    });
    if (remainingPeakCards.length === 0) {
      showWinMessage();
    }
  }

  function showWinMessage() {
    const message = document.createElement('div');
    message.innerText = '🎉 You Win! 🎉';
    message.classList.add('win-message');
    document.body.appendChild(message);
  }

  // ==== COVERAGE FIX START ====
  function getBounds(el) {
    const r = el.getBoundingClientRect();
    const midX = r.left + r.width / 2;
    const midY = r.top + r.height / 2;
    return { ...r, midX, midY, width: r.width, height: r.height };
  }

  function overlapsEnough(a, b) {
    const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const xRatio = overlapX / Math.min(a.width, b.width);
    return overlapY >= 10 && xRatio >= 0.25;
  }

  function isCardCovered(cardEl) {
    if (!cardEl || cardEl.classList.contains("removed")) return false;
    const meBounds = getBounds(cardEl);
    const myRow = parseInt(cardEl.dataset.row, 10);
    const allCards = Array.from(document.querySelectorAll(".card.field"))
      .filter(c => c !== cardEl && !c.classList.contains("removed"));
    for (const other of allCards) {
      const otherRow = parseInt(other.dataset.row, 10);
      if (otherRow < myRow) {
        const oB = getBounds(other);
        if (oB.midY < meBounds.midY && overlapsEnough(meBounds, oB)) {
          return true;
        }
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

      // Klick-Handler neu setzen
      card.onclick = null; // alte entfernen
      if (!covered && !card.classList.contains("removed")) {
        // normale Karte → auswählbar
        card.onclick = () => {
          card.classList.toggle("selected");
          checkSelectedCards();
        };
      } else if (covered) {
        // verdeckte Karte → Shake-Animation
        card.onclick = () => {
          if (!card.classList.contains("shake")) {
            card.classList.add("shake");
            setTimeout(() => {
              card.classList.remove("shake");
            }, 200); // 0.15s Animation + kleiner Puffer
          }
        };
      }
    });
  }

  // ==== COVERAGE FIX END ====

  // Initial Setup
  for (let i = 0; i < 3; i++) {
    peakRow.appendChild(createDiamond());
  }

  updateCoverageState(); // nach dem Deal
  drawCard(true);
});
