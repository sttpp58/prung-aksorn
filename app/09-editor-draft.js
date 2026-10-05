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
    document.getElementById('translationSummary').textContent = [source, level, genre, style].filter(Boolean).map(function(el){ return el.textContent.trim(); }).join(' ยท ');
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

    var str = 'ยท ' + chars.toLocaleString() + ' เธญเธฑเธเธเธฃเธฐ';
    if (chunks.length > 1) {
      str += ' (เธเธดเธงเธชเนเธ AI ' + chunks.length + ' เธชเนเธงเธ)';
    }
    infoSpan.textContent = str;
  }

  function setOutput(text){
    output.textContent = text || '';
    outCount.textContent = countWords(output.textContent) + ' เธเธณ';
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
    inCount.textContent = countWords(inputText.value) + ' เธเธณ';
    updateChunkInfo();
    highlightSuspicious(inputText.value);
    stamp.classList.remove('show');
    hideGlossaryEnforce();
    setOutput('');
    output.contentEditable = 'false';
    editOutputBtn.textContent = 'เนเธเนเนเธเธเธฅเธฅเธฑเธเธเน';
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
      saveStatusText.textContent = 'โฏ เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ';
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
    inCount.textContent = countWords(entry.input) + ' เธเธณ';
    updateChunkInfo();
    highlightSuspicious('');
    setOutput(entry.output);
    output.contentEditable = 'false';
    editOutputBtn.textContent = 'เนเธเนเนเธเธเธฅเธฅเธฑเธเธเน';
    setResultFocus(true);
    stamp.classList.remove('show');
    requestAnimationFrame(function(){ stamp.classList.add('show'); });
    var label = entry.label || ('เนเธเธฅ' + (idx + 1));
    historyViewLabel.textContent = 'เธ”เธนเธเธฃเธฐเธงเธฑเธ•เธด: ' + label;
    historyViewLabelBottom.textContent = 'เธเธฃเธฐเธงเธฑเธ•เธด: ' + label;
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
    var newLabel = await showPromptDialog('เธ•เธฑเนเธเธเธทเนเธญเธ•เธญเธเนเธเธฅเธเธตเน', entry.label || '');
    if(newLabel && newLabel.trim()){
      entry.label = newLabel.trim();
      commitChange();
      historyViewLabel.textContent = 'เธ”เธนเธเธฃเธฐเธงเธฑเธ•เธด: ' + entry.label;
      historyViewLabelBottom.textContent = 'เธเธฃเธฐเธงเธฑเธ•เธด: ' + entry.label;
    }
  });

  document.getElementById('deleteHistoryBtnBottom').addEventListener('click', async function(){
    var proj = getCurrentProject();
    if(!proj || !viewingHistoryId) return;
    var activeBook = getActiveBook(proj);
    var historyList = getActiveHistoryList(proj);
    var entry = historyList.find(function(h){ return h.id === viewingHistoryId; });
    if(!entry) return;
    var ok = await showConfirmDialog('เธฅเธเธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเนเธเธฅ', 'เธ•เนเธญเธเธเธฒเธฃเธฅเธ "' + (entry.label || 'เธ•เธญเธเธเธตเน') + '" เธซเธฃเธทเธญเนเธกเน? เธเธฒเธฃเธฅเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเนเธญเธเธเธฅเธฑเธเนเธ”เน', true);
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
  providerSel.addEventListener('change', function(){
    modelInput.value = providerSel.value === 'openai' ? 'gpt-4o-mini' : 'gemini-flash-latest';
    saveSettings();
  });
  modelInput.addEventListener('change', saveSettings);
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
