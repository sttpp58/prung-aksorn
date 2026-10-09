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
    var chunks = splitIntoChunksForVersion(text, maxLen, 'v2');

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
  var modelPickerAddError = document.getElementById('modelPickerAddError');
  var activeModelProvider = providerSel.value || 'openai';

  var AI_MODEL_OPTIONS = {
    openai: [
      { id:'gpt-4o-mini', label:'GPT-4o Mini' },
      { id:'gpt-4o', label:'GPT-4o' },
      { id:'gpt-5-mini', label:'GPT-5 Mini' },
      { id:'gpt-5', label:'GPT-5' },
      { id:'gpt-5.5', label:'GPT-5.5' }
    ],
    gemini: [
      { id:'gemini-flash-latest', label:'Gemini Flash Latest' },
      { id:'gemini-2.5-flash', label:'Gemini 2.5 Flash' },
      { id:'gemini-2.5-flash-lite', label:'Gemini 2.5 Flash Lite' },
      { id:'gemini-2.5-pro', label:'Gemini 2.5 Pro' },
      { id:'gemini-3.1-pro', label:'Gemini 3.1 Pro' },
      { id:'gemini-3.1-flash-lite', label:'Gemini 3.1 Flash Lite' },
      { id:'gemini-3.5-flash', label:'Gemini 3.5 Flash' },
      { id:'gemini-3.5-flash-lite', label:'Gemini 3.5 Flash Lite' },
      { id:'gemini-3.6-flash', label:'Gemini 3.6 Flash' },
      { id:'gemma-4-26b-a4b-it', label:'Gemma 4 26B A4B IT' },
      { id:'gemma-4-31b-it', label:'Gemma 4 31B IT' },
      { id:'gemini-pro-latest', label:'Gemini Pro Latest' }
    ]
  };
  var AI_MODEL_DEFAULTS = { openai:'gpt-4o-mini', gemini:'gemini-flash-latest' };

  function normalizeCustomModelList(value){
    if(!Array.isArray(value)) return [];
    var seen = Object.create(null);
    return value.map(function(item){
      if(item && typeof item === 'object') return { id: String(item.id || '').trim() };
      return { id: String(item || '').trim() };
    }).filter(function(item){
      if(!item.id || seen[item.id]) return false;
      seen[item.id] = true;
      return true;
    });
  }

  function getCustomModelStore(){
    if(!appData.settings || typeof appData.settings !== 'object') appData.settings = {};
    var current = appData.settings.customModels;
    if(!current || typeof current !== 'object' || Array.isArray(current)){
      current = { openai: [], gemini: [] };
    }
    current.openai = normalizeCustomModelList(current.openai);
    current.gemini = normalizeCustomModelList(current.gemini);
    appData.settings.customModels = current;
    return current;
  }

  function getSelectedModelStore(){
    if(!appData.settings || typeof appData.settings !== 'object') appData.settings = {};
    var current = appData.settings.selectedModels;
    if(!current || typeof current !== 'object' || Array.isArray(current)) current = {};
    appData.settings.selectedModels = current;
    return current;
  }

  function getBuiltInModel(provider, modelId){
    return (AI_MODEL_OPTIONS[provider] || []).find(function(model){ return model.id === modelId; }) || null;
  }

  function getCustomModel(provider, modelId){
    return getCustomModelStore()[provider].find(function(model){ return model.id === modelId; }) || null;
  }

  function getModelOptionGroups(provider){
    return {
      builtIn: Array.isArray(AI_MODEL_OPTIONS[provider]) ? AI_MODEL_OPTIONS[provider].slice() : [],
      custom: getCustomModelStore()[provider].slice()
    };
  }

  function setModelPickerValue(model, persist){
    var next = String(model || '').trim();
    if(!next) return;
    modelInput.value = next;
    if(modelPickerValue) modelPickerValue.textContent = next;
    getSelectedModelStore()[providerSel.value || activeModelProvider] = next;
    if(persist) saveSettings();
  }

  function clearModelPickerAddError(){
    if(modelPickerAddError) modelPickerAddError.textContent = '';
  }

  function setModelPickerAddError(message){
    if(modelPickerAddError) modelPickerAddError.textContent = message || '';
  }

  function closeModelPickerAddForm(){
    if(!modelPickerAddForm) return;
    modelPickerAddForm.hidden = true;
    modelPickerAddInput.value = '';
    clearModelPickerAddError();
  }

  function closeModelPicker(){
    if(!modelPicker) return;
    modelPicker.classList.remove('open');
    modelPickerTrigger.setAttribute('aria-expanded','false');
  }

  function openModelPicker(){
    if(!modelPicker || modelPickerTrigger.disabled) return;
    clearModelPickerAddError();
    renderModelPicker();
    modelPicker.classList.add('open');
    modelPickerTrigger.setAttribute('aria-expanded','true');
  }

  function renderModelPicker(){
    if(!modelPickerList || !modelPickerValue) return;
    var provider = providerSel.value || 'openai';
    var current = String(modelInput.value || '').trim();
    var groups = getModelOptionGroups(provider);
    modelPickerValue.textContent = current || AI_MODEL_DEFAULTS[provider] || 'เลือกโมเดล';
    modelPickerList.innerHTML = '';

    function appendSectionLabel(label){
      var section = document.createElement('div');
      section.className = 'model-picker-section-label';
      section.textContent = label;
      modelPickerList.appendChild(section);
    }

    function appendOption(model, custom, legacy){
      var row = document.createElement('div');
      row.className = 'model-picker-option' + (model.id === current ? ' active' : '');
      row.setAttribute('role','option');
      row.setAttribute('aria-selected', model.id === current ? 'true' : 'false');

      var check = document.createElement('span');
      check.className = 'model-picker-check';
      check.textContent = model.id === current ? '✓' : '';
      row.appendChild(check);

      var main = document.createElement('button');
      main.type = 'button';
      main.className = 'model-picker-option-main';
      main.setAttribute('aria-label', 'เลือกโมเดล ' + model.id);

      var label = document.createElement('span');
      label.className = 'model-picker-option-label';
      label.textContent = model.label || model.id;
      main.appendChild(label);

      var id = document.createElement('span');
      id.className = 'model-picker-option-id';
      id.textContent = model.id;
      main.appendChild(id);

      main.addEventListener('click', function(){
        setModelPickerValue(model.id, true);
        closeModelPickerAddForm();
        closeModelPicker();
      });
      row.appendChild(main);

      if(custom && !legacy){
        var badge = document.createElement('span');
        badge.className = 'model-picker-custom-badge';
        badge.textContent = 'เพิ่มเอง';
        row.appendChild(badge);

        var deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'model-picker-delete-btn';
        deleteBtn.setAttribute('aria-label', 'ลบโมเดล ' + model.id);
        deleteBtn.textContent = '✕';
        deleteBtn.addEventListener('click', async function(e){
          e.stopPropagation();
          var ok = await showConfirmDialog(
            'ลบโมเดลที่เพิ่มเอง',
            'ต้องการลบโมเดล "' + model.id + '" ออกจากรายการหรือไม่?',
            true
          );
          if(!ok) return;

          var store = getCustomModelStore()[provider];
          getCustomModelStore()[provider] = store.filter(function(item){ return item.id !== model.id; });

          if(modelInput.value === model.id){
            var fallback = AI_MODEL_DEFAULTS[provider] || ((AI_MODEL_OPTIONS[provider] || [])[0] || {}).id;
            setModelPickerValue(fallback, false);
          }
          saveSettings();
          renderModelPicker();
        });
        row.appendChild(deleteBtn);
      }

      modelPickerList.appendChild(row);
    }

    appendSectionLabel('โมเดลแนะนำ');
    groups.builtIn.forEach(function(model){ appendOption(model, false, false); });

    if(groups.custom.length > 0){
      appendSectionLabel('โมเดลที่เพิ่มเอง');
      groups.custom.forEach(function(model){ appendOption(model, true, false); });
    }

    var known = groups.builtIn.some(function(model){ return model.id === current; }) ||
      groups.custom.some(function(model){ return model.id === current; });
    if(current && !known){
      appendSectionLabel('โมเดลที่บันทึกไว้เดิม');
      appendOption({ id:current, label:current }, false, true);
    }

    if(!groups.builtIn.length && !groups.custom.length && !current){
      var empty = document.createElement('div');
      empty.className = 'model-picker-empty';
      empty.textContent = 'ยังไม่มีโมเดลสำหรับผู้ให้บริการนี้';
      modelPickerList.appendChild(empty);
    }
  }

  function addCustomModel(){
    var next = String(modelPickerAddInput.value || '').trim();
    if(!next){
      setModelPickerAddError('กรุณาระบุ Model ID');
      modelPickerAddInput.focus();
      return;
    }
    if(next.length > 160){
      setModelPickerAddError('Model ID ยาวเกิน 160 ตัวอักษร');
      return;
    }
    if(/[\s\u0000-\u001f\u007f]/.test(next)){
      setModelPickerAddError('Model ID ต้องไม่มีช่องว่างหรืออักขระควบคุม');
      return;
    }

    var provider = providerSel.value || 'openai';
    var builtIn = getBuiltInModel(provider, next);
    var existing = getCustomModel(provider, next);
    if(builtIn){
      setModelPickerAddError('โมเดลนี้มีอยู่ในรายการแนะนำแล้ว');
      return;
    }
    if(existing){
      setModelPickerAddError('โมเดลนี้มีอยู่ในรายการที่เพิ่มเองแล้ว');
      return;
    }

    getCustomModelStore()[provider].push({ id: next });
    setModelPickerValue(next, true);
    clearModelPickerAddError();
    closeModelPickerAddForm();
    renderModelPicker();
  }

  function ensureModelCatalogSettings(legacyModel){
    getCustomModelStore();
    var selected = getSelectedModelStore();
    var provider = providerSel.value === 'gemini' ? 'gemini' : 'openai';
    var legacy = String(legacyModel || appData.settings.model || '').trim();
    if(!selected[provider] && legacy) selected[provider] = legacy;
    return selected;
  }

  function setModelPickerDisabled(disabled){
    if(modelPickerTrigger) modelPickerTrigger.disabled = !!disabled;
    if(modelPickerAddBtn) modelPickerAddBtn.disabled = !!disabled;
    if(modelPickerAddInput) modelPickerAddInput.disabled = !!disabled;
    if(modelPickerSaveBtn) modelPickerSaveBtn.disabled = !!disabled;
    if(modelPickerCancelBtn) modelPickerCancelBtn.disabled = !!disabled;
    if(disabled){
      closeModelPicker();
      closeModelPickerAddForm();
    }
  }

  providerSel.addEventListener('change', function(){
    var previousProvider = activeModelProvider;
    getCustomModelStore();
    var selected = getSelectedModelStore();
    var currentModel = String(modelInput.value || '').trim();
    if(previousProvider) selected[previousProvider] = currentModel;

    var nextProvider = providerSel.value === 'gemini' ? 'gemini' : 'openai';
    var nextModel = selected[nextProvider] || AI_MODEL_DEFAULTS[nextProvider];
    setModelPickerValue(nextModel, false);
    activeModelProvider = nextProvider;
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
    if(modelPickerTrigger.disabled) return;
    if(modelPickerAddForm.hidden){
      clearModelPickerAddError();
      modelPickerAddForm.hidden = false;
      modelPickerAddInput.focus();
    }else{
      closeModelPickerAddForm();
    }
  });

  modelPickerSaveBtn.addEventListener('click', addCustomModel);
  modelPickerCancelBtn.addEventListener('click', closeModelPickerAddForm);

  modelPickerAddInput.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      e.preventDefault();
      addCustomModel();
    }else if(e.key === 'Escape'){
      e.preventDefault();
      closeModelPickerAddForm();
    }
  });

  document.addEventListener('click', function(e){
    if(modelPicker && !modelPicker.contains(e.target)) closeModelPicker();
  });

  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && modelPicker && modelPicker.classList.contains('open')){
      closeModelPickerAddForm();
      closeModelPicker();
    }
  });

  ensureModelCatalogSettings();
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
