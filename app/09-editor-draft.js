  function setResultFocus(enabled){
    spread.classList.toggle('result-focus', !!enabled);
  }

  function setOutputFontSize(size, persist){
    outputFontSize = Math.max(13, Math.min(26, Math.round(Number(size) * 2) / 2 || 15.5));
    output.style.fontSize = outputFontSize + 'px';
    outputFontValue.textContent = outputFontSize;
    if(persist) saveSettings();
  }

  function updateTranslationSummary(){
    var source = document.querySelector('#sourceSeg button.active');
    var level = document.querySelector('#levelSeg button.active');
    var genre = document.querySelector('#genreChips .chip.active');
    var style = document.querySelector('#styleSeg button.active');
    document.getElementById('translationSummary').textContent = [source, level, genre, style].filter(Boolean).map(function(el){ return el.textContent.trim(); }).join(' · ');
  }

  function updateChunkInfo() {
    var text = inputText.value.trim();
    var infoSpan = document.getElementById('chunkInfo');
    if (!text) {
      infoSpan.textContent = '';
      return;
    }
    var maxLen = parseInt(document.getElementById('chunkLen').value) || 3000;
    var chars = text.length;
    var chunks = splitIntoChunks(text, maxLen);

    var str = '· ' + chars.toLocaleString() + ' อักขระ';
    if (chunks.length > 1) {
      str += ' (คิวส่ง AI ' + chunks.length + ' ส่วน)';
    }
    infoSpan.textContent = str;
  }

  function setOutput(text){
    output.textContent = text || '';
    outCount.textContent = countWords(output.textContent) + ' คำ';
    var hasOutput = !!output.textContent.trim();
    spread.classList.toggle('has-result', hasOutput);
    if(!hasOutput) stamp.classList.remove('show');
    hideGlossaryEnforce();
    copyBtn.disabled = !hasOutput;
    downloadBtn.disabled = !hasOutput;
    editOutputBtn.disabled = !hasOutput;
    saveRevisionBtn.disabled = !hasOutput;
    hideQualityWarning();
    resetTQGQualityPanel();
  }

  function loadProjectDraft(proj){
    if(!proj) return;
    var activeBook = getActiveBook(proj);
    if(!activeBook) return;
    viewingHistoryId = null;
    pendingResume = null;
    if(resumeBtn) resumeBtn.classList.remove('show');
    document.body.classList.remove('history-mode');
    historyViewBanner.classList.remove('show');
    historyViewBannerBottom.classList.remove('show');
    chapterTitle.value = activeBook.chapterTitle || '';
    inputText.value = activeBook.draft || '';
    inCount.textContent = countWords(inputText.value) + ' คำ';
    updateChunkInfo();
    highlightSuspicious(inputText.value);
    stamp.classList.remove('show');
    hideGlossaryEnforce();
    setOutput('');
    output.contentEditable = 'false';
    editOutputBtn.textContent = 'แก้ไขผลลัพธ์';
    setResultFocus(false);
    switchMobileTab('source');
    renderBottomHistory();
  }

  function flushPendingDraftSave(){
    clearTimeout(draftSaveTimer);
    draftSaveTimer = null;
    var context = draftSaveContext;
    draftSaveContext = null;
    draftSaveGeneration += 1;
    if(!context) return;

    var proj = appData.projects.find(function(p){ return p.id === context.projectId; }) || null;
    if(!proj || !context.bookId) return;
    var book = (proj.books || []).find(function(b){ return b.id === context.bookId; }) || null;
    if(!book) return;
    book.draft = context.draft;
    book.chapterTitle = context.chapterTitle;
  }

  function saveDraftSoon(){
    var proj = getCurrentProject();
    if(!proj) return;
    var activeBook = getActiveBook(proj);
    if(!activeBook) return;
    if(saveStatusText){
      saveStatusText.textContent = '⋯ กำลังบันทึก';
      saveStatusText.classList.add('saving');
    }
    clearTimeout(draftSaveTimer);

    var context = {
      generation: draftSaveGeneration + 1,
      projectId: proj.id,
      bookId: activeBook.id,
      draft: inputText.value,
      chapterTitle: chapterTitle.value.trim()
    };
    draftSaveGeneration = context.generation;
    draftSaveContext = context;

    draftSaveTimer = setTimeout(function(){
      if(!draftSaveContext || draftSaveContext.generation !== context.generation) return;
      draftSaveTimer = null;
      draftSaveContext = null;

      var targetProj = appData.projects.find(function(p){ return p.id === context.projectId; }) || null;
      if(!targetProj || !context.bookId) return;
      var targetBook = (targetProj.books || []).find(function(b){ return b.id === context.bookId; }) || null;
      if(!targetBook) return;
      targetBook.draft = context.draft;
      targetBook.chapterTitle = context.chapterTitle;
      saveData();
    }, 450);
  }

  function viewHistoryEntry(proj, entry, idx){
    viewingHistoryId = entry.id;
    document.body.classList.add('history-mode');
    chapterTitle.value = entry.label || '';
    inputText.value = entry.input;
    inCount.textContent = countWords(entry.input) + ' คำ';
    updateChunkInfo();
    highlightSuspicious('');
    setOutput(entry.output);
    output.contentEditable = 'false';
    editOutputBtn.textContent = 'แก้ไขผลลัพธ์';
    setResultFocus(true);
    stamp.classList.remove('show');
    requestAnimationFrame(function(){ stamp.classList.add('show'); });
    var label = entry.label || ('แปล' + (idx + 1));
    historyViewLabel.textContent = 'ดูประวัติ: ' + label;
    historyViewLabelBottom.textContent = 'ประวัติ: ' + label;
    historyViewBanner.classList.add('show');
    historyViewBannerBottom.classList.add('show');
    switchMobileTab('output');
    renderBottomHistory();
    scrollToTopTarget();
  }

  document.querySelectorAll('.close-history-btn').forEach(function(btn){
    btn.addEventListener('click', function(){
      viewingHistoryId = null;
      document.body.classList.remove('history-mode');
      historyViewBanner.classList.remove('show');
      historyViewBannerBottom.classList.remove('show');
      loadProjectDraft(getCurrentProject());
    });
  });

  document.getElementById('renameHistoryBtnBottom').addEventListener('click', async function(){
    var proj = getCurrentProject();
    if(!proj || !viewingHistoryId) return;
    var historyList = getActiveHistoryList(proj);
    var entry = historyList.find(function(h){ return h.id === viewingHistoryId; });
    if(!entry) return;
    var newLabel = await showPromptDialog('ตั้งชื่อตอนแปลนี้', entry.label || '');
    if(newLabel && newLabel.trim()){
      entry.label = newLabel.trim();
      commitChange();
      historyViewLabel.textContent = 'ดูประวัติ: ' + entry.label;
      historyViewLabelBottom.textContent = 'ประวัติ: ' + entry.label;
    }
  });

  document.getElementById('deleteHistoryBtnBottom').addEventListener('click', async function(){
    var proj = getCurrentProject();
    if(!proj || !viewingHistoryId) return;
    var activeBook = getActiveBook(proj);
    var historyList = getActiveHistoryList(proj);
    var entry = historyList.find(function(h){ return h.id === viewingHistoryId; });
    if(!entry) return;
    var ok = await showConfirmDialog('ลบประวัติการแปล', 'ต้องการลบ "' + (entry.label || 'ตอนนี้') + '" หรือไม่? การลบไม่สามารถย้อนกลับได้', true);
    if(ok){
      var filtered = historyList.filter(function(h){ return h.id !== entry.id; });
      if(activeBook) activeBook.history = filtered;
      else proj.history = filtered;

      commitChange();
      viewingHistoryId = null;
      document.body.classList.remove('history-mode');
      historyViewBanner.classList.remove('show');
      historyViewBannerBottom.classList.remove('show');
      loadProjectDraft(proj);
    }
  });

  var gearBtn = document.getElementById('gearBtn');
  var settingsPanel = document.getElementById('settingsPanel');
  gearBtn.addEventListener('click', function(){ settingsPanel.classList.toggle('open'); });

  var translationModal = document.getElementById('translationModal');
  var translationSettingsBtn = document.getElementById('translationSettingsBtn');
  var translationModalClose = document.getElementById('translationModalClose');
  function closeTranslationModal(){
    translationModal.classList.remove('open');
    translationModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }
  function openTranslationModal(){
    translationModal.classList.add('open');
    translationModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }
  translationSettingsBtn.addEventListener('click', openTranslationModal);
  translationModalClose.addEventListener('click', closeTranslationModal);

  var providerSel = document.getElementById('provider');
  var modelInput = document.getElementById('model');
  var modelPicker = document.getElementById('modelPicker');
  var modelPickerTrigger = document.getElementById('modelPickerTrigger');
  var modelPickerValue = document.getElementById('modelPickerValue');
  var modelPickerList = document.getElementById('modelPickerList');
  var modelPickerAddBtn = document.getElementById('modelPickerAddBtn');
  var modelPickerAddForm = document.getElementById('modelPickerAddForm');
  var modelPickerAddInput = document.getElementById('modelPickerAddInput');
  var modelPickerSaveBtn = document.getElementById('modelPickerSaveBtn');
  var modelPickerCancelBtn = document.getElementById('modelPickerCancelBtn');

  var AI_MODEL_OPTIONS = {
    openai: ['gpt-4o-mini','gpt-4o','gpt-5-mini','gpt-5','gpt-5.5'],
    gemini: [
      'gemini-flash-latest','gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.5-pro',
      'gemini-3.1-pro','gemini-3.1-flash-lite','gemini-3.5-flash','gemini-3.5-flash-lite',
      'gemini-3.6-flash','gemma-4-26b-a4b-it','gemma-4-31b-it','gemini-pro-latest'
    ]
  };
  var AI_MODEL_DEFAULTS = { openai:'gpt-4o-mini', gemini:'gemini-flash-latest' };

  function getCustomModelStore(){
    if(!appData.settings || typeof appData.settings !== 'object') appData.settings = {};
    if(!appData.settings.customModels || typeof appData.settings.customModels !== 'object'){
      appData.settings.customModels = { openai: [], gemini: [] };
    }
    ['openai','gemini'].forEach(function(provider){
      if(!Array.isArray(appData.settings.customModels[provider])) appData.settings.customModels[provider] = [];
    });
    return appData.settings.customModels;
  }

  function getModelOptions(provider){
    var builtIn = Array.isArray(AI_MODEL_OPTIONS[provider]) ? AI_MODEL_OPTIONS[provider].slice() : [];
    var custom = getCustomModelStore()[provider].filter(function(model){
      return model && builtIn.indexOf(model) === -1;
    });
    return { builtIn: builtIn, custom: custom };
  }

  function setModelPickerValue(model, persist){
    var next = String(model || '').trim();
    if(!next) return;
    modelInput.value = next;
    if(modelPickerValue) modelPickerValue.textContent = next;
    if(persist) saveSettings();
  }

  function closeModelPicker(){
    if(!modelPicker) return;
    modelPicker.classList.remove('open');
    modelPickerTrigger.setAttribute('aria-expanded','false');
  }

  function openModelPicker(){
    if(modelInput.disabled) return;
    renderModelPicker();
    modelPicker.classList.add('open');
    modelPickerTrigger.setAttribute('aria-expanded','true');
  }

  function renderModelPicker(){
    if(!modelPickerList || !modelPickerValue) return;
    var provider = providerSel.value;
    var current = String(modelInput.value || '').trim();
    var options = getModelOptions(provider);
    modelPickerValue.textContent = current || AI_MODEL_DEFAULTS[provider] || 'เลือกโมเดล';
    modelPickerList.innerHTML = '';

    function appendSectionLabel(label){
      var section = document.createElement('div');
      section.className = 'model-picker-section-label';
      section.textContent = label;
      modelPickerList.appendChild(section);
    }

    function appendOption(model, custom){
      var option = document.createElement('button');
      option.type = 'button';
      option.className = 'model-picker-option' + (model === current ? ' active' : '');
      option.setAttribute('role','option');
      option.setAttribute('aria-selected', model === current ? 'true' : 'false');
      option.dataset.model = model;

      var name = document.createElement('span');
      name.className = 'model-picker-option-name';
      name.textContent = model;
      option.appendChild(name);

      if(custom){
        var badge = document.createElement('span');
        badge.className = 'model-picker-custom-badge';
        badge.textContent = 'เพิ่มเอง';
        option.appendChild(badge);
      }

      option.addEventListener('click', function(){
        setModelPickerValue(model, true);
        closeModelPicker();
      });
      modelPickerList.appendChild(option);
    }

    appendSectionLabel('โมเดลแนะนำ');
    options.builtIn.forEach(function(model){ appendOption(model, false); });

    var allKnown = options.builtIn.concat(options.custom);
    if(options.custom.length > 0 || (current && allKnown.indexOf(current) === -1)){
      appendSectionLabel('โมเดลของฉัน');
      options.custom.forEach(function(model){ appendOption(model, true); });
      if(current && allKnown.indexOf(current) === -1) appendOption(current, true);
    }
  }

  function closeModelPickerAddForm(){
    if(!modelPickerAddForm) return;
    modelPickerAddForm.hidden = true;
    modelPickerAddInput.value = '';
  }

  function openModelPickerAddForm(){
    if(modelInput.disabled) return;
    modelPickerAddForm.hidden = false;
    modelPickerAddInput.focus();
  }

  function addCustomModel(){
    var next = String(modelPickerAddInput.value || '').trim();
    if(!next) return;
    var provider = providerSel.value;
    var store = getCustomModelStore()[provider];
    var builtIn = AI_MODEL_OPTIONS[provider] || [];
    if(store.indexOf(next) === -1 && builtIn.indexOf(next) === -1) store.push(next);
    setModelPickerValue(next, true);
    renderModelPicker();
    closeModelPickerAddForm();
    closeModelPicker();
  }

  providerSel.addEventListener('change', function(){
    modelInput.value = AI_MODEL_DEFAULTS[providerSel.value] || 'gpt-4o-mini';
    renderModelPicker();
    closeModelPickerAddForm();
    saveSettings();
  });
  modelPickerTrigger.addEventListener('click', function(e){
    e.stopPropagation();
    if(modelPicker.classList.contains('open')) closeModelPicker();
    else openModelPicker();
  });
  modelPickerAddBtn.addEventListener('click', function(e){
    e.stopPropagation();
    openModelPickerAddForm();
  });
  modelPickerSaveBtn.addEventListener('click', addCustomModel);
  modelPickerCancelBtn.addEventListener('click', function(){ closeModelPickerAddForm(); });
  modelPickerAddInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); addCustomModel(); }
    if(e.key === 'Escape'){ e.preventDefault(); closeModelPickerAddForm(); }
  });
  document.addEventListener('click', function(e){
    if(modelPicker && !modelPicker.contains(e.target)) closeModelPicker();
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && modelPicker && modelPicker.classList.contains('open')){
      closeModelPicker();
      closeModelPickerAddForm();
    }
  });

  renderModelPicker();
  document.getElementById('chunkLen').addEventListener('change', function(){
    saveSettings();
    updateChunkInfo();
  });

  function wireSeg(id, key){
    var seg = document.getElementById(id);
    seg.addEventListener('click', function(e){
      var btn = e.target.closest('button');
      if(!btn) return;
      seg.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      state[key] = btn.dataset.val;
      saveSettings();
      updateTranslationSummary();
    });
  }
  wireSeg('sourceSeg', 'source');
  wireSeg('levelSeg', 'level');
  wireSeg('styleSeg', 'style');

  var chips = document.getElementById('genreChips');
  chips.addEventListener('click', function(e){
    var chip = e.target.closest('.chip');
    if(!chip) return;
    chips.querySelectorAll('.chip').forEach(function(c){ c.classList.remove('active'); });
    chip.classList.add('active');
    state.genre = chip.dataset.val;
    saveSettings();
    updateTranslationSummary();
  });

  var errorBox = document.getElementById('errorBox');
