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
        const rect = slot.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const blockers = Array.from(document.elementsFromPoint(centerX, centerY)).filter(el => el !== slot && el.classList.contains("card") && el.getBoundingClientRect().top > rect.top);
        if (blockers.length) {
          slot.classList.add("covered");
        } else {
          slot.classList.add("clickable");
          slot.addEventListener("click", () => {
            slot.classList.toggle("selected");
            checkSelectedCards();
          }, { once: true });
        }
        return true;
      }
    }
    return false;
  }

  function drawCard(initial = false) {
    if (!initial) refillOneRemovedSlot();
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
        card.classList.add("card");
        card.textContent = getRandomCardValue();
        row.appendChild(card);
        rowCards.push(card);
      }
      peak.appendChild(row);
      cardMatrix.push(rowCards);
    });
    const numRows = cardMatrix.length;
    cardMatrix.forEach((row, rowIndex) => {
      row.forEach((card, colIndex) => {
        let isCovered = false;
        if (rowIndex < numRows - 1) {
          const nextRow = cardMatrix[rowIndex + 1];
          for (let i = 0; i < nextRow.length; i++) {
            const offset = Math.abs(i - colIndex);
            if (offset <= 1) {
              isCovered = true;
              break;
            }
          }
        }
        if (!isCovered) {
          card.classList.add("clickable");
          card.addEventListener("click", () => {
            card.classList.toggle("selected");
            checkSelectedCards();
          });
        } else {
          card.classList.add("covered");
        }
      });
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
      const coveredCards = document.querySelectorAll(".card.covered");
      coveredCards.forEach(card => {
        const cardRect = card.getBoundingClientRect();
        const cardCenterX = cardRect.left + cardRect.width / 2;
        const cardCenterY = cardRect.top + cardRect.height / 2;
        const isStillCovered = Array.from(document.elementsFromPoint(cardCenterX, cardCenterY)).some(el => {
          return el !== card && el.classList.contains("card") && !el.classList.contains("covered") && el.getBoundingClientRect().top > cardRect.top;
        });
        if (!isStillCovered) {
          card.classList.remove("covered");
          card.classList.add("clickable");
          card.addEventListener("click", () => {
            card.classList.toggle("selected");
            checkSelectedCards();
          }, { once: true });
        }
      });
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

  for (let i = 0; i < 3; i++) {
    peakRow.appendChild(createDiamond());
  }

  drawCard(true);
});

