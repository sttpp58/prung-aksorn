  async function loadData(){
    try{
      var data = await storageV2.load();
      if(data && typeof data === 'object') appData = data;
    }catch(e){
      storageReady = false;
      console.error('Error loading data from IndexedDB V2:', e);
      return false;
    }
    if(!appData || typeof appData !== 'object') appData = { projects: [], currentProjectId: null };
    if(!Array.isArray(appData.projects)) appData.projects = [];
    var migratedBookDrafts = false;
    appData.projects = appData.projects.filter(function(p){ return p && typeof p === 'object' && p.id && p.name; }).map(function(p){
      var legacyDraft = typeof p.draft === 'string' ? p.draft : '';
      var legacyChapterTitle = typeof p.chapterTitle === 'string' ? p.chapterTitle : '';
      var hadLegacyDraftFields = Object.prototype.hasOwnProperty.call(p, 'draft') || Object.prototype.hasOwnProperty.call(p, 'chapterTitle');

      if(!Array.isArray(p.books) || p.books.length === 0){
        p.books = [{ id: makeId('b'), title: 'เล่ม 1', history: Array.isArray(p.history) ? p.history : [], draft: legacyDraft, chapterTitle: legacyChapterTitle }];
        p.currentBookId = p.books[0].id;
        if(hadLegacyDraftFields) migratedBookDrafts = true;
      } else {
        if(!p.currentBookId && p.books.length > 0) p.currentBookId = p.books[0].id;
        var activeBookBeforeNormalize = p.books.find(function(b){ return b.id === p.currentBookId; }) || null;
        if(!activeBookBeforeNormalize && p.books.length > 0){
          p.currentBookId = p.books[0].id;
          activeBookBeforeNormalize = p.books[0];
        }
        var activeBookHadDraft = !!(activeBookBeforeNormalize && typeof activeBookBeforeNormalize.draft === 'string');
        var activeBookHadChapterTitle = !!(activeBookBeforeNormalize && typeof activeBookBeforeNormalize.chapterTitle === 'string');

        p.books.forEach(function(b){
          b.history = Array.isArray(b.history) ? b.history : [];
          b.draft = typeof b.draft === 'string' ? b.draft : '';
          b.chapterTitle = typeof b.chapterTitle === 'string' ? b.chapterTitle : '';
        });

        var activeBook = p.books.find(function(b){ return b.id === p.currentBookId; }) || null;
        if(activeBook){
          if(!activeBookHadDraft && legacyDraft){
            activeBook.draft = legacyDraft;
            migratedBookDrafts = true;
          }
          if(!activeBookHadChapterTitle && legacyChapterTitle){
            activeBook.chapterTitle = legacyChapterTitle;
            migratedBookDrafts = true;
          }
        }
      }

      if(!p.currentBookId && p.books.length > 0) p.currentBookId = p.books[0].id;
      var activeBook = p.books.find(function(b){ return b.id === p.currentBookId; }) || null;
      if(!activeBook && p.books.length > 0){
        p.currentBookId = p.books[0].id;
        activeBook = p.books[0];
      }
      if(activeBook){
        if(hadLegacyDraftFields) migratedBookDrafts = true;
        delete p.draft;
        delete p.chapterTitle;
      }

      p.glossary = typeof p.glossary === 'string' ? p.glossary : '';
      p.context = typeof p.context === 'string' ? p.context : '';
      return p;
    });
    storageReady = true;
    if(migratedBookDrafts) saveData();
    appData.settings = Object.assign({}, defaultSettings, appData.settings || {});
    if(!appData.settings.apiStats) appData.settings.apiStats = { tokens: 0, cost: 0 };
    return true;
  }

  function saveSettings(){
    var prevSettings = appData.settings || {};
    var customModels = (prevSettings.customModels && typeof prevSettings.customModels === 'object')
      ? prevSettings.customModels
      : { openai: [], gemini: [] };
    appData.settings = {
      provider: providerSel.value,
      model: modelInput.value,
      customModels: customModels,
      chunkLen: document.getElementById('chunkLen').value,
      source: state.source, level: state.level, genre: state.genre, style: state.style,
      outputFontSize: outputFontSize,
      readerFontSize: prevSettings.readerFontSize || defaultSettings.readerFontSize,
      darkMode: document.documentElement.classList.contains('dark-mode'),
      ttsRate: prevSettings.ttsRate || defaultSettings.ttsRate,
      ttsVoiceURI: prevSettings.ttsVoiceURI || defaultSettings.ttsVoiceURI,
      apiStats: prevSettings.apiStats || { tokens: 0, cost: 0 }
    };
    saveData();
  }

  function applySettingsToUI(){
    var s = appData.settings;
    providerSel.value = s.provider;
    modelInput.value = s.model;
    document.getElementById('chunkLen').value = s.chunkLen;
    state.source = s.source; state.level = s.level; state.genre = s.genre; state.style = s.style;
    outputFontSize = Number(s.outputFontSize) || defaultSettings.outputFontSize;
    if(typeof renderModelPicker === 'function') renderModelPicker();

    if(s.darkMode){
      document.documentElement.classList.add('dark-mode');
    }else{
      document.documentElement.classList.remove('dark-mode');
    }
    updateThemeButtons(s.darkMode);
    renderCostMeter();

    function setSegActive(id, val){
      var seg = document.getElementById(id);
      seg.querySelectorAll('button').forEach(function(b){
        b.classList.toggle('active', b.dataset.val === val);
      });
    }
    setSegActive('sourceSeg', s.source);
    setSegActive('levelSeg', s.level);
    setSegActive('styleSeg', s.style);
    document.getElementById('genreChips').querySelectorAll('.chip').forEach(function(c){
      c.classList.toggle('active', c.dataset.val === s.genre);
    });
    setOutputFontSize(outputFontSize, false);
    updateTranslationSummary();
    updateKeyStatusBadge();
  }

  async function saveDataImmediate(){
    if(!storageReady){
      if(saveStatusText){
        saveStatusText.textContent = '⚠ ฐานข้อมูลยังไม่พร้อม';
        saveStatusText.classList.remove('saving');
      }
      return false;
    }
    try{
      await storageV2.save(appData);
      if(saveStatusText){
        saveStatusText.textContent = '⚬ บันทึกแล้ว';
        saveStatusText.classList.remove('saving');
      }
      return true;
    }catch(e){
      console.error('IndexedDB V2 save failed:', e);
      if(saveStatusText){
        saveStatusText.textContent = '⚠ บันทึกไม่สำเร็จ';
        saveStatusText.classList.remove('saving');
      }
      return false;
    }
  }

  var saveDataTimer = null;
  var saveDataPending = false;
  var saveDataVersion = 0;
  var saveRetryTimer = null;
  var saveRetryCount = 0;
  var saveDataInFlight = null;
  var SAVE_RETRY_DELAYS = [1000, 3000, 10000];

  function scheduleSaveRetry(){
    if(!saveDataPending || saveRetryTimer || saveRetryCount >= SAVE_RETRY_DELAYS.length) return;
    var delay = SAVE_RETRY_DELAYS[saveRetryCount];
    saveRetryCount += 1;
    if(saveStatusText){
      saveStatusText.textContent = '⚠ บันทึกไม่สำเร็จ กำลังลองใหม่...';
      saveStatusText.classList.add('saving');
    }
    saveRetryTimer = setTimeout(function(){
      saveRetryTimer = null;
      flushSaveData();
    }, delay);
  }

  async function flushSaveData(){
    if(saveDataInFlight) return saveDataInFlight;
    saveDataInFlight = (async function(){
      clearTimeout(saveDataTimer);
      saveDataTimer = null;
      if(!saveDataPending) return true;

      var flushVersion = saveDataVersion;
      saveDataPending = false;
      var ok = await saveDataImmediate();

      // Preserve a newer pending change or a failed save for a subsequent flush.
      if(!ok || saveDataVersion !== flushVersion){
        saveDataPending = true;
        if(!ok){
          scheduleSaveRetry();
        }else if(!saveDataTimer){
          saveDataTimer = setTimeout(flushSaveData, 400);
        }
      }else{
        saveRetryCount = 0;
        clearTimeout(saveRetryTimer);
        saveRetryTimer = null;
      }
      return ok && saveDataVersion === flushVersion;
    })();
    try{
      return await saveDataInFlight;
    }finally{
      saveDataInFlight = null;
    }
  }

  function saveData(){
    if(!storageReady) return false;
    saveDataPending = true;
    saveDataVersion += 1;
    saveRetryCount = 0;
    clearTimeout(saveRetryTimer);
    saveRetryTimer = null;
    clearTimeout(saveDataTimer);
    saveDataTimer = setTimeout(flushSaveData, 400);
    return true;
  }

  function flushPendingSaveOnLifecycle(){
    if(saveDataPending) flushSaveData();
  }

  window.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'hidden') flushPendingSaveOnLifecycle();
  });

  window.addEventListener('pagehide', flushPendingSaveOnLifecycle);

  // Keep beforeunload as a last-attempt fallback; lifecycle handlers above are preferred.
  window.addEventListener('beforeunload', flushPendingSaveOnLifecycle);

  function commitChange(){
    saveData();
    renderProjects();
    renderBottomHistory();
  }

  function getCurrentProject(){
    return appData.projects.find(function(p){ return p.id === appData.currentProjectId; }) || null;
  }

  function makeId(prefix){
    return prefix + '_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now() + '_' + Math.random().toString(16).slice(2));
  }

  function safeFilename(name){
    return (name || 'prung-aksorn').replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 80) || 'prung-aksorn';
  }

  function escapeHtml(str){
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtTime(ts){
    var d = new Date(ts);
    return d.toLocaleDateString('th-TH', {day:'2-digit',month:'2-digit'}) + ' ' + d.toLocaleTimeString('th-TH', {hour:'2-digit',minute:'2-digit'});
  }

  function levelDesc(l){
    if(l === 'proof') return 'พิสูจน์อักษรเบาๆ แก้เฉพาะจุดที่สะดุดหรือผิดหลักภาษา คงสำนวนและคำเดิมไว้ให้มากที่สุด';
    if(l === 'rewrite') return 'ขัดเกลาใหม่อย่างเต็มที่ ปรับจังหวะประโยคและสำนวนให้อ่านลื่นไหลสนุกที่สุดเท่าที่จะทำได้ โดยยังคงเนื้อเรื่องและความหมายเดิม';
    return 'เรียบเรียงระดับกลาง ปรับประโยคให้ลื่นไหลขึ้นอย่างเป็นธรรมชาติ แต่ยังคงลีลาและน้ำเสียงของผู้เขียนไว้';
  }
  function styleDesc(s){
    if(s === 'สำนวนย้อนยุค') return 'ใช้สำนวนภาษาไทยแบบย้อนยุค มีกลิ่นอายคำโบราณหรือคำที่ใช้ในนิยายพื้นบ้าน/กำลังภายใน/ยุคเก่า เพิ่มความขลังและบรรยากาศแบบดั้งเดิม';
    if(s === 'สำนวนร่วมสมัย') return 'ใช้สำนวนภาษาไทยร่วมสมัย อ่านลื่นเหมือนนิยายที่ตีพิมพ์ในปัจจุบัน จังหวะกระชับทันสมัย';
    if(s === 'สำนวนทางการ') return 'ใช้สำนวนภาษาไทยที่เป็นทางการ สุภาพ เรียบร้อย เหมาะกับงานเขียนเชิงวรรณกรรมหรือทางการ';
    return 'ใช้สำนวนภาษาไทยแบบปัจจุบันทั่วไปที่ผู้อ่านคุ้นเคย เป็นธรรมชาติในชีวิตประจำวัน';
  }
/* ---------------- Smart Relevant Glossary Filter ---------------- */
