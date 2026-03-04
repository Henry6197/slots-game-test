
document.addEventListener('DOMContentLoaded', ()=>{
  // Clean slot logic: 5x3 grid, evaluate contiguous row runs and full-column matches.
  const symbols = ['🍒','🍋','7️⃣','🍇','🏦','🍉'];
  const spinBtn = document.getElementById('spin');
  const maxBtn = document.getElementById('max');
  const reels = Array.from(document.querySelectorAll('.reel'));
  const log = document.getElementById('slot-log');
  const betInput = document.getElementById('bet');

  function rand(n){ return Math.floor(Math.random()*n); }
  function appendLog(s){ if(!log) return; const p=document.createElement('div'); p.textContent=s; log.prepend(p); }

  function showLossUI(){ vc.setBuddyText(window.TODD_DIALOGUE?.slots?.loss || "Don't be down — double down next time!"); vc.showBigMessage('YOU LOST', 1000); }
  function showWinUI(amount){ vc.setBuddyText(window.TODD_DIALOGUE?.slots?.win || "Hell yes! Keep it up!"); vc.confetti(40); vc.showBigMessage(`You won $${amount}!!`, 1400); }

  function rowIndices(row){ const base = row*5; return [base, base+1, base+2, base+3, base+4]; }
  function colIndices(col){ return [col, col+5, col+10]; }

  function evaluatePatterns(result){
    // Only the middle row (row 1, indices 5-9) counts for wins.
    const used = new Set();
    const results = [];
    const idxs = rowIndices(1); // middle row

    // 1) full row (5 in a row)
    const s0 = result[idxs[0]];
    if(s0 && idxs.every(i=> result[i]===s0)){
      idxs.forEach(i=> used.add(i));
      results.push({type:'row', indices: idxs.slice(), symbol: s0});
      return results;
    }

    // 2) 4-in-row contiguous
    for(let start=0; start<=1; start++){
      const seg = idxs.slice(start,start+4);
      const s = result[seg[0]];
      if(s && seg.every(i=> result[i]===s) && !seg.some(i=> used.has(i))){
        seg.forEach(i=> used.add(i));
        results.push({type:'row', indices: seg.slice(), symbol: s});
      }
    }

    // 3) 3-in-row contiguous
    for(let start=0; start<=2; start++){
      const seg = idxs.slice(start,start+3);
      const s = result[seg[0]];
      if(s && seg.every(i=> result[i]===s) && !seg.some(i=> used.has(i))){
        seg.forEach(i=> used.add(i));
        results.push({type:'row', indices: seg.slice(), symbol: s});
      }
    }

    return results;
  }

  function computePayout(bet, patterns){
    let total = 0;
    // deterministic multipliers
    patterns.forEach(p=>{
      let basePayout = 0;
      const len = p.indices.length;
      if(len === 3) basePayout = bet * 3;    // 3x for a 3-run
      else if(len === 4) basePayout = bet * 6; // 6x for 4-run
      else if(len >= 5) basePayout = bet * 12; // 12x for full row
      
      // Symbol bonuses: 🏦 adds x1, 7️⃣ adds x2
      if(p.symbol === '🏦'){
        basePayout += bet * 1; // extra x1 for bank
      } else if(p.symbol === '7️⃣'){
        basePayout += bet * 2; // extra x2 for seven
      }
      
      total += basePayout;
    });
    return total;
  }

  // prevent re-entrant spins
  let spinning = false;

  function spin(bet){
    if(spinning){ appendLog('Spin already in progress.'); return; }
    spinning = true;
    if(spinBtn) spinBtn.disabled = true;
    if(maxBtn) maxBtn.disabled = true;
    let balance = vc.readBalance();
    if(bet <= 0){ appendLog('Invalid bet.'); spinning = false; if(spinBtn) spinBtn.disabled = false; if(maxBtn) maxBtn.disabled = false; return; }
    if(bet > balance){ appendLog('Insufficient funds for that bet.'); vc.setBuddyText(window.TODD_DIALOGUE?.slots?.insufficientFunds || 'Not enough funds — try a smaller bet or take a loan.'); spinning = false; if(spinBtn) spinBtn.disabled = false; if(maxBtn) maxBtn.disabled = false; return; }
    balance -= bet; vc.writeBalance(balance);
    
    // Add to jackpot (2% of bet)
    const jackpotContribution = vc.addToJackpot(bet);

    try{ if(window.vc && typeof window.vc.incrementSlotSpins === 'function') window.vc.incrementSlotSpins(1); }catch(e){}
    
    // Generate random result with natural chance for patterns
    const result = new Array(reels.length).fill(null).map(()=> symbols[rand(symbols.length)]);

    // 10% chance to boost the middle row with a forced pattern (~98% RTP)
    if(Math.random() < 0.10){
      const s = symbols[rand(symbols.length)];
      const r2 = Math.random();
      let runLen;
      if(r2 < 0.05) runLen = 5;       // 5% → 5-in-row
      else if(r2 < 0.25) runLen = 4;  // 20% → 4-in-row
      else runLen = 3;                 // 75% → 3-in-row

      const idxs = rowIndices(1); // always middle row
      const maxStart = 5 - runLen;
      const startInRow = Math.floor(Math.random()*(maxStart+1));
      for(let k=0;k<runLen;k++){ result[idxs[startInRow+k]] = s; }
    }

    // JACKPOT CHANCE: Very rare chance for 5 in a row on middle row
    if(Math.random() < 0.001) {
      const idxs = rowIndices(1); // always middle row
      const jackpotSymbol = symbols[rand(symbols.length)];
      idxs.forEach(i => result[i] = jackpotSymbol);
    }

    // Create scrolling animation for each reel
    reels.forEach((r,i)=>{
      const stopDelay = 400 + (i%5)*200 + Math.floor(i/5)*100; // stagger stops by column then row
      const spinDuration = 2000; // how long before starting to stop
      
      // Create wrapper for scrolling effect
      r.innerHTML = '';
      r.style.overflow = 'hidden';
      r.style.position = 'relative';
      
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'reel-scroll';
      scrollContainer.style.position = 'absolute';
      scrollContainer.style.top = '0';
      scrollContainer.style.left = '0';
      scrollContainer.style.width = '100%';
      scrollContainer.style.display = 'flex';
      scrollContainer.style.flexDirection = 'column';
      scrollContainer.style.alignItems = 'center';
      
      // Create many symbols to scroll through (20 random + final result)
      const scrollSymbols = [];
      for(let j=0; j<20; j++){
        scrollSymbols.push(symbols[rand(symbols.length)]);
      }
      scrollSymbols.push(result[i]); // final symbol at the end
      
      scrollSymbols.forEach(sym => {
        const symEl = document.createElement('div');
        symEl.className = 'reel-symbol';
        symEl.textContent = sym;
        symEl.style.height = r.offsetHeight + 'px';
        symEl.style.display = 'flex';
        symEl.style.alignItems = 'center';
        symEl.style.justifyContent = 'center';
        symEl.style.fontSize = '28px';
        scrollContainer.appendChild(symEl);
      });
      
      r.appendChild(scrollContainer);
      
      // Animate the scroll
      const symbolHeight = r.offsetHeight;
      const totalScroll = scrollSymbols.length * symbolHeight;
      const finalPosition = -(scrollSymbols.length - 1) * symbolHeight;
      
      // Start spinning animation
      let currentPos = 0;
      const spinSpeed = 30; // pixels per frame
      const frameTime = 16; // ~60fps
      
      const spinInterval = setInterval(() => {
        currentPos -= spinSpeed;
        if(currentPos <= -totalScroll) {
          currentPos = 0; // loop back to start
        }
        scrollContainer.style.transform = `translateY(${currentPos}px)`;
      }, frameTime);
      
      // Stop at the right time with easing
      setTimeout(() => {
        clearInterval(spinInterval);
        
        // Calculate position to show final symbol (centered)
        const finalPos = finalPosition;
        
        // Smooth deceleration to final position
        const startPos = currentPos;
        const distance = finalPos - startPos;
        const duration = 500; // deceleration time
        const startTime = Date.now();
        
        const decelerate = () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1);
          // Ease-out cubic for smooth stop
          const easeProgress = 1 - Math.pow(1 - progress, 3);
          const newPos = startPos + (distance * easeProgress);
          scrollContainer.style.transform = `translateY(${newPos}px)`;
          
          if(progress < 1) {
            requestAnimationFrame(decelerate);
          }
        };
        
        requestAnimationFrame(decelerate);
      }, stopDelay);
    });

    setTimeout(()=>{
      try{
        const patterns = evaluatePatterns(result);
        let payout = computePayout(bet, patterns);
        
        // Check for JACKPOT WIN: Any 5 in a row
        const jackpotWin = patterns.some(p => 
          p.indices.length === 5 && p.type === 'row'
        );
        
        if(jackpotWin) {
          const jackpotAmount = vc.winJackpot();
          const totalWin = bet + payout + jackpotAmount; // bet back + regular winnings + jackpot
          balance += totalWin;
          vc.writeBalance(balance);
          
          appendLog(`🎉 JACKPOT WINNER! 🎉 Total win: $${totalWin} (Bet back: $${bet} + Pattern wins: $${payout} + Jackpot: $${jackpotAmount})`);
          vc.confetti(100);
          vc.showBigMessage(`JACKPOT! $${totalWin.toLocaleString()}!`, 3000);
          vc.setBuddyText('HOLY MOLY! YOU HIT THE JACKPOT! YOU\'RE RICH!');
        } else if(payout > 0){
          const totalWin = bet + payout; // bet back + winnings
          balance += totalWin; 
          vc.writeBalance(balance);
          
          // Build detailed pattern description
          let patternDesc = patterns.map(p=> {
            const symbol = p.symbol;
            if(p.type === 'col') return `${symbol}${symbol}${symbol} column`;
            else if(p.indices.length === 5) return `${symbol}${symbol}${symbol}${symbol}${symbol} full row`;
            else if(p.indices.length === 4) return `${symbol}${symbol}${symbol}${symbol} 4-in-row`;
            else return `${symbol}${symbol}${symbol} 3-in-row`;
          }).join(', ');
          
          appendLog(`You won $${totalWin}! (Bet back: $${bet} + Pattern wins: $${payout}) - ${patternDesc}`);
          showWinUI(totalWin);
        }
        else { 
          appendLog(`No winning patterns — ${result.join(' ')}`); 
          showLossUI(); 
        }
      }catch(err){
        appendLog('Spin error: ' + (err && err.message ? err.message : String(err)));
        console.error(err);
      }finally{
        // re-enable controls shortly after overlay/animations
        setTimeout(()=>{
          spinning = false;
          if(spinBtn) spinBtn.disabled = false;
          if(maxBtn) maxBtn.disabled = false;
        }, 400);
      }
    }, 2800); // Wait for all reels to finish spinning (max stopDelay 400+4*200+2*100=1600 + deceleration 500 + buffer)
  }

  // Auto Spin
  const autoSpinBtn = document.getElementById('auto-spin');
  let autoSpinInterval = null;
  const AUTO_SPIN_DELAY = 3400; // slightly longer than spin duration (2800 + buffer)

  function stopAutoSpin(){
    if(autoSpinInterval){
      clearInterval(autoSpinInterval);
      autoSpinInterval = null;
    }
    if(autoSpinBtn){
      autoSpinBtn.textContent = '🔄 AUTO SPIN';
      autoSpinBtn.classList.remove('active');
    }
  }

  function startAutoSpin(){
    const bet = Number(betInput.value || 10);
    if(bet <= 0){ appendLog('Set a valid bet for auto spin.'); return; }
    if(bet > vc.readBalance()){ appendLog('Insufficient funds for auto spin.'); return; }

    if(autoSpinBtn){
      autoSpinBtn.textContent = '⏹ STOP AUTO';
      autoSpinBtn.classList.add('active');
    }

    // Kick off the first spin immediately
    spin(bet);

    autoSpinInterval = setInterval(()=>{
      const currentBet = Number(betInput.value || 10);
      if(currentBet > vc.readBalance() || currentBet <= 0){
        appendLog('Auto spin stopped — insufficient funds or invalid bet.');
        stopAutoSpin();
        return;
      }
      if(!spinning) spin(currentBet);
    }, AUTO_SPIN_DELAY);
  }

  if(autoSpinBtn) autoSpinBtn.addEventListener('click', ()=>{
    if(autoSpinInterval){
      stopAutoSpin();
    } else {
      startAutoSpin();
    }
  });

  if(spinBtn) spinBtn.addEventListener('click', ()=> spin(Number(betInput.value||10)));
  if(maxBtn) maxBtn.addEventListener('click', ()=>{ const max = Math.max(1, Math.floor(vc.readBalance()||0)); betInput.value = max; spin(max); });
});