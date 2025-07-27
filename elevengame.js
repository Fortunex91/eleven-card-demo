<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Eleven Game Layout</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      background-color: #3b5d3c;
      background-image: var(--background-image);
      background-size: cover;
      background-position: center;
      font-family: sans-serif;
    }

    :root {
      --background-image: none;
    }

    .game-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      height: 100%;
      width: 100%;
      padding-top: 20px;
    }

    .score-display {
      font-size: 24px;
      font-weight: bold;
      color: #fff;
      margin-bottom: 20px;
    }

    .peak-row {
      display: flex;
      justify-content: space-evenly;
      width: 80%;
      margin-bottom: 40px;
    }

    .peak {
      position: relative;
      width: 100px;
      height: 360px;
    }

    .card-row {
      display: flex;
      justify-content: center;
      gap: 6px;
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }

    .card, .waste-card {
      width: 60px;
      height: 90px;
      border-radius: 8px;
      box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.25);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: bold;
      color: #222;
      border: 1px solid #ccc;
      transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
      background: linear-gradient(145deg, #ffffff, #f2f2f2);
    }

    .card.clickable {
      cursor: pointer;
    }

    .card.selected, .waste-card.selected {
      transform: translateY(-6px);
      box-shadow: 0 0 12px 4px rgba(255, 255, 0, 0.6);
    }

    .card.covered {
      background: linear-gradient(145deg, #d4d4d4, #e5e5e5);
    }

    .deck-area {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 60px;
      margin-top: 30px;
    }

    .deck, .waste {
      width: 70px;
      height: 100px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .deck {
      background: white;
      border: 2px solid #888;
      cursor: pointer;
    }

    .waste {
      background: transparent;
      border: none;
    }

    .waste-card {
      position: absolute;
      top: 0;
      left: 0;
    }
  </style>
</head>
<body>
  <div class="game-container">
    <div class="score-display" id="scoreDisplay">Score: 0</div>
    <div class="peak-row" id="peakRow"></div>
    <div class="deck-area">
      <div class="deck" id="deck">Draw</div>
      <div id="stockCount" style="margin-top: 8px; color: white; font-weight: bold; text-align: center;">24</div>
      <div class="waste" id="waste"></div>
    </div>
  </div>

  <script>
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
      }
    }

    // --- Erweiterung der Spiel-Logik: Gewinnbedingung ---

function checkWinCondition() {
  // Selektiere alle Slots, die noch Karten enthalten (also nicht entfernt wurden)
  const remainingCards = document.querySelectorAll('.card-slot:not(.removed)');

  // Filtere nur die Slots, die Teil der .peak-row sind (also der eigentlichen Spielkarten im Spielfeld)
  const remainingPeakCards = Array.from(remainingCards).filter((slot) => {
    const parent = slot.closest('.peak-row'); // Prüfe, ob sich der Slot in einer .peak-row befindet
    return parent !== null; // Nur solche Slots zählen für die Gewinnbedingung
  });

  // Wenn keine Karten mehr in den Peaks vorhanden sind, hat der Spieler gewonnen
  if (remainingPeakCards.length === 0) {
    showWinMessage();
  }
}

function showWinMessage() {
  // Erstelle ein neues Div-Element zur Anzeige der Gewinnmeldung
  const message = document.createElement('div');
  message.innerText = '🎉 You Win! 🎉';
  message.classList.add('win-message');
  document.body.appendChild(message); // Füge es zum Body hinzu, damit es sichtbar wird
}

// --- Dynamische CSS-Regeln für die Gewinnmeldung ---
const style = document.createElement('style');
style.innerHTML = `
  .win-message {
    position: fixed; /* Bleibt beim Scrollen an der selben Stelle */
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%); /* Zentriert das Element visuell */
    background: gold; /* Goldene Hintergrundfarbe für den Effekt */
    padding: 30px 50px;
    border-radius: 12px;
    font-size: 2rem;
    box-shadow: 0 0 20px rgba(0,0,0,0.3); /* Leichter Schatten für Tiefe */
    z-index: 1000; /* Über alles andere legen */
    animation: fadeIn 0.6s ease-out; /* Einblende-Animation */
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, -60%); } /* Startet weiter oben und unsichtbar */
    to   { opacity: 1; transform: translate(-50%, -50%); }  /* Endposition */
  }
`;
document.head.appendChild(style); // Füge das CSS dynamisch dem Head hinzu

// 🔁 Aufruf dieser Funktion sollte erfolgen, nachdem Karten erfolgreich entfernt wurden
// Beispiel (in checkSelectedCards):
// checkWinCondition();


    for (let i = 0; i < 3; i++) {
      peakRow.appendChild(createDiamond());
    }

    drawCard(true);
  </script>
</body>
</html>
