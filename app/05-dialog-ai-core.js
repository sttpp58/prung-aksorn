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
    if(err.code === 'AI_OUTPUT_TRUNCATED') return false;
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

  async function buildTranslationChunkMetadata(chunks, chunkerVersion){
    if(!Array.isArray(chunks) || chunks.some(function(chunk){ return typeof chunk !== 'string'; })){
      throw new Error('Translation Job chunk list is invalid; integrity metadata cannot be created');
    }
    if(chunkerVersion !== 'v1' && chunkerVersion !== 'v2'){
      throw new Error('Unsupported Translation Job chunker version: ' + String(chunkerVersion));
    }
    if(!window.crypto || !window.crypto.subtle || typeof TextEncoder !== 'function'){
      throw new Error('This browser cannot create the required Translation Job integrity digest');
    }
    var canonical = JSON.stringify(chunks);
    var digestBuffer = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    var digestBytes = Array.from(new Uint8Array(digestBuffer));
    var digest = digestBytes.map(function(byte){ return byte.toString(16).padStart(2, '0'); }).join('');
    return {
      chunkerVersion: chunkerVersion,
      chunkLengths: chunks.map(function(chunk){ return chunk.length; }),
      chunkDigest: digest
    };
  }

  async function verifyTranslationChunkMetadata(job, chunks){
    if(!job || !Array.isArray(chunks)) throw new Error('Translation Job chunk integrity input is invalid');
    if(!job.chunkDigest){
      if(job.chunkerVersion !== undefined || job.chunkLengths !== undefined){
        throw new Error('Translation Job contains incomplete chunk integrity metadata; recovery was stopped to protect the checkpoint');
      }
      return { legacy: true, chunkerVersion: 'v1' };
    }
    if(job.chunkerVersion !== 'v1' && job.chunkerVersion !== 'v2'){
      throw new Error('Translation Job integrity metadata contains an unsupported chunker version');
    }
    if(!Array.isArray(job.chunkLengths) || job.chunkLengths.length !== chunks.length ||
      job.chunkLengths.some(function(length, index){ return !Number.isInteger(length) || length !== chunks[index].length; })){
      throw new Error('Translation Job chunk lengths do not match the reconstructed chunk sequence');
    }
    var current = await buildTranslationChunkMetadata(chunks, job.chunkerVersion);
    if(current.chunkDigest !== job.chunkDigest){
      throw new Error('Translation Job chunk digest mismatch — recovered chunks differ from the sequence used when this Job was created; no API request was sent');
    }
    return { legacy: false, chunkerVersion: current.chunkerVersion, chunkDigest: current.chunkDigest };
  }

  function findTranslationChunkSplit(text){
    if(typeof text !== 'string' || text.length < 2) return null;
    var middle = Math.floor(text.length / 2);

    function closestBoundary(boundaries){
      var usable = boundaries.filter(function(index){ return index > 0 && index < text.length; });
      if(!usable.length) return null;
      usable.sort(function(a,b){ return Math.abs(a-middle) - Math.abs(b-middle); });
      return usable[0];
    }

    var sentenceBoundaries = [];
    var sentencePattern = /[.!?。！？][」』”’"'）)\]]*\s*/g;
    var match;
    while((match = sentencePattern.exec(text)) !== null){
      sentenceBoundaries.push(match.index + match[0].length);
    }
    var boundary = closestBoundary(sentenceBoundaries);
    if(boundary !== null) return [text.slice(0,boundary), text.slice(boundary)];

    var whitespaceBoundaries = [];
    var whitespacePattern = /\s+/g;
    while((match = whitespacePattern.exec(text)) !== null){
      whitespaceBoundaries.push(match.index + match[0].length);
    }
    boundary = closestBoundary(whitespaceBoundaries);
    if(boundary !== null) return [text.slice(0,boundary), text.slice(boundary)];

    if(typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'){
      try{
        var segmenter = new Intl.Segmenter('th', {granularity:'word'});
        var iterator = segmenter.segment(text)[Symbol.iterator]();
        var next = iterator.next();
        var wordBoundaries = [];
        while(!next.done){
          var segment = next.value;
          if(segment.index > 0 && segment.index < text.length) wordBoundaries.push(segment.index);
          next = iterator.next();
        }
        boundary = closestBoundary(wordBoundaries);
        if(boundary !== null) return [text.slice(0,boundary), text.slice(boundary)];
      }catch(segmentError){
        // Deterministic code-point fallback below for environments without a usable Segmenter.
      }
    }

    boundary = middle;
    if(boundary > 0 && boundary < text.length){
      var leftCode = text.charCodeAt(boundary - 1);
      var rightCode = text.charCodeAt(boundary);
      if(leftCode >= 0xD800 && leftCode <= 0xDBFF && rightCode >= 0xDC00 && rightCode <= 0xDFFF){
        boundary -= 1;
      }
    }
    if(boundary <= 0 || boundary >= text.length) return null;
    return [text.slice(0,boundary), text.slice(boundary)];
  }

  async function callTranslationChunkWithTruncationGuard(proj, previousTail, chunk, key, model, signal, maxRetries, provider, settingsSnapshot){
    async function callPart(partText, tailText){
      var prompt = buildTranslatePromptWithSettings(proj, tailText, partText, settingsSnapshot);
      return await callAIWithRetry(prompt, partText, key, model, signal, maxRetries, provider);
    }

    try{
      return await callPart(chunk, previousTail);
    }catch(err){
      if(!err || err.code !== 'AI_OUTPUT_TRUNCATED') throw err;
      var halves = findTranslationChunkSplit(String(chunk || ''));
      if(!halves){
        err.message = (err.message || 'Provider output truncated') + ' — ไม่สามารถแบ่งข้อความนี้เป็นสองส่วนอย่างปลอดภัย';
        throw err;
      }

      // At most one split. A truncation in either half propagates and nothing is checkpointed here.
      var first = await callPart(halves[0], previousTail);
      if(typeof first !== 'string' || !first.trim()){
        var firstEmpty = new Error('ผลลัพธ์ส่วนแรกว่างเปล่าหลังแบ่งข้อความเพื่อแก้ปัญหาคำตอบถูกตัด');
        firstEmpty.status = 'truncated_split_empty';
        throw firstEmpty;
      }
      var firstTrim = first.trim();
      var second = await callPart(halves[1], getTail(firstTrim, 300));
      if(typeof second !== 'string' || !second.trim()){
        var secondEmpty = new Error('ผลลัพธ์ส่วนที่สองว่างเปล่าหลังแบ่งข้อความเพื่อแก้ปัญหาคำตอบถูกตัด');
        secondEmpty.status = 'truncated_split_empty';
        throw secondEmpty;
      }
      var sourceSeparator = /\s+$/.exec(halves[0]);
      var joinSeparator = sourceSeparator ? sourceSeparator[0] : '';
      return firstTrim + joinSeparator + second.trim();
    }
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
