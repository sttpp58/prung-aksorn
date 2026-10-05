  function dedupeGlossary(existingText, newText){
    var seen = Object.create(null);
    var lines = [];
    function addLine(line){
      line = line.trim();
      if(!line) return;
      var key = line.split('=')[0].trim().toLowerCase();
      if(!key || seen[key]) return;
      seen[key] = true;
      lines.push(line);
    }
    (existingText || '').split('\n').forEach(addLine);
    (newText || '').split('\n').forEach(addLine);
    return lines.join('\n');
  }

/* ---------------- Interactive Glossary Review Modal Logic ---------------- */
  var glossaryModal = document.getElementById('glossaryModal');
  var glossaryListBody = document.getElementById('glossaryListBody');
  var glossarySelectedCount = document.getElementById('glossarySelectedCount');
  var glossaryModalCloseBtn = document.getElementById('glossaryModalCloseBtn');
  var glossaryModalCancelBtn = document.getElementById('glossaryModalCancelBtn');
  var glossaryModalSaveBtn = document.getElementById('glossaryModalSaveBtn');
  var glossarySelectAllBtn = document.getElementById('glossarySelectAllBtn');
  var glossaryDeselectAllBtn = document.getElementById('glossaryDeselectAllBtn');

  var currentGlossaryReviewItems = [];
  var glossaryModalResolver = null;

  function updateGlossaryModalCount() {
    var count = currentGlossaryReviewItems.filter(function(i){ return i.selected; }).length;
    glossarySelectedCount.textContent = 'เน€เธฅเธทเธญเธเนเธฅเนเธง ' + count + ' เธเธฒเธ ' + currentGlossaryReviewItems.length + ' เธเธณ';
    glossaryModalSaveBtn.disabled = (count === 0);
  }

  function showGlossaryReviewModal(items) {
    return new Promise(function(resolve) {
      currentGlossaryReviewItems = items;
      glossaryModalResolver = resolve;
      glossaryListBody.innerHTML = '';

      items.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'glossary-row-item' + (item.selected ? '' : ' unchecked');

        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = item.selected;
        chk.addEventListener('change', function() {
          item.selected = chk.checked;
          row.classList.toggle('unchecked', !chk.checked);
          updateGlossaryModalCount();
        });
        row.appendChild(chk);

        var srcLabel = document.createElement('span');
        srcLabel.className = 'glossary-item-src';
        srcLabel.textContent = item.src;
        row.appendChild(srcLabel);

        var arrow = document.createElement('span');
        arrow.className = 'glossary-item-arrow';
        arrow.textContent = '=';
        row.appendChild(arrow);

        var transInput = document.createElement('input');
        transInput.type = 'text';
        transInput.className = 'glossary-item-trans';
        transInput.value = item.trans;
        transInput.addEventListener('input', function() {
          item.trans = transInput.value.trim();
        });
        row.appendChild(transInput);

        glossaryListBody.appendChild(row);
      });

      updateGlossaryModalCount();
      glossaryModal.classList.add('show');
    });
  }

  function closeGlossaryReviewModal(confirmed) {
    glossaryModal.classList.remove('show');
    if (glossaryModalResolver) {
      var res = glossaryModalResolver;
      glossaryModalResolver = null;
      if (confirmed) {
        var approved = currentGlossaryReviewItems
          .filter(function(i){ return i.selected && i.src && i.trans; })
          .map(function(i){ return i.src + ' = ' + i.trans; });
        res(approved);
      } else {
        res(null);
      }
    }
  }

  glossaryModalCloseBtn.addEventListener('click', function(){ closeGlossaryReviewModal(false); });
  glossaryModalCancelBtn.addEventListener('click', function(){ closeGlossaryReviewModal(false); });
  glossaryModalSaveBtn.addEventListener('click', function(){ closeGlossaryReviewModal(true); });

  glossarySelectAllBtn.addEventListener('click', function(){
    currentGlossaryReviewItems.forEach(function(i){ i.selected = true; });
    glossaryListBody.querySelectorAll('.glossary-row-item').forEach(function(el){
      el.classList.remove('unchecked');
      el.querySelector('input[type="checkbox"]').checked = true;
    });
    updateGlossaryModalCount();
  });

  glossaryDeselectAllBtn.addEventListener('click', function(){
    currentGlossaryReviewItems.forEach(function(i){ i.selected = false; });
    glossaryListBody.querySelectorAll('.glossary-row-item').forEach(function(el){
      el.classList.add('unchecked');
      el.querySelector('input[type="checkbox"]').checked = false;
    });
    updateGlossaryModalCount();
  });

  // -------------------------------------------------------------
  // เธเธฑเธเธเนเธเธฑเธเธชเธเธฑเธ”เธเธฅเธฑเธเธเธณเธเธฃเนเธญเธกเน€เธเธดเธ”เธซเธเนเธฒเธ•เนเธฒเธ Pop-up เนเธซเนเธ•เธฃเธงเธเธเนเธญเธเธเธฑเธเธ—เธถเธ
  // -------------------------------------------------------------
  async function runAiGlossaryExtract(proj, textareaEl){
    var text = inputText.value.trim();
    var key = document.getElementById('apiKey').value.trim();
    if(!text){ await showAlertDialog('เธขเธฑเธเนเธกเนเธกเธตเธเนเธญเธเธงเธฒเธก', 'เธเธฃเธธเธ“เธฒเธงเธฒเธเธเนเธญเธเธงเธฒเธกเธ•เนเธเธเธเธฑเธเธเนเธญเธเนเธซเน AI เธงเธดเน€เธเธฃเธฒเธฐเธซเนเธเธฅเธฑเธเธเธณ'); return; }
    if(!key){ await showAlertDialog('เธขเธฑเธเนเธกเนเนเธ”เนเนเธชเน API Key', 'เธเธฃเธธเธ“เธฒเนเธชเน API Key เนเธเธซเธเนเธฒเธ•เธฑเนเธเธเนเธฒเธเนเธญเธ'); return; }
    if(warnIfAiBusy()) return;

    var isThaiSource = (state.source === 'polish');
    var genre = state.genre || 'เธ—เธฑเนเธงเนเธ';
    var sys = "";

    // Prompt เธเธเน€เธซเธฅเนเธ: เธเธฑเธเธเธฑเธเธเธฑเนเธเธเนเธฒเธขเธ•เนเธญเธเน€เธเนเธเธ เธฒเธฉเธฒเธ•เนเธเธเธเธฑเธ 100% เธซเนเธฒเธกเน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธข
    // -------------------------------------------------------------
    if (isThaiSource) {
      // เธเธฃเธ“เธตเน€เธฅเธทเธญเธเนเธซเธกเธ”: "เนเธ—เธขเธญเธขเธนเนเนเธฅเนเธง (เธเธฑเธ”เธชเธณเธเธงเธ)"
      sys = "เธเธธเธ“เธเธทเธญเธเธฃเธฃเธ“เธฒเธเธดเธเธฒเธฃเธ เธฒเธฉเธฒเนเธ—เธข เธเธนเนเน€เธเธตเนเธขเธงเธเธฒเธเธเธดเธขเธฒเธขเนเธเธง " + genre + "\n" +
            "เธซเธเนเธฒเธ—เธตเนเธเธญเธเธเธธเธ“เธเธทเธญ: เธชเนเธเธเธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเนเธ—เธข เนเธฅเนเธงเธ”เธถเธเน€เธเธเธฒเธฐเธเธณเธ—เธฑเธเธจเธฑเธเธ—เนเธ—เธตเนเธกเธฑเธเธชเธฐเธเธ”เธเธดเธ” เธซเธฃเธทเธญเธเธณเธ—เธตเนเธเธงเธฃเธฅเนเธญเธเธกเธฒเธ•เธฃเธเธฒเธเธเธฒเธฃเธชเธฐเธเธ”\n" +
            "[เธเนเธญเธเธณเธซเธเธ”เธชเธณเธเธฑเธเธกเธฒเธ]\n" +
            "- เธซเนเธฒเธกเธ•เธญเธเธเธณเธ—เธตเนเธเนเธณเธเธฑเธเธ—เธฑเนเธเธชเธญเธเธเธฑเนเธเน€เธ”เนเธ”เธเธฒเธ” (เน€เธเนเธ เธซเนเธฒเธก 'เน€เธเธตเนเธขเธเน€เธเธดเธ = เน€เธเธตเนเธขเธเน€เธเธดเธ')\n" +
            "- เธ•เธญเธเน€เธเธเธฒเธฐเธเธณเธ—เธตเนเธกเธตเธเธฒเธฃเนเธเนเนเธเธซเธฃเธทเธญเธฅเนเธญเธเธกเธฒเธ•เธฃเธเธฒเธ เน€เธเนเธ 'เธเธณเธ—เธตเนเธชเธฐเธเธ”เธเธดเธ”/เธเธณเธ—เธตเนเธเธ = เธเธณเธชเธฐเธเธ”เธกเธฒเธ•เธฃเธเธฒเธเธ—เธตเนเธ–เธนเธเธ•เนเธญเธ'\n" +
            "- เธเธฃเธฃเธ—เธฑเธ”เธฅเธฐ 1 เธเธณ เธซเนเธฒเธกเนเธชเน bullet เธซเนเธฒเธกเนเธชเนเธ•เธฑเธงเน€เธฅเธ";
    } else {
      // เธเธฃเธ“เธตเน€เธฅเธทเธญเธเนเธซเธกเธ”: "เธ เธฒเธฉเธฒเธญเธทเนเธ (เนเธเธฅ)"
      sys = "เธเธธเธ“เธเธทเธญเธเธฑเธเนเธเธฅเธเธดเธขเธฒเธขเธกเธทเธญเธญเธฒเธเธตเธ เธเธนเนเน€เธเธตเนเธขเธงเธเธฒเธเธเธดเธขเธฒเธขเนเธเธง " + genre + "\n" +
            "เธซเธเนเธฒเธ—เธตเนเธเธญเธเธเธธเธ“เธเธทเธญ: เธญเนเธฒเธเธเนเธญเธเธงเธฒเธกเธ•เนเธเธเธเธฑเธ เนเธฅเนเธงเธชเธเธฑเธ”เน€เธเธเธฒเธฐ 'เธเธทเนเธญเน€เธเธเธฒเธฐเนเธฅเธฐเธจเธฑเธเธ—เนเน€เธเธเธฒเธฐ' (เธเธทเนเธญเธ•เธฑเธงเธฅเธฐเธเธฃ, เธชเธฑเธ•เธงเนเธญเธชเธนเธฃ, เธชเธ–เธฒเธเธ—เธตเน, เธชเธณเธเธฑเธ, เธฃเธฐเธ”เธฑเธเธเธฅเธฑเธ, เธชเธกเธธเธเนเธเธฃ, เนเธญเธชเธ–, เธญเธฒเธงเธธเธ) เน€เธเธทเนเธญเธ—เธณเธเธฅเธฑเธเธเธณ\n\n" +
            "[เธเธเน€เธซเธฅเนเธเน€เธ”เนเธ”เธเธฒเธ”เน€เธฃเธทเนเธญเธเธ เธฒเธฉเธฒ - STRICT CONSTRAINTS]\n" +
            "1. เธฃเธนเธเนเธเธเธ•เนเธญเธเน€เธเนเธ: [เธเธณเธ เธฒเธฉเธฒเธ•เนเธเธเธเธฑเธเธ”เธฑเนเธเน€เธ”เธดเธก] = [เธเธณเนเธเธฅเธ เธฒเธฉเธฒเนเธ—เธข]\n" +
            "2. เธเธฑเนเธเธเนเธฒเธข (เธเนเธญเธเน€เธเธฃเธทเนเธญเธเธซเธกเธฒเธข =) เธ•เนเธญเธเน€เธเนเธเธ เธฒเธฉเธฒเธ•เนเธเธ—เธฒเธเธ•เธฒเธกเธ—เธตเนเธเธฃเธฒเธเธเนเธเธเนเธญเธเธงเธฒเธก 100% (เน€เธเนเธ เธ เธฒเธฉเธฒเธญเธฑเธเธเธคเธฉ เธซเธฃเธทเธญ เธ เธฒเธฉเธฒเธเธตเธ) เธซเนเธฒเธกเนเธเธฅเธซเธฃเธทเธญเธ—เธฑเธเธจเธฑเธเธ—เนเน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธขเน€เธ”เนเธ”เธเธฒเธ”!\n" +
            "   โ… เธ•เธฑเธงเธญเธขเนเธฒเธเธ—เธตเนเธ–เธนเธเธ•เนเธญเธ:\n" +
            "   Jian Chen = เน€เธเธตเนเธขเธเน€เธเธดเธ\n" +
            "   Empyrean Demon Lord = เธเธญเธกเธกเธฒเธฃเน€เธญเนเธกเนเธเน€เธฃเธตเธขเธ\n" +
            "   Nan Potian = เธซเธเธฒเธเนเธเน€เธ—เธตเธขเธ\n" +
            "   Fairy Hao Yue = เน€เธเธตเธขเธเธฎเนเธฒเธงเน€เธขเธงเน\n" +
            "   โ เธ•เธฑเธงเธญเธขเนเธฒเธเธ—เธตเนเธเธดเธ”เน€เธ”เนเธ”เธเธฒเธ” (เธซเนเธฒเธกเธ—เธณ):\n" +
            "   เน€เธญเนเธกเนเธเน€เธฃเธตเธขเธเน€เธ”เธกเธญเธเธฅเธญเธฃเนเธ” = เธเธญเธกเธกเธฒเธฃเน€เธญเนเธกเนเธเน€เธฃเธตเธขเธ (เธเธดเธ”! เน€เธเธฃเธฒเธฐเธเธฑเนเธเธเนเธฒเธขเน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธข)\n" +
            "   เน€เธเธตเนเธขเธเน€เธเธดเธ = เน€เธเธตเนเธขเธเน€เธเธดเธ (เธเธดเธ”! เน€เธเธฃเธฒเธฐเธเธฑเนเธเธเนเธฒเธขเธ•เนเธญเธเน€เธเนเธเธ เธฒเธฉเธฒเธญเธฑเธเธเธคเธฉ Jian Chen)\n" +
            "3. เธซเนเธฒเธกเธชเธเธฑเธ”เธเธณเธจเธฑเธเธ—เนเธชเธฒเธกเธฑเธเธ—เธฑเนเธงเนเธ (เน€เธเนเธ sword, forest, city, water, king)\n" +
            "4. เธ•เธญเธเน€เธเธเธฒเธฐเธฃเธฒเธขเธเธฒเธฃเธเธณเธจเธฑเธเธ—เนเธเธฃเธฃเธ—เธฑเธ”เธฅเธฐ 1 เธเธณ เธซเนเธฒเธกเนเธชเน bullet (- เธซเธฃเธทเธญ *) เธซเนเธฒเธกเนเธชเนเธ•เธฑเธงเน€เธฅเธเธฅเธณเธ”เธฑเธ เนเธฅเธฐเธซเนเธฒเธกเธกเธตเธเธณเธญเธเธดเธเธฒเธขเนเธ”เน เธ—เธฑเนเธเธชเธดเนเธ";
    }

    var chunks = splitIntoChunks(text, 4000);
    var rawResults = '';

    activeController = new AbortController();
    setAiBusy(true);
    resetActionStats();
    cancelBtn.classList.add('show');
    try {
      for(var i = 0; i < chunks.length; i++){
        progressText.textContent = chunks.length > 1
          ? ('เธเธณเธฅเธฑเธเนเธซเน AI เธงเธดเน€เธเธฃเธฒเธฐเธซเนเธเธฅเธฑเธเธเธณ เธชเนเธงเธเธ—เธตเน ' + (i + 1) + '/' + chunks.length + '...')
          : 'เธเธณเธฅเธฑเธเนเธซเน AI เธงเธดเน€เธเธฃเธฒเธฐเธซเนเธเธฅเธฑเธเธเธณเนเธฅเธฐเธเธทเนเธญเน€เธเธเธฒเธฐ...';
        var result = await callAIWithRetry(sys, chunks[i], key, modelInput.value, activeController.signal, 1);
        if(result && result.trim()){
          rawResults += '\n' + result.trim();
        }
      }

      var parsedItems = [];
      var seen = Object.create(null);
      var existingKeys = Object.create(null);
      (proj.glossary || '').split('\n').forEach(function(line){
        var k = line.split('=')[0].trim().toLowerCase();
        if(k) existingKeys[k] = true;
      });

      rawResults.split('\n').forEach(function(rawLine){
        var line = rawLine.trim().replace(/^[-*โ€ข\d.]+\s*/, '').trim();
        if(!line.includes('=')) return;
        var parts = line.split('=');
        var src = parts[0].trim();
        var trans = parts.slice(1).join('=').trim();
        if(!src || !trans) return;
        if(src.toLowerCase() === trans.toLowerCase()) return; //  เธเนเธญเธเธเธฑเธเธเธฃเธ“เธตเธเธณเธเธฑเนเธเธเนเธฒเธขเธ•เธฃเธเธเธฑเธเธเธฑเนเธเธเธงเธฒเน€เธเนเธฐเน (เน€เธเนเธ เน€เธเธตเนเธขเธเน€เธเธดเธ = เน€เธเธตเนเธขเธเน€เธเธดเธ)

        var keyLower = src.toLowerCase();
        if(!seen[keyLower]){
          seen[keyLower] = true;
          parsedItems.push({
            src: src,
            trans: trans,
            selected: !existingKeys[keyLower] // เธ–เนเธฒเธกเธตเนเธเธเธฅเธฑเธเธเธณเน€เธ”เธดเธกเนเธฅเนเธงเธเธฐ uncheck เนเธงเน
          });
        }
      });

      if(parsedItems.length === 0){
        await showAlertDialog('เนเธกเนเธเธเธเธณเธจเธฑเธเธ—เน', 'AI เนเธกเนเธเธเธเธทเนเธญเน€เธเธเธฒเธฐเธซเธฃเธทเธญเธเธณเธจเธฑเธเธ—เนเนเธซเธกเนเนเธเธเนเธญเธเธงเธฒเธกเธเธตเน');
        return;
      }

      // เน€เธเธดเธ”เธซเธเนเธฒเธ•เนเธฒเธ Pop-up เนเธซเนเธเธนเนเนเธเนเธ•เธฃเธงเธเธชเธญเธ
      var approvedList = await showGlossaryReviewModal(parsedItems);
      if(approvedList && approvedList.length > 0){
        var merged = dedupeGlossary(proj.glossary || '', approvedList.join('\n'));
        proj.glossary = merged;
        textareaEl.value = proj.glossary;
        saveData();

        var statsStr = '';
        if(currentActionTokens > 0) statsStr = '\n\n(เนเธเนเนเธ ' + currentActionTokens.toLocaleString() + ' tokens, เธเธฃเธฐเธกเธฒเธ“ $' + currentActionCost.toFixed(4) + ')';
        await showAlertDialog('เธชเธณเน€เธฃเนเธ', 'เธเธฑเธเธ—เธถเธเธเธณเธจเธฑเธเธ—เน ' + approvedList.length + ' เธเธณ เธฅเธเนเธเธเธฅเธฑเธเธเธณเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง' + statsStr);
      }
    } catch(err){
      if(err.name !== 'AbortError'){
        await showAlertDialog('เธ—เธณเนเธกเนเธชเธณเน€เธฃเนเธ', 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธ”เธถเธเธเธฅเธฑเธเธเธณเนเธ”เน: ' + (err.message || ''));
      }
    } finally {
      setAiBusy(false);
      cancelBtn.classList.remove('show');
      progressText.textContent = '';
    }
  }

  var historyViewBanner = document.getElementById('historyViewBanner');
  var historyViewBannerBottom = document.getElementById('historyViewBannerBottom');
  var historyViewLabel = document.getElementById('historyViewLabel');
  var historyViewLabelBottom = document.getElementById('historyViewLabelBottom');
  var chapterTitle = document.getElementById('chapterTitle');
  var inputText = document.getElementById('inputText');
  var inCount = document.getElementById('inCount');
  var outCount = document.getElementById('outCount');
  var output = document.getElementById('output');
  var stamp = document.getElementById('stamp');
  var qualityWarningBox = document.getElementById('qualityWarningBox');
  var tqgQualityToggleBtn = document.getElementById('tqgQualityToggleBtn');
  var tqgQualityPanel = document.getElementById('tqgQualityPanel');
  var tqgQualityState = null;
  var outputFontValue = document.getElementById('outputFontValue');
  if(window.TQGQualityUI && tqgQualityToggleBtn && tqgQualityPanel){
    window.TQGQualityUI.bindToggle(tqgQualityToggleBtn, tqgQualityPanel);
    window.TQGQualityUI.mount(tqgQualityPanel, {});
  }
  var saveStatusText = document.getElementById('saveStatusText');
