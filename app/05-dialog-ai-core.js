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
      appDialogConfirmBtn.textContent = 'ตกลง';
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
      appDialogConfirmBtn.textContent = confirmLabel || (danger ? 'ลบ' : 'ตกลง');
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
      appDialogConfirmBtn.textContent = 'ตกลง';
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
    diffTitleEl.textContent = titleText || 'เทียบความต่าง';
    diffBody.innerHTML = '';
    var result = diffTexts(oldText, newText);
    if(!result){
      diffBody.textContent = 'ข้อความยาวเกินไปสำหรับเทียบความต่างแบบละเอียด ลองเทียบทีละส่วนที่สั้นกว่านี้';
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
        reasons.push('สั้นผิดปกติเมื่อเทียบกับส่วนก่อนหน้าในเรื่องเดียวกัน (ปกติ ~' + Math.round(avg * 100) + '% ของต้นฉบับ แต่ส่วนนี้ได้ ' + Math.round(ratio * 100) + '%)');
      }
    }

    if(ratio < 0.15){
      reasons.push('คำแปลสั้นกว่าต้นฉบับมาก (ประมาณ ' + Math.round(ratio * 100) + '% ของความยาวต้นฉบับ)');
    }

    if(srcParas >= 3 && outParas < srcParas * 0.5){
      reasons.push('จำนวนย่อหน้าลดลงมาก (ต้นฉบับ ' + srcParas + ' ย่อหน้า เหลือคำแปล ' + outParas + ' ย่อหน้า)');
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
      case 'SAFETY': return 'ถูกบล็อกเพราะเข้าข่ายเนื้อหาที่ละเมิดนโยบายความปลอดภัยของ Gemini';
      case 'RECITATION': return 'ถูกบล็อกเพราะระบบตรวจพบว่าคล้ายเนื้อหาที่มีลิขสิทธิ์มากเกินไป';
      case 'PROHIBITED_CONTENT': return 'ถูกบล็อกเพราะเข้าข่ายเนื้อหาต้องห้ามตามนโยบายของ Google';
      case 'SPII': return 'ถูกบล็อกเพราะระบบตรวจพบข้อมูลส่วนบุคคลที่ละเอียดอ่อน';
      case 'MAX_TOKENS': return 'คำตอบถูกตัดกลางคันเพราะยาวเกินขีดจำกัดคำตอบของโมเดลนี้';
      case 'OTHER': return 'ถูกบล็อกโดย Gemini โดยไม่ระบุสาเหตุที่ชัดเจน';
      default: return 'ไม่ทราบสาเหตุชัดเจน (finishReason: ' + (reason || 'ไม่ระบุ') + ')';
    }
  }

  function describeGeminiBlockReason(reason){
    switch(reason){
      case 'SAFETY': return 'นโยบายความปลอดภัยของ Google';
      case 'BLOCKLIST': return 'คำต้องห้ามในระบบ';
      case 'PROHIBITED_CONTENT': return 'เนื้อหาต้องห้าม';
      default: return reason || 'ไม่ระบุ';
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
    var ok = await showConfirmDialog('รีเซ็ตสถิติค่าใช้จ่าย', 'ต้องการรีเซ็ตยอดค่าใช้จ่ายและจำนวน Token สะสมกลับเป็นศูนย์หรือไม่?');
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
        progressText.textContent = 'เจอปัญหาชั่วคราว (' + (err.message || '') + ') กำลังลองใหม่ (' + (attempt + 1) + '/' + maxRetries + ')...';
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
