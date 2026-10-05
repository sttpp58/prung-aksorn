  var appDialogOverlay = document.getElementById('appDialogOverlay');
  var appDialogTitle = document.getElementById('appDialogTitle');
  var appDialogMessage = document.getElementById('appDialogMessage');
  var appDialogInput = document.getElementById('appDialogInput');
  var appDialogCancelBtn = document.getElementById('appDialogCancelBtn');
  var appDialogConfirmBtn = document.getElementById('appDialogConfirmBtn');
  var appDialogResolver = null;
  var appDialogMode = null;

  function closeAppDialog(result){
    appDialogOverlay.classList.remove('show');
    if(appDialogResolver){
      var r = appDialogResolver;
      appDialogResolver = null;
      r(result);
    }
  }
  appDialogCancelBtn.addEventListener('click', function(){
    closeAppDialog(appDialogMode === 'prompt' ? null : false);
  });
  appDialogConfirmBtn.addEventListener('click', function(){
    if(appDialogMode === 'prompt') closeAppDialog(appDialogInput.value);
    else closeAppDialog(true);
  });
  appDialogOverlay.addEventListener('click', function(e){
    if(e.target !== appDialogOverlay) return;
    closeAppDialog(appDialogMode === 'prompt' ? null : false);
  });
  appDialogInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); appDialogConfirmBtn.click(); }
    else if(e.key === 'Escape'){ appDialogCancelBtn.click(); }
  });
  appDialogOverlay.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && appDialogOverlay.classList.contains('show')){
      appDialogCancelBtn.click();
    }
  });

  function showPromptDialog(title, defaultValue){
    return new Promise(function(resolve){
      appDialogMode = 'prompt';
      appDialogResolver = resolve;
      appDialogTitle.textContent = title;
      appDialogMessage.style.display = 'none';
      appDialogInput.style.display = 'block';
      appDialogInput.value = defaultValue || '';
      appDialogConfirmBtn.textContent = 'เธ•เธเธฅเธ';
      appDialogConfirmBtn.classList.remove('danger');
      appDialogCancelBtn.style.display = 'inline-block';
      appDialogOverlay.classList.add('show');
      setTimeout(function(){ appDialogInput.focus(); appDialogInput.select(); }, 50);
    });
  }

  function showConfirmDialog(title, message, danger, confirmLabel){
    return new Promise(function(resolve){
      appDialogMode = 'confirm';
      appDialogResolver = resolve;
      appDialogTitle.textContent = title;
      appDialogMessage.textContent = message;
      appDialogMessage.style.display = 'block';
      appDialogInput.style.display = 'none';
      appDialogConfirmBtn.textContent = confirmLabel || (danger ? 'เธฅเธ' : 'เธ•เธเธฅเธ');
      appDialogConfirmBtn.classList.toggle('danger', !!danger);
      appDialogCancelBtn.style.display = 'inline-block';
      appDialogOverlay.classList.add('show');
      setTimeout(function(){ appDialogConfirmBtn.focus(); }, 50);
    });
  }

  function showAlertDialog(title, message){
    return new Promise(function(resolve){
      appDialogMode = 'alert';
      appDialogResolver = resolve;
      appDialogTitle.textContent = title;
      appDialogMessage.textContent = message;
      appDialogMessage.style.display = 'block';
      appDialogInput.style.display = 'none';
      appDialogConfirmBtn.textContent = 'เธ•เธเธฅเธ';
      appDialogConfirmBtn.classList.remove('danger');
      appDialogCancelBtn.style.display = 'none';
      appDialogOverlay.classList.add('show');
      setTimeout(function(){ appDialogConfirmBtn.focus(); }, 50);
    });
  }

  var diffOverlay = document.getElementById('diffOverlay');
  var diffBody = document.getElementById('diffBody');
  var diffTitleEl = document.getElementById('diffTitle');
  function openDiff(oldText, newText, titleText){
    diffTitleEl.textContent = titleText || 'เน€เธ—เธตเธขเธเธเธงเธฒเธกเธ•เนเธฒเธ';
    diffBody.innerHTML = '';
    var result = diffTexts(oldText, newText);
    if(!result){
      diffBody.textContent = 'เธเนเธญเธเธงเธฒเธกเธขเธฒเธงเน€เธเธดเธเนเธเธชเธณเธซเธฃเธฑเธเน€เธ—เธตเธขเธเธเธงเธฒเธกเธ•เนเธฒเธเนเธเธเธฅเธฐเน€เธญเธตเธขเธ” เธฅเธญเธเน€เธ—เธตเธขเธเธ—เธตเธฅเธฐเธชเนเธงเธเธ—เธตเนเธชเธฑเนเธเธเธงเนเธฒเธเธตเน';
    } else {
      diffBody.appendChild(renderDiffHtml(result));
    }
    diffOverlay.classList.add('show');
  }
  document.getElementById('diffCloseBtn').addEventListener('click', function(){
    diffOverlay.classList.remove('show');
  });
  diffOverlay.addEventListener('click', function(e){
    if(e.target === diffOverlay) diffOverlay.classList.remove('show');
  });

  function findEntryById(proj, id){
    if(!proj || !id) return null;
    var allHist = [];
    (proj.books || []).forEach(function(b){ allHist = allHist.concat(b.history || []); });
    if(proj.history) allHist = allHist.concat(proj.history);
    return allHist.find(function(h){ return h.id === id; }) || null;
  }

  async function restoreBatchHistoryOrder(proj, book, batchId){
    if(!proj || !batchId) return;
    try{
      var history = book ? (book.history || []) : (proj.history || []);
      if(history.length < 2) return;
      var jobs = await PrungAksornStorageV2.listTranslationJobs();
      var orderByChapter = Object.create(null);
      jobs.forEach(function(j){
        if(j && j.jobType === 'batch' && j.batchId === batchId && Number.isInteger(j.batchIndex) && j.chapterId){
          orderByChapter[j.chapterId] = j.batchIndex;
        }
      });
      var batchEntries = history.map(function(entry, index){
        return {
          entry: entry,
          index: index,
          order: Object.prototype.hasOwnProperty.call(orderByChapter, entry.id) ? orderByChapter[entry.id] : null
        };
      }).filter(function(x){ return x.order !== null; });
      if(batchEntries.length < 2) return;
      batchEntries.sort(function(a,b){ return a.order - b.order || a.index - b.index; });
      var cursor = 0;
      var reordered = history.map(function(entry){
        if(Object.prototype.hasOwnProperty.call(orderByChapter, entry.id)) return batchEntries[cursor++].entry;
        return entry;
      });
      if(book) book.history = reordered;
      else proj.history = reordered;
    }catch(e){
      console.warn('Batch history order restoration skipped:', e);
    }
  }

  function sleep(ms){
    return new Promise(function(resolve){ setTimeout(resolve, ms); });
  }

  function analyzeChunkRatio(sourceText, translatedText, priorRatios){
    var srcLen = (sourceText || '').trim().length;
    var outLen = (translatedText || '').trim().length;
    if(srcLen < 40) return null;

    var ratio = outLen / srcLen;
    var srcParas = (sourceText.split(/\n\s*\n/).filter(function(p){ return p.trim(); })).length || 1;
    var outParas = (translatedText.split(/\n\s*\n/).filter(function(p){ return p.trim(); })).length || 1;

    var reasons = [];

    if(priorRatios.length >= 2){
      var avg = priorRatios.reduce(function(a, b){ return a + b; }, 0) / priorRatios.length;
      if(ratio < avg * 0.4){
        reasons.push('เธชเธฑเนเธเธเธดเธ”เธเธเธ•เธดเน€เธกเธทเนเธญเน€เธ—เธตเธขเธเธเธฑเธเธชเนเธงเธเธเนเธญเธเธซเธเนเธฒเนเธเน€เธฃเธทเนเธญเธเน€เธ”เธตเธขเธงเธเธฑเธ (เธเธเธ•เธด ~' + Math.round(avg * 100) + '% เธเธญเธเธ•เนเธเธเธเธฑเธ เนเธ•เนเธชเนเธงเธเธเธตเนเนเธ”เน ' + Math.round(ratio * 100) + '%)');
      }
    }

    if(ratio < 0.15){
      reasons.push('เธเธณเนเธเธฅเธชเธฑเนเธเธเธงเนเธฒเธ•เนเธเธเธเธฑเธเธกเธฒเธ (เธเธฃเธฐเธกเธฒเธ“ ' + Math.round(ratio * 100) + '% เธเธญเธเธเธงเธฒเธกเธขเธฒเธงเธ•เนเธเธเธเธฑเธ)');
    }

    if(srcParas >= 3 && outParas < srcParas * 0.5){
      reasons.push('เธเธณเธเธงเธเธขเนเธญเธซเธเนเธฒเธฅเธ”เธฅเธเธกเธฒเธ (เธ•เนเธเธเธเธฑเธ ' + srcParas + ' เธขเนเธญเธซเธเนเธฒ เน€เธซเธฅเธทเธญเธเธณเนเธเธฅ ' + outParas + ' เธขเนเธญเธซเธเนเธฒ)');
    }

    return { ratio: ratio, suspicious: reasons.length > 0, reasons: reasons };
  }

  function isRetryableError(err){
    if(!err) return false;
    if(err.status === 429) return true;
    if(err.status >= 500 && err.status < 600) return true;
    if(err.status === 'gemini_blocked' || err.status === 'gemini_empty') return false;
    if(!err.status) return true;
    return false;
  }

  function describeGeminiFinishReason(reason){
    switch(reason){
      case 'SAFETY': return 'เธ–เธนเธเธเธฅเนเธญเธเน€เธเธฃเธฒเธฐเน€เธเนเธฒเธเนเธฒเธขเน€เธเธทเนเธญเธซเธฒเธ—เธตเนเธฅเธฐเน€เธกเธดเธ”เธเนเธขเธเธฒเธขเธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธขเธเธญเธ Gemini';
      case 'RECITATION': return 'เธ–เธนเธเธเธฅเนเธญเธเน€เธเธฃเธฒเธฐเธฃเธฐเธเธเธ•เธฃเธงเธเธเธเธงเนเธฒเธเธฅเนเธฒเธขเน€เธเธทเนเธญเธซเธฒเธ—เธตเนเธกเธตเธฅเธดเธเธชเธดเธ—เธเธดเนเธกเธฒเธเน€เธเธดเธเนเธ';
      case 'PROHIBITED_CONTENT': return 'เธ–เธนเธเธเธฅเนเธญเธเน€เธเธฃเธฒเธฐเน€เธเนเธฒเธเนเธฒเธขเน€เธเธทเนเธญเธซเธฒเธ•เนเธญเธเธซเนเธฒเธกเธ•เธฒเธกเธเนเธขเธเธฒเธขเธเธญเธ Google';
      case 'SPII': return 'เธ–เธนเธเธเธฅเนเธญเธเน€เธเธฃเธฒเธฐเธฃเธฐเธเธเธ•เธฃเธงเธเธเธเธเนเธญเธกเธนเธฅเธชเนเธงเธเธเธธเธเธเธฅเธ—เธตเนเธฅเธฐเน€เธญเธตเธขเธ”เธญเนเธญเธ';
      case 'MAX_TOKENS': return 'เธเธณเธ•เธญเธเธ–เธนเธเธ•เธฑเธ”เธเธฅเธฒเธเธเธฑเธเน€เธเธฃเธฒเธฐเธขเธฒเธงเน€เธเธดเธเธเธตเธ”เธเธณเธเธฑเธ”เธเธณเธ•เธญเธเธเธญเธเนเธกเน€เธ”เธฅเธเธตเน';
      case 'OTHER': return 'เธ–เธนเธเธเธฅเนเธญเธเนเธ”เธข Gemini เนเธ”เธขเนเธกเนเธฃเธฐเธเธธเธชเธฒเน€เธซเธ•เธธเธ—เธตเนเธเธฑเธ”เน€เธเธ';
      default: return 'เนเธกเนเธ—เธฃเธฒเธเธชเธฒเน€เธซเธ•เธธเธเธฑเธ”เน€เธเธ (finishReason: ' + (reason || 'เนเธกเนเธฃเธฐเธเธธ') + ')';
    }
  }

  function describeGeminiBlockReason(reason){
    switch(reason){
      case 'SAFETY': return 'เธเนเธขเธเธฒเธขเธเธงเธฒเธกเธเธฅเธญเธ”เธ เธฑเธขเธเธญเธ Google';
      case 'BLOCKLIST': return 'เธเธณเธ•เนเธญเธเธซเนเธฒเธกเนเธเธฃเธฐเธเธ';
      case 'PROHIBITED_CONTENT': return 'เน€เธเธทเนเธญเธซเธฒเธ•เนเธญเธเธซเนเธฒเธก';
      default: return reason || 'เนเธกเนเธฃเธฐเธเธธ';
    }
  }

  function resetActionStats() {
    currentActionCost = 0;
    currentActionTokens = 0;
  }

  function renderCostMeter() {
    var stats = (appData.settings && appData.settings.apiStats) || { cost: 0 };
    document.getElementById('costMeterValue').textContent = (stats.cost || 0).toFixed(4);
  }

  document.getElementById('costMeter').addEventListener('click', async function(){
    var ok = await showConfirmDialog('เธฃเธตเน€เธเนเธ•เธชเธ–เธดเธ•เธดเธเนเธฒเนเธเนเธเนเธฒเธข', 'เธ•เนเธญเธเธเธฒเธฃเธฃเธตเน€เธเนเธ•เธขเธญเธ”เธเนเธฒเนเธเนเธเนเธฒเธขเนเธฅเธฐเธเธณเธเธงเธ Token เธชเธฐเธชเธกเธเธฅเธฑเธเน€เธเนเธเธจเธนเธเธขเนเธซเธฃเธทเธญเนเธกเน?');
    if(ok) {
      if(appData.settings) {
        appData.settings.apiStats = { tokens: 0, cost: 0 };
        saveSettings();
        renderCostMeter();
      }
    }
  });

  function updateApiStats(model, pTokens, cTokens) {
    if(!pTokens && !cTokens) return;

    var modelKey = model.toLowerCase().trim();
    var rate = API_RATES[modelKey];
    if(!rate) {
      if(modelKey.indexOf('flash') !== -1) rate = API_RATES['gemini-2.5-flash'];
      else if(modelKey.indexOf('pro') !== -1) rate = API_RATES['gemini-2.5-pro'];
      else if(modelKey.indexOf('4o-mini') !== -1) rate = API_RATES['gpt-4o-mini'];
      else if(modelKey.indexOf('4o') !== -1) rate = API_RATES['gpt-4o'];
      else rate = API_RATES['default'];
    }

    var costIn = (pTokens / 1000000) * rate.in;
    var costOut = (cTokens / 1000000) * rate.out;
    var totalCost = costIn + costOut;
    var totalTokens = pTokens + cTokens;

    currentActionTokens += totalTokens;
    currentActionCost += totalCost;

    if(!appData.settings.apiStats) appData.settings.apiStats = { tokens: 0, cost: 0 };
    appData.settings.apiStats.tokens += totalTokens;
    appData.settings.apiStats.cost += totalCost;

    saveData();
    renderCostMeter();
  }

  async function callAIWithRetry(sys, text, key, model, signal, maxRetries, providerOverride, responseFormat){
    var requestProvider = providerOverride || providerSel.value;
    var lastErr;
    for(var attempt = 0; attempt <= maxRetries; attempt++){
      try{
        return await (requestProvider === 'openai'
          ? callOpenAI(sys, text, key, model, signal, responseFormat)
          : callGemini(sys, text, key, model, signal, responseFormat));
      }catch(err){
        if(err.name === 'AbortError') throw err;
        lastErr = err;
        if(!isRetryableError(err) || attempt === maxRetries) throw err;
        progressText.textContent = 'เน€เธเธญเธเธฑเธเธซเธฒเธเธฑเนเธงเธเธฃเธฒเธง (' + (err.message || '') + ') เธเธณเธฅเธฑเธเธฅเธญเธเนเธซเธกเน (' + (attempt + 1) + '/' + maxRetries + ')...';
        await sleep(1000 * Math.pow(2, attempt));
      }
    }
    throw lastErr;
  }

  function countWords(text){
    text = (text || '').trim();
    if(!text) return 0;
    try{
      if(typeof Intl !== 'undefined' && Intl.Segmenter){
        var seg = new Intl.Segmenter('th', { granularity: 'word' });
        var count = 0;
        var iter = seg.segment(text)[Symbol.iterator]();
        var r = iter.next();
        while(!r.done){
          if(r.value.isWordLike) count++;
          r = iter.next();
        }
        return count;
      }
    }catch(e){}
    return text.split(/\s+/).filter(Boolean).length;
  }
