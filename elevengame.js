window.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM ----------
  const peakRow   = document.getElementById("peakRow");
  const deckEl    = document.getElementById("deck");
  const wasteEl   = document.getElementById("waste");

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

  // ---------- Top Bar & HUD ----------
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

  // Tutorial (optional)
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

  // ---------- Stock / Waste ----------
  function pushWaste(value){
    const card = document.createElement("div");
    card.className = "waste-card card clickable deal-anim flip-anim";
    card.textContent = value;
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
        if(prev?.parentElement===wasteEl) wasteEl.removeChild(prev);
        slot.classList.remove("removed","selected","covered","unselectable");
        slot.textContent = prev?.textContent || getRandomCardValue();
        slot.style.visibility = "visible";
        updateCoverageState();
        return true;
      }
    }
    return false;
  }

  function drawFromStock_Auto(){
    if(stock.length===0) return false;
    const v = stock.pop();
    updateStockCount();
    pushWaste(v);
    return true;
  }
  function drawFromStock_Manual(){
    if(gameOver) return;
    // NEW: clear all selections when drawing a new stock card
    clearAllSelections();

    if(streak>0){ streak=0; updateRoundHud(); }
    refillOneRemovedSlotUsingPrevWaste();
    updateCoverageState();
    if(stock.length===0){ maybeTriggerLoss(); return; }
    const v = stock.pop();
    updateStockCount();
    pushWaste(v);
    if(stock.length===0) maybeTriggerLoss();
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
    const cardH=90, overlap=cardH*0.2;
    const matrix = [];
    rowsPerDiamond.forEach((n,row)=>{
      const rowEl = document.createElement("div");
      rowEl.className = "card-row";
      rowEl.style.top = `${row*(cardH-overlap)}px`;
      const rowCards=[];
      for(let i=0;i<n;i++){
        const card = document.createElement("div");
        card.className = "card field";
        card.textContent = getRandomCardValue();
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
      if(card.classList.contains("covered")){ shake(card); return; }
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
  const activePopups = [];
  function popupAt(x,y,text,type="pos"){
    const pop = document.createElement("div");
    pop.className = `points-pop ${type}`;
    pop.textContent = text;
    document.body.appendChild(pop);
    const r = pop.getBoundingClientRect();
    pop.style.left = `${Math.round(x - r.width/2)}px`;
    pop.style.top  = `${Math.round(y - r.height)}px`;
    requestAnimationFrame(()=>avoidOverlap(pop));
    activePopups.push(pop);
    pop.addEventListener("animationend", ()=>{ pop.remove(); const i=activePopups.indexOf(pop); if(i>=0) activePopups.splice(i,1); }, {once:true});
  }
  function avoidOverlap(el){
    const MAX=90, STEP=18;
    let n=0;
    while(n<=MAX && activePopups.some(other=> other!==el && isOver(el,other))){
      n+=STEP;
      el.style.top = (parseFloat(el.style.top||"0") - STEP) + "px";
    }
  }
  function isOver(a,b){
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    return !(ra.left>rb.right || ra.right<rb.left || ra.top>rb.bottom || ra.bottom<rb.top);
  }
  function popupOnEl(el,text,type="pos"){
    const r = el.getBoundingClientRect();
    popupAt(r.left+r.width/2, r.top, text, type);
  }
  function centerOf(els){
    if(!els || !els.length) return {x:window.innerWidth/2, y:80};
    let L=Infinity,T=Infinity,R=-Infinity,B=-Infinity;
    els.forEach(el=>{const r=el.getBoundingClientRect(); L=Math.min(L,r.left); T=Math.min(T,r.top); R=Math.max(R,r.right); B=Math.max(B,r.bottom);});
    return {x:(L+R)/2, y:T-6};
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
      const c=centerOf(selected);
      popupAt(c.x,c.y, `${WRONG_COMBO_PENALTY}`, "neg");
      selected.forEach(el=>el.classList.remove("selected"));
      addScore(WRONG_COMBO_PENALTY,{penalty:true});
      return;
    }
    if(total!==11) return;

    const usedWaste = selected.some(el=>el.classList.contains("waste-card"));
    const fieldCards= selected.filter(el=>el.classList.contains("field"));

    const base=10, perField=2*fieldCards.length, streakBonus=2*streak;
    const movePoints = base + perField + streakBonus;

    fieldCards.forEach(el=> popupOnEl(el, "+2", "pos"));
    const c=centerOf(selected);
    popupAt(c.x,c.y, `+${Math.round(movePoints * getRoundMultiplier(currentRound))}`, "pos");
    if(streakBonus>0) popupAt(c.x,c.y-22, `+${Math.round(streakBonus * getRoundMultiplier(currentRound))} streak`, "pos");

    // remove selected cards
    selected.forEach(card=>{
      card.classList.remove("selected");
      if(card.classList.contains("field")){
        card.classList.remove("clickable","unselectable");
        card.classList.add("removed");
        card.style.visibility="hidden";
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
        popupAt(cx, cy, `Peak +${Math.round(PEAK_CLEAR_BONUS * getRoundMultiplier(currentRound))}`, "pos");
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

    if(timeBonus>0) popupAt(cx-40,cy, `Time +${Math.round(timeBonus*getRoundMultiplier(currentRound))}`, "pos");
    if(stockBonus>0) popupAt(cx+40,cy, `Stock +${Math.round(stockBonus*getRoundMultiplier(currentRound))}`, "pos");
    popupAt(cx,cy-20, `Win +${Math.round(WIN_BONUS*getRoundMultiplier(currentRound))}`, "pos");

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
    // Create ephemeral overlay just-in-time; auto-close after 4s
    const ov = document.createElement("div");
    ov.className = "overlay";
    const title = status === "win" ? "Round Cleared!" : (status === "timeup" ? "Time's up!" : "Round Over");
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

    // Kill any previous timer, then auto-advance in 4s
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

    pauseTimer();
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
      showRoundSummaryAuto(status, snap); // 4s auto → next round
    } else {
      gameOver = true;
      // Slight delay to make last popups visible
      setTimeout(() => { showFinalOverlay(); roundEnding = false; }, 200);
    }
  }

  function advanceToNextRound(){
    if(roundTransitionInProgress) return;
    roundTransitionInProgress = true;

    currentRound += 1;
    dealNewRound();

    // reset guards after round is fully dealt
    roundEnding = false;
    roundTransitionInProgress = false;
  }

  function dealNewRound(){
    streak = 0;
    roundScore = 0;
    clearedPeaks.clear();

    // cleanup overlays timers
    if(overlayTimer){ clearTimeout(overlayTimer); overlayTimer = null; }

    // Board & Waste reset
    wasteStack.splice(0, wasteStack.length);
    while(wasteEl.firstChild) wasteEl.removeChild(wasteEl.firstChild);
    buildBoard();

    // Stock fresh & initial waste from stock
    stock = generateBiasedStock(24);
    updateStockCount();
    if(stock.length>0){ const v = stock.pop(); updateStockCount(); pushWaste(v); }

    resetTimerForRound();
    startTimer();
    updateRoundHud();
  }

  function restartGameFully(){
    gameOver = false;
    // kill timers/guards/overlays
    pauseTimer();
    if(overlayTimer){ clearTimeout(overlayTimer); overlayTimer = null; }
    roundEnding = false;
    roundTransitionInProgress = false;

    // remove any lingering overlays
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
    if(stock.length>0){ const v = stock.pop(); updateStockCount(); pushWaste(v); }

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
      fill.style.background = colorForPct(pct);
    }
  }

  // ---------- Coverage helpers ----------
  function shake(el){
    if(el.classList.contains("shake")) return;
    el.classList.add("shake");
    el.addEventListener("animationend", ()=> el.classList.remove("shake"), {once:true});
  }

  // ---------- Game init ----------
  buildBoard();
  stock = generateBiasedStock(24);
  updateStockCount();
  if(stock.length>0){ const v = stock.pop(); updateStockCount(); pushWaste(v); }
  resetTimerForRound();
  startTimer();
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
