window.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM ----------
  const peakRow   = document.getElementById("peakRow");
  const deckEl    = document.getElementById("deck");
  const wasteEl   = document.getElementById("waste");

  // --- NEU: sicherstellen, dass die richtigen Klassen und der StockCounter korrekt hängen ---
  (function ensureDeckWasteAndCounter(){
    if (deckEl) {
      // Gib dem #deck die Klasse "deck", damit der Kartenrücken via CSS sichtbar wird
      deckEl.classList.add("deck");
      // Position relativ, damit #stockCount absolut darunter positioniert werden kann
      if (getComputedStyle(deckEl).position === "static") {
        deckEl.style.position = "relative";
      }
    }
    if (wasteEl) {
      wasteEl.classList.add("waste");
    }
    // #stockCount anlegen/umhängen und unten zentriert unter dem Stock platzieren
    let sc = document.getElementById("stockCount");
    if (!sc) {
      sc = document.createElement("div");
      sc.id = "stockCount";
    }
    if (deckEl && sc.parentElement !== deckEl) {
      deckEl.appendChild(sc);
    }
    // Inline-Styles für sichere Platzierung (kein CSS-Update nötig)
    if (sc) {
      sc.style.position = "absolute";
      sc.style.left = "50%";
      sc.style.transform = "translateX(-50%)";
      sc.style.bottom = "-18px";       // unter dem Pile
      sc.style.fontSize = "12px";
      sc.style.fontWeight = "700";
      sc.style.color = "#fff";
      sc.style.textShadow = "0 1px 0 rgba(0,0,0,0.5)";
      sc.style.userSelect = "none";
      sc.style.pointerEvents = "none";
      sc.style.zIndex = "1";
    }
  })();

  // ---------- Config ----------
  const rowsPerDiamond = [1, 2, 3, 2, 1];
  const NUM_DIAMONDS   = 3;
  const cardValues     = ["A","2","3","4","5","6","7","8","9","10"];

  const MAX_ROUNDS            = 7;
  const WRONG_COMBO_PENALTY   = -5;
  const PEAK_CLEAR_BONUS      = 50;
  const WIN_BONUS             = 100;

  function getRoundTimeLimitMs(round){ return 90_000 - (round-1)*5_000; } // 90→60
  function getRoundMultiplier(round){  return 1.0 + (round-1)*0.3; }       // 1.0→2.8

  // ---------- State ----------
  let stock = [];                   // via generateBiasedStock()
  const wasteStack = [];            // DOM nodes (top = last)
  let gameOver = false;

  let currentRound = 1;
  let roundScore   = 0;
  let totalScore   = 0;
  let streak       = 0;
  const clearedPeaks = new Set();
  const roundHistory = [];          // [{round,status,score,timeMs,stockLeft}]

  // Transitions / guards
  let roundEnding = false;          // avoid double endRound calls
  let roundTransitionInProgress = false; // avoid double dealNewRound()
  let overlayTimer = null;          // auto-close timer for round overlay
  let hasShownAnyRoundSummary = false; // BUGFIX: kein Popup zu Beginn

  // Timer
  let timer = null;
  let timeRemaining = getRoundTimeLimitMs(currentRound);
  let timeStart = 0;

  // ---------- Utils ----------
  const supportsPointer = "PointerEvent" in window;
  const $ = (sel, root=document) => root.querySelector(sel);

  function getRandomCardValue(){ return cardValues[Math.floor(Math.random()*cardValues.length)]; }
  function valNum(t){ return t==="A" ? 1 : parseInt(t,10); }
  function compFor(v){ return 11 - v; }

  // ---------- UI helpers (Top bar, HUD, Tutorial) ----------
  function ensureTopBar(){
    let bar = $("#topBar");
    if(!bar){
      bar = document.createElement("div");
      bar.id = "topBar";
      bar.className = "top-bar";
      document.body.appendChild(bar);
    }
    return bar;
  }
  function ensureBtn(id, label, handler){
    const bar = ensureTopBar();
    let btn = document.getElementById(id);
    if(!btn){
      btn = document.createElement("button");
      btn.id = id;
      btn.type = "button";
      btn.className = "ui-button";
      btn.textContent = label;
      btn.addEventListener("pointerdown", (e)=>{e.preventDefault(); handler();}, {passive:false});
      btn.addEventListener("touchstart",  (e)=>{e.preventDefault(); handler();}, {passive:false});
      bar.appendChild(btn);
    }
    return btn;
  }
  function ensureScoreHud(){
    let hud = $("#scoreHud");
    if(!hud){
      hud = document.createElement("div");
      hud.id = "scoreHud";
      hud.className = "score-hud";
      hud.innerHTML = `
        <span>Round: <strong id="roundValue">1/${MAX_ROUNDS}</strong></span>
        <span>Round Score: <strong id="scoreValue">0</strong></span>
        <span>Total: <strong id="totalValue">0</strong></span>
        <span>Streak: <strong id="streakValue">0</strong></span>
      `;
      (peakRow?.parentElement || document.body).appendChild(hud);
    }
    updateRoundHud();
    return hud;
  }
  function ensureRoundHud(){
    let hud = $("#roundHud");
    if(!hud){
      hud = document.createElement("div");
      hud.id = "roundHud";
      hud.innerHTML = `
        <span id="roundIndicator">Round 1 / ${MAX_ROUNDS}</span>
        <span id="totalScore">Total: 0</span>
      `;
      document.body.appendChild(hud);
    }
    return hud;
  }
  function updateRoundHud(){
    ensureRoundHud();
    const ri = $("#roundIndicator");
    const ts = $("#totalScore");
    if(ri) ri.textContent = `Round ${currentRound} / ${MAX_ROUNDS}`;
    if(ts) ts.textContent = `Total: ${totalScore}`;
    const s  = $("#scoreValue");  if(s)  s.textContent  = String(roundScore);
    const st = $("#streakValue"); if(st) st.textContent = String(streak);
    const rd = $("#roundValue");  if(rd) rd.textContent = `${currentRound}/${MAX_ROUNDS}`;
    const tot= $("#totalValue");  if(tot) tot.textContent= String(totalScore);
  }

  function ensureTutorial(){
    let overlay = $("#tutorialOverlay");
    const content = `
      <li>Select open cards that sum to <strong>11</strong>.</li>
      <li>You may use the top <strong>waste</strong> card.</li>
      <li>Grey cards are covered.</li>
      <li>Streak increases score.</li>
      <li>Wrong &gt; 11 → penalty.</li>
      <li>Clear a peak → bonus.</li>
      <li>Each round: less time, higher multiplier.</li>
    `;
    if(!overlay){
      overlay = document.createElement("div");
      overlay.id = "tutorialOverlay";
      overlay.className = "tutorial-overlay hidden";
      overlay.innerHTML = `
        <div class="tutorial-card">
          <h2>How to play Eleven</h2>
          <ul>${content}</ul>
          <button id="tutorialClose" class="ui-button">Close</button>
        </div>
      `;
      document.body.appendChild(overlay);
      $("#tutorialClose", overlay).addEventListener("pointerdown",(e)=>{e.preventDefault();toggleTutorial();},{passive:false});
      overlay.addEventListener("pointerdown",(e)=>{ if(e.target===overlay){ e.preventDefault(); toggleTutorial(); }},{passive:false});
    }
    return overlay;
  }
  function toggleTutorial(){ ensureTutorial().classList.toggle("hidden"); }

  ensureBtn("tutorialBtn","Tutorial", toggleTutorial);
  ensureBtn("restartBtn","Restart",  restartGameFully);
  ensureScoreHud();
  ensureRoundHud();

  // ---------- Selections ----------
  function clearAllSelections(){
    document.querySelectorAll(".card.selected").forEach(el => el.classList.remove("selected"));
  }

  // ---------- Animation Helpers ----------
  function getCenter(el){
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2 };
  }

  /**
   * Animiert eine „Ghost“-Karte von fromEl → toEl.
   * callback wird nach Ende aufgerufen.
   */
  function animateCardFlight(valueText, fromEl, toEl, callback){
    if(!fromEl || !toEl){
      callback?.();
      return;
    }
    const from = getCenter(fromEl);
    const to   = getCenter(toEl);

    const ghost = document.createElement("div");
    ghost.className = "ghost-card";
    ghost.textContent = valueText;
    ghost.dataset.badge = valueText;
    ghost.style.left = (from.x - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w'))/2) + "px";
    ghost.style.top  = (from.y - parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-h'))/2) + "px";

    ghost.style.transform = `translate(0px, 0px)`;
    document.body.appendChild(ghost);

    const dx = to.x - from.x;
    const dy = to.y - from.y;

    requestAnimationFrame(() => {
      ghost.style.transform = `translate(${dx}px, ${dy}px)`;
    });

    const done = () => {
      ghost.remove();
      callback?.();
    };
    setTimeout(done, 280);
  }

  // ---------- FX (Step 2) ----------
  function addOnceClass(el, cls, ms=480){
    if(!el) return;
    el.classList.add(cls);
    window.setTimeout(()=> el.classList.remove(cls), ms);
  }
  function popupAt(x,y,text,type="pos"){
    const pop = document.createElement("div");
    pop.className = `points-pop ${type}`;
    pop.textContent = text;
    document.body.appendChild(pop);
    const r = pop.getBoundingClientRect();
    pop.style.left = `${Math.round(x - r.width/2)}px`;
    pop.style.top  = `${Math.round(y - r.height)}px`;
    pop.addEventListener("animationend", ()=> pop.remove(), {once:true});
  }
  function popupOnEl(el,text,type="pos"){
    const r = el.getBoundingClientRect();
    popupAt(r.left + r.width/2, r.top, text, type);
  }
  function sparkleBurst(x, y, count = 8) {
    const root = document.body;
    const rootRect = root.getBoundingClientRect?.() || {left:0,top:0};
    for (let i=0;i<count;i++){
      const s = document.createElement("div");
      s.className = "sparkle";
      s.style.left = `${x - rootRect.left}px`;
      s.style.top  = `${y - rootRect.top}px`;
      const ang = (Math.PI * 2) * (i / count);
      const dist = 30 + Math.random()*20;
      s.style.setProperty("--sx", `${Math.cos(ang)*dist}px`);
      s.style.setProperty("--sy", `${Math.sin(ang)*dist}px`);
      root.appendChild(s);
      setTimeout(()=> s.remove(), 700);
    }
  }

  // ---------- Stock / Waste ----------
  function pushWaste(value){
    const card = document.createElement("div");
    card.className = "waste-card card clickable deal-anim flip-anim";
    card.textContent = value;
    card.dataset.badge = value;
    card.style.zIndex = String(wasteStack.length);
    wasteEl.appendChild(card);
    card.addEventListener("animationend", ()=> card.classList.remove("deal-anim","flip-anim"), {once:true});
    wasteStack.push(card);
  }
  function topWasteValueOrNull(){
    if(wasteStack.length===0) return null;
    return valNum(wasteStack[wasteStack.length-1].textContent);
  }
  function updateStockCount(){
    const el = document.getElementById("stockCount");
    if(el) el.textContent = String(stock.length);
  }

  function refillOneRemovedSlotUsingPrevWaste(){
    const removed = Array.from(document.querySelectorAll(".card.field.removed"));
    if(removed.length===0 || wasteStack.length===0) return false;

    // group by row (style.top), fill the first in reading order
    const groups = {};
    removed.forEach(slot => {
      const top = slot.parentElement?.style?.top || "";
      (groups[top] ||= []).push(slot);
    });
    const sorted = Object.keys(groups).sort((a,b)=>(parseFloat(a)||0)-(parseFloat(b)||0));

    for(const top of sorted){
      for(const slot of groups[top]){
        const prev = wasteStack.pop();
        if(!prev) return false;

        // Animiert: Waste → Slot
        animateCardFlight(prev.textContent, prev, slot, () => {
          if(prev.parentElement===wasteEl) wasteEl.removeChild(prev);
          slot.classList.remove("removed","selected","covered","unselectable");
          slot.textContent = prev.textContent || getRandomCardValue();
          slot.dataset.badge = slot.textContent;
          slot.style.visibility = "visible";
          updateCoverageState();
        });

        return true;
      }
    }
    return false;
  }

  // Deck → Waste: animierte Ghost-Karte
  function drawFromStock_Auto(){
    if(stock.length===0) return false;
    const value = stock.pop();
    updateStockCount();

    // Ghost-Anim von Deck zum Waste-Container
    animateCardFlight(value, deckEl, wasteEl, () => {
      pushWaste(value);
    });

    return true;
  }

  function drawFromStock_Manual(){
    if(gameOver) return;

    // NEW: clear all selections when drawing a new stock card
    clearAllSelections();

    if(streak>0){ streak=0; updateRoundHud(); }
    const didRefill = refillOneRemovedSlotUsingPrevWaste();
    updateCoverageState();

    if(stock.length===0){ maybeTriggerLoss(); return; }
    const value = stock.pop();
    updateStockCount();

    // Animiert: Deck → Waste
    animateCardFlight(value, deckEl, wasteEl, () => {
      pushWaste(value);
      if(stock.length===0) maybeTriggerLoss();
    });
  }

  // ---------- Coverage / Board ----------
  function makeId(d,r,c){ return `card-d${d}-r${r}-c${c}`; }
  function childrenIndicesTripeaks(curLen,nextLen,c){
    if(nextLen===1) return [0];
    if(curLen===1) return nextLen>=2 ? [0,nextLen-1] : [0];
    if(nextLen===curLen+1) return [c, c+1];
    if(nextLen===curLen)   return [c];
    if(nextLen===curLen-1){
      if(c===0) return [0];
      if(c===curLen-1) return [nextLen-1];
      return [c-1,c];
    }
    const x = Math.round(c*(nextLen-1)/Math.max(1,(curLen-1)));
    return [Math.max(0,Math.min(nextLen-1,x))];
  }
  function createDiamond(dIdx){
    const peak = document.createElement("div");
    peak.className = "peak";
    const cardH=92, overlap=cardH*0.2;
    const matrix = [];
    rowsPerDiamond.forEach((n,row)=>{
      const rowEl = document.createElement("div");
      rowEl.className = "card-row";
      rowEl.style.top = `${row*(cardH-overlap)}px`;
      const rowCards=[];
      for(let i=0;i<n;i++){
        const card = document.createElement("div");
        card.className = "card field";
        const val = getRandomCardValue();
        card.textContent = val;
        card.dataset.badge = val;
        card.dataset.diamond= String(dIdx);
        card.dataset.row    = String(row);
        card.dataset.col    = String(i);
        card.id = makeId(dIdx,row,i);
        rowEl.appendChild(card);
        rowCards.push(card);
      }
      peak.appendChild(rowEl);
      matrix.push(rowCards);
    });
    for(let r=0;r<matrix.length-1;r++){
      const cur=matrix[r], nxt=matrix[r+1];
      for(let c=0;c<cur.length;c++){
        const idxs = childrenIndicesTripeaks(cur.length,nxt.length,c);
        const childIds = idxs.map(k=>nxt[k]?.id).filter(Boolean);
        if(childIds.length) cur[c].dataset.children = childIds.join(",");
      }
    }
    return peak;
  }
  function buildBoard(){
    if(!peakRow) return;
    peakRow.innerHTML = "";
    for(let d=0; d<NUM_DIAMONDS; d++) peakRow.appendChild(createDiamond(d));
    updateCoverageState();
  }

  function isCovered(cardEl){
    if(!cardEl || cardEl.classList.contains("removed")) return false;
    const children = (cardEl.dataset.children||"").split(",").map(s=>s.trim()).filter(Boolean);
    if(children.length===0) return false;
    for(const id of children){
      const child = document.getElementById(id);
      if(child && child.isConnected && child.classList.contains("field") && !child.classList.contains("removed")){
        return true;
      }
    }
    return false;
  }
  function updateCoverageState(){
    document.querySelectorAll(".card.field").forEach(card=>{
      const cov = isCovered(card);
      card.classList.toggle("covered", cov);
      const clickable = !cov && !card.classList.contains("removed");
      card.classList.toggle("clickable", clickable);
      card.classList.toggle("unselectable", !clickable);
    });
    if(stock.length===0) maybeTriggerLoss();
  }

  // ---------- Input ----------
  function handleCardActivation(target){
    if(!target || gameOver) return;
    const card = target.closest?.(".card");
    if(!card) return;

    if(card.classList.contains("field")){
      if(card.classList.contains("removed")) return;
      if(card.classList.contains("covered")){ shake(card); addOnceClass(card,"glow-red"); return; }
      card.classList.toggle("selected");
      checkSelected();
    } else if(card.classList.contains("waste-card")){
      card.classList.toggle("selected");
      checkSelected();
    }
  }
  const onPointer = (e)=>{ e.preventDefault(); handleCardActivation(e.target); };
  const onTouch   = (e)=>{
    e.preventDefault();
    const t = e.changedTouches?.[0];
    const target = document.elementFromPoint(t?t.clientX:0, t?t.clientY:0) || e.target;
    handleCardActivation(target);
  };
  if(supportsPointer) document.addEventListener("pointerdown", onPointer, {passive:false, capture:true});
  else                document.addEventListener("touchstart",  onTouch,   {passive:false, capture:true});

  // Deck click
  function onDeckClick(e){ e.preventDefault(); drawFromStock_Manual(); }
  if(deckEl){
    if(supportsPointer) deckEl.addEventListener("pointerdown", onDeckClick, {passive:false});
    else                deckEl.addEventListener("touchstart",  onDeckClick, {passive:false});
  }

  // ---------- Anim/Feedback ----------
  function shake(el){
    if(el.classList.contains("shake")) return;
    el.classList.add("shake");
    el.addEventListener("animationend", ()=> el.classList.remove("shake"), {once:true});
  }

  // ---------- Scoring & Combos ----------
  function addScore(delta,{penalty=false}={}){
    let eff = delta;
    if(!penalty && delta>0) eff = Math.round(delta * getRoundMultiplier(currentRound));
    roundScore = Math.max(0, roundScore + eff);
    updateRoundHud();
  }

  function checkSelected(){
    const selected = Array.from(document.querySelectorAll(".card.selected"));
    if(selected.length===0) return;

    const total = selected.map(el=>valNum(el.textContent)).reduce((a,b)=>a+b,0);

    if(total>11){
      // Fehlversuch → rot + shake + Malus
      selected.forEach(el => { addOnceClass(el,"glow-red"); shake(el); });
      const c = getCenter(selected[0]);
      popupAt(c.x, c.y-10, `${WRONG_COMBO_PENALTY}`, "neg");
      selected.forEach(el=>el.classList.remove("selected"));
      addScore(WRONG_COMBO_PENALTY,{penalty:true});
      return;
    }
    if(total!==11) return;

    const usedWaste = selected.some(el=>el.classList.contains("waste-card"));
    const fieldCards= selected.filter(el=>el.classList.contains("field"));

    const base=10, perField=2*fieldCards.length, streakBonus=2*streak;
    const movePoints = base + perField + streakBonus;

    // Visuelles Feedback: valid → grün + shrink-out + Popups
    selected.forEach(el => addOnceClass(el, "glow-green"));
    fieldCards.forEach(el => popupOnEl(el, "+2", "pos"));

    const cc = getCenter(selected[0]);
    popupAt(cc.x, cc.y-28, `+${Math.round(movePoints * getRoundMultiplier(currentRound))}`, "pos");
    if(streakBonus>0) popupAt(cc.x, cc.y-46, `+${Math.round(streakBonus * getRoundMultiplier(currentRound))} streak`, "pos");

    // remove selected cards mit Shrink+Fade
    selected.forEach(card=>{
      card.classList.remove("selected");
      if(card.classList.contains("field")){
        card.classList.remove("clickable","unselectable");
        addOnceClass(card, "shrink-out", 200);
        setTimeout(() => {
          card.classList.add("removed");
          card.style.visibility="hidden";
          updateCoverageState();
        }, 180);
      } else if(card.classList.contains("waste-card")){
        const i = wasteStack.indexOf(card);
        if(i>=0) wasteStack.splice(i,1);
        if(card.parentElement===wasteEl) wasteEl.removeChild(card);
      }
    });

    addScore(movePoints);
    streak += 1; updateRoundHud();

    checkAndPeakBonus();
    updateCoverageState();

    if(allFieldCleared()){ handleRoundWin(); return; }

    if(usedWaste){
      if(!drawFromStock_Auto()){
        endNowIfNoWasteAndNoStock(); // Stock leer & Waste gerade verbraucht
      }
    }
    if(stock.length===0) maybeTriggerLoss();
  }

  function checkAndPeakBonus(){
    for(let d=0; d<NUM_DIAMONDS; d++){
      if(clearedPeaks.has(d)) continue;
      const remain = document.querySelectorAll(`.card.field[data-diamond="${d}"]:not(.removed)`);
      if(remain.length===0){
        clearedPeaks.add(d);
        const area = peakRow?.getBoundingClientRect?.();
        const cx = area ? (area.left+area.width/2) : (window.innerWidth/2);
        const cy = area ? (area.top) : 80;
        // Sparkles + Bonus (gold)
        sparkleBurst(cx, cy, 14);
        popupAt(cx, cy-12, `Peak +${Math.round(PEAK_CLEAR_BONUS * getRoundMultiplier(currentRound))}`, "bonus");
        addScore(PEAK_CLEAR_BONUS);
      }
    }
  }

  // ---------- Win/Lose ----------
  function allFieldCleared(){
    return document.querySelectorAll(".card.field:not(.removed)").length===0;
  }

  function handleRoundWin(){
    pauseTimer();
    const secsLeft = Math.ceil(timeRemaining/1000);
    const timeBonus = Math.max(0, secsLeft*5);
    const stockBonus= Math.max(0, stock.length*10);

    const area = peakRow?.getBoundingClientRect?.();
    const cx = area ? (area.left+area.width/2) : (window.innerWidth/2);
    const cy = area ? (area.top+40) : 120;

    if(timeBonus>0) popupAt(cx-40,cy, `Time +${Math.round(timeBonus*getRoundMultiplier(currentRound))}`, "bonus");
    if(stockBonus>0) popupAt(cx+40,cy, `Stock +${Math.round(stockBonus*getRoundMultiplier(currentRound))}`, "bonus");
    popupAt(cx,cy-20, `Win +${Math.round(WIN_BONUS*getRoundMultiplier(currentRound))}`, "bonus");

    addScore(timeBonus);
    addScore(stockBonus);
    addScore(WIN_BONUS);

    endRound("win");
  }

  function existsAnyElevenCombo(){
    const vals = Array.from(document.querySelectorAll(".card.field"))
      .filter(el=>!el.classList.contains("removed") && !el.classList.contains("covered"))
      .map(el=>valNum(el.textContent));
    for(let i=0;i<vals.length;i++) for(let j=i+1;j<vals.length;j++) if(vals[i]+vals[j]===11) return true;
    const w = topWasteValueOrNull();
    if(w!=null) for(const v of vals) if(v+w===11) return true;
    return false;
  }

  function endNowIfNoWasteAndNoStock(){
    if(stock.length===0 && wasteStack.length===0){
      if(allFieldCleared()) handleRoundWin();
      else endRound("lose");
    }
  }

  function maybeTriggerLoss(){
    if(gameOver) return;
    if(stock.length===0 && wasteStack.length===0){
      if(allFieldCleared()) handleRoundWin();
      else endRound("lose");
      return;
    }
    if(stock.length===0 && !existsAnyElevenCombo()){
      endRound("lose");
    }
  }

  // ---------- Round orchestration (AUTO overlay) ----------
  function showRoundSummaryAuto(status, snap){
    // BUGFIX: Kein Overlay zu Match-Beginn (nur ab Übergang 1→2)
    if(!hasShownAnyRoundSummary && currentRound === 1){
      hasShownAnyRoundSummary = true;
      advanceToNextRound();
      return;
    }

    // Timer ist in endRound() pausiert; bleibt pausiert bis Overlay zu
    const ov = document.createElement("div");
    ov.className = "overlay";
    const title = status === "win" ? "Round Cleared!" : (status === "time's up" || status === "timeup" ? "Time's up!" : "Round Over");
    ov.innerHTML = `
      <div class="overlay-content">
        <h2>${title} (Round ${currentRound}/${MAX_ROUNDS})</h2>
        <p>Round Score: <strong>${roundScore}</strong></p>
        <p>Total Score: <strong>${totalScore}</strong></p>
        <p>Time used: <strong>${Math.round(snap.timeMs/1000)}s</strong></p>
        <p>Stock left: <strong>${snap.stockLeft}</strong></p>
        <p style="opacity:.75;margin-top:10px;">Next round starts automatically…</p>
      </div>
    `;
    document.body.appendChild(ov);

    if(overlayTimer) { clearTimeout(overlayTimer); overlayTimer = null; }
    overlayTimer = setTimeout(() => {
      ov.remove();
      advanceToNextRound();
    }, 4000);
  }

  function showFinalOverlay(){
    const fv = document.createElement("div");
    fv.className = "overlay";
    const rows = roundHistory.map(r =>
      `<tr><td>${r.round}</td><td>${r.status}</td><td>${r.score}</td><td>${Math.round(r.timeMs/1000)}s</td><td>${r.stockLeft}</td></tr>`
    ).join("");
    fv.innerHTML = `
      <div class="overlay-content" style="max-width:680px;">
        <h2>Game Over — Final Results</h2>
        <p id="finalScore">Total Score: ${totalScore}</p>
        <table class="final-table">
          <thead><tr><th>Round</th><th>Status</th><th>Score</th><th>Time</th><th>Stock Left</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <button id="restartSeriesBtn" class="ui-button" style="margin-top:16px;">Play Again</button>
      </div>
    `;
    document.body.appendChild(fv);
    $("#restartSeriesBtn", fv).addEventListener("pointerdown",(e)=>{e.preventDefault(); fv.remove(); restartGameFully(); },{passive:false});
    $("#restartSeriesBtn", fv).addEventListener("touchstart", (e)=>{e.preventDefault(); fv.remove(); restartGameFully(); },{passive:false});
  }

  function endRound(status){
    if(roundEnding) return; // guard
    roundEnding = true;

    pauseTimer(); // <<< Timer pausiert während Popup
    clearAllSelections(); // make sure nothing stays selected

    const snap = {
      round: currentRound,
      status,
      score: roundScore,
      timeMs: getRoundTimeLimitMs(currentRound) - timeRemaining,
      stockLeft: stock.length
    };
    roundHistory.push(snap);
    totalScore += roundScore;
    updateRoundHud();

    if(currentRound < MAX_ROUNDS){
      showRoundSummaryAuto(status, snap); // 4s auto → next round (Timer bleibt pausiert)
    } else {
      gameOver = true;
      setTimeout(() => { showFinalOverlay(); roundEnding = false; }, 200);
    }
  }

  function advanceToNextRound(){
    if(roundTransitionInProgress) return;
    roundTransitionInProgress = true;

    currentRound += 1;
    dealNewRound();

    // reset guards nach Rundendeal
    roundEnding = false;
    roundTransitionInProgress = false;
  }

  function dealNewRound(){
    streak = 0;
    roundScore = 0;
    clearedPeaks.clear();

    if(overlayTimer){ clearTimeout(overlayTimer); overlayTimer = null; }

    // Board & Waste reset
    wasteStack.splice(0, wasteStack.length);
    while(wasteEl.firstChild) wasteEl.removeChild(wasteEl.firstChild);
    buildBoard();

    // Stock fresh & initial waste from stock (animiert)
    stock = generateBiasedStock(24);
    updateStockCount();
    if(stock.length>0){
      const v = stock.pop();
      updateStockCount();
      // Anim: Deck → Waste beim Rundendeal
      animateCardFlight(v, deckEl, wasteEl, () => pushWaste(v));
    }

    resetTimerForRound();
    startTimer(); // <<< Timer startet erst NACH dem Popup
    updateRoundHud();
  }

  function restartGameFully(){
    gameOver = false;
    pauseTimer();
    if(overlayTimer){ clearTimeout(overlayTimer); overlayTimer = null; }
    roundEnding = false;
    roundTransitionInProgress = false;
    hasShownAnyRoundSummary = false;

    document.querySelectorAll(".overlay").forEach(el => el.remove());

    currentRound = 1;
    totalScore = 0;
    roundScore = 0;
    streak = 0;
    clearedPeaks.clear();
    roundHistory.length = 0;

    // Reset board & waste
    wasteStack.splice(0, wasteStack.length);
    while(wasteEl.firstChild) wasteEl.removeChild(wasteEl.firstChild);
    buildBoard();

    stock = generateBiasedStock(24);
    updateStockCount();
    if(stock.length>0){
      const v = stock.pop();
      updateStockCount();
      animateCardFlight(v, deckEl, wasteEl, () => pushWaste(v));
    }

    resetTimerForRound();
    startTimer();
    updateRoundHud();
  }

  // ---------- Timebar ----------
  function ensureTimebar(){
    let bar = $("#timebar");
    if(!bar){
      bar = document.createElement("div");
      bar.id = "timebar";
      bar.innerHTML = `<div class="fill"></div>`;
      document.body.appendChild(bar);
    } else {
      const old = $(".label", bar); if(old) old.remove();
    }
    return bar;
  }
  const timebar = ensureTimebar();
  function startTimer(){
    clearInterval(timer);
    timeStart = performance.now();
    timer = setInterval(()=>{
      const elapsed = performance.now() - timeStart;
      timeRemaining = Math.max(0, getRoundTimeLimitMs(currentRound) - elapsed);
      updateTimebar(timeRemaining);
      if(timeRemaining<=0){
        clearInterval(timer);
        endRound("timeup");
      }
    }, 120);
  }
  function pauseTimer(){ clearInterval(timer); }
  function resetTimerForRound(){
    clearInterval(timer);
    timeRemaining = getRoundTimeLimitMs(currentRound);
    updateTimebar(timeRemaining);
  }
  function colorForPct(p){ if(p>0.66) return "#41c77d"; if(p>0.33) return "#e6c14a"; return "#e85b5b"; }
  function updateTimebar(ms){
    const fill = $(".fill", timebar);
    const pct = ms / getRoundTimeLimitMs(currentRound);
    if(fill){
      fill.style.width = Math.max(0, Math.min(100, pct*100)) + "%";
      fill.style.backgroundColor = colorForPct(pct);
      // Pulsieren in den letzten 15%
      if(pct < 0.15) fill.classList.add("pulse"); else fill.classList.remove("pulse");
    }
  }

  // ---------- Game init ----------
  buildBoard();
  stock = generateBiasedStock(24);
  updateStockCount();
  if(stock.length>0){
    const v = stock.pop();
    updateStockCount();
    // Startdeal animiert
    animateCardFlight(v, deckEl, wasteEl, () => pushWaste(v));
  }
  resetTimerForRound();
  startTimer(); // läuft beim Start (kein Round-Popup am Anfang)
  updateRoundHud();

  window.addEventListener("resize", updateCoverageState, {passive:true});

  // ---------- Generator ----------
  function generateBiasedStock(size){
    const fieldVals = Array.from(document.querySelectorAll(".card.field")).map(el=>valNum(el.textContent));
    const pool=[], freq={};
    fieldVals.forEach(v=> freq[v]=(freq[v]||0)+1 );
    Object.keys(freq).forEach(k=>{
      const v=parseInt(k,10), comp=compFor(v);
      const w = Math.max(1, Math.min(6, freq[v]+2));
      for(let i=0;i<w;i++) pool.push(comp);
    });
    const res=[];
    for(let i=0;i<size;i++){
      let pick = (pool.length>0 && Math.random()<0.7)
        ? pool[Math.floor(Math.random()*pool.length)]
        : Math.floor(Math.random()*10)+1;
      res.push(pick===1 ? "A" : String(pick));
    }
    return res;
  }
});
