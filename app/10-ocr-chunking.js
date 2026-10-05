  // Defense-in-depth boundary for unexpected browser/runtime failures.
  window.addEventListener('unhandledrejection', function(event){
    var reason = event && event.reason;
    if(reason && reason.name === 'AbortError') return;
    console.error('Unhandled Promise rejection:', reason);
  });
  window.addEventListener('error', function(event){
    console.error('Unhandled runtime error:', event && (event.error || event.message));
  });
  var processBtn = document.getElementById('processBtn');
  var copyBtn = document.getElementById('copyBtn');
  var downloadBtn = document.getElementById('downloadBtn');
  var editOutputBtn = document.getElementById('editOutputBtn');
  var saveRevisionBtn = document.getElementById('saveRevisionBtn');
  var clearBtn = document.getElementById('clearBtn');
  var cancelBtn = document.getElementById('cancelBtn');
  var resumeBtn = document.getElementById('resumeBtn');
  var repairBtn = document.getElementById('repairBtn');
  var quickRepairBtn = document.getElementById('quickRepairBtn');
  var progressText = document.getElementById('progressText');
  var mobileProcessBtn = document.getElementById('mobileProcessBtn');

  if(mobileProcessBtn){
    mobileProcessBtn.addEventListener('click', function(){ processBtn.click(); });
  }

  document.addEventListener('keydown', function(e){
    if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
      e.preventDefault();
      processBtn.click();
    }
    if((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'r' || e.key === 'R')){
      e.preventDefault();
      repairBtn.click();
    }
    if(e.key === 'Escape'){
      if(document.body.classList.contains('zen-mode')) toggleZenMode(false);
      else if(translationModal.classList.contains('open')) closeTranslationModal();
      else if(settingsPanel.classList.contains('open')) settingsPanel.classList.remove('open');
      else if(glossaryModal && glossaryModal.classList.contains('show')) closeGlossaryReviewModal(false);
      else if(readerOverlay.classList.contains('show') && !readerTocDrawer.classList.contains('open')) closeReaderMode();
    }
  });

  document.getElementById('outputFontDown').addEventListener('click', function(){ setOutputFontSize(outputFontSize - 1, true); });
  document.getElementById('outputFontUp').addEventListener('click', function(){ setOutputFontSize(outputFontSize + 1, true); });
  document.getElementById('expandSourceBtn').addEventListener('click', function(){ setResultFocus(false); inputText.focus(); });
  document.getElementById('collapseSourceBtn').addEventListener('click', function(){ setResultFocus(true); });

  chapterTitle.addEventListener('input', saveDraftSoon);

  inputText.addEventListener('input', function(){
    inCount.textContent = countWords(inputText.value) + ' เธเธณ';
    updateChunkInfo();
    highlightSuspicious(inputText.value);
    saveDraftSoon();
  });

  var chapterHeadingRegex = /^[ \t]*(?:(?:เธ•เธญเธเธ—เธตเน|เธ•เธญเธ—เธตเน|เธ•เธญเธ|เธเธ—เธ—เธตเน|เธเธ—|chapter|ch\.|episode|ep\.|็ฌฌ)[ \t]*[0-9ใ€้ถไธ€ไบไธๅไบ”ๅ…ญไธๅ…ซไนๅ็พๅไธค]+(?:[ \t]*็ซ )?|(?:เธเธ—เธเธณ|เธเธ—เธณ|เธเธ—เธชเนเธเธ—เนเธฒเธข|prologue|epilogue|็•ชๅค–)).*$/i;

  inputText.addEventListener('paste', function(e) {
    e.preventDefault();
    var pasteText = (e.clipboardData || window.clipboardData).getData('text');
    if (!pasteText) return;

    pasteText = normalizeOCR(pasteText);
    var lines = pasteText.split('\n');
    var firstContentLineIdx = -1;

    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() !== '') {
        firstContentLineIdx = i;
        break;
      }
    }

    var extracted = false;
    if (firstContentLineIdx !== -1) {
      var firstLine = lines[firstContentLineIdx].trim();
      if (chapterHeadingRegex.test(firstLine) && chapterTitle.value.trim() === '') {
        chapterTitle.value = firstLine;
        lines.splice(firstContentLineIdx, 1);
        extracted = true;
      }
    }

    var finalPasteText = lines.join('\n').replace(/^\s+/, '');
    var start = this.selectionStart;
    var end = this.selectionEnd;
    var currentVal = this.value;

    this.value = currentVal.substring(0, start) + finalPasteText + currentVal.substring(end);
    this.selectionStart = this.selectionEnd = start + finalPasteText.length;

    this.dispatchEvent(new Event('input'));

    if (extracted) {
      chapterTitle.dispatchEvent(new Event('input'));
      progressText.textContent = 'เธเนเธญเธกเธเธญเธเธ•เน & เธ”เธถเธเธเธทเนเธญเธ•เธญเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเน€เธฃเธตเธขเธเธฃเนเธญเธข';
    } else {
      progressText.textContent = 'เธเธฅเธตเธเธญเธฑเธเธฉเธฃเธเธขเธฐเธเธฒเธ OCR เนเธซเนเน€เธฃเธตเธขเธเธฃเนเธญเธข';
    }
    setTimeout(function(){ progressText.textContent = ''; }, 2500);
  });

  clearBtn.addEventListener('click', async function(){
    if (inputText.value.trim() !== '' || output.textContent.trim() !== '') {
      var ok = await showConfirmDialog('เธฅเนเธฒเธเธเนเธญเธเธงเธฒเธก', 'เธ•เนเธญเธเธเธฒเธฃเธฅเนเธฒเธเธเนเธญเธเธงเธฒเธกเนเธฅเธฐเธเธฅเธฅเธฑเธเธเนเธ—เธฑเนเธเธซเธกเธ” เน€เธเธทเนเธญเน€เธ•เธฃเธตเธขเธกเนเธเธฅเน€เธเธทเนเธญเธซเธฒเนเธซเธกเนเนเธเนเธซเธฃเธทเธญเนเธกเน?\n\n(เธซเธฒเธเธขเธฑเธเนเธกเนเนเธ”เนเธเธฑเธเธ—เธถเธเธเธเธฑเธเนเธเนเนเธ เธเนเธญเธกเธนเธฅเธ—เธตเนเธขเธฑเธเนเธกเนเธเธฑเธเธ—เธถเธเธเธฐเธซเธฒเธขเนเธ)', true);
      if(!ok) return;
    }

    advanceAppContextGeneration();
    chapterTitle.value = '';
    inputText.value = '';
    inCount.textContent = '0 เธเธณ';
    updateChunkInfo();
    highlightSuspicious('');

    hideGlossaryEnforce();
    setOutput('');
    output.contentEditable = 'false';
    editOutputBtn.textContent = 'เนเธเนเนเธเธเธฅเธฅเธฑเธเธเน';
    stamp.classList.remove('show');

    if(viewingHistoryId){
      viewingHistoryId = null;
      document.body.classList.remove('history-mode');
      historyViewBanner.classList.remove('show');
      historyViewBannerBottom.classList.remove('show');
      setResultFocus(false);
    }
    switchMobileTab('source');
    saveDraftSoon();
  });

  output.addEventListener('input', function(){
    outCount.textContent = countWords(output.textContent) + ' เธเธณ';
    saveRevisionBtn.disabled = !output.textContent.trim();
  });
  editOutputBtn.addEventListener('click', function(){
    var editing = output.contentEditable === 'true';
    output.contentEditable = editing ? 'false' : 'true';
    editOutputBtn.textContent = editing ? 'เนเธเนเนเธเธเธฅเธฅเธฑเธเธเน' : 'เน€เธชเธฃเนเธเธชเธดเนเธ';
    if(!editing) output.focus();
  });

  saveRevisionBtn.addEventListener('click', async function(){
    var proj = getCurrentProject();
    var revised = output.textContent.trim();
    if(!proj || !revised) return;
    var label = await showPromptDialog('เธ•เธฑเนเธเธเธทเนเธญเธเธเธฑเธเนเธเนเนเธ', (chapterTitle.value || 'เธเธเธฑเธเนเธเนเนเธ'));
    if(!label) return;
    var newEntry = {
      id: makeId('h'), ts: Date.now(), label: label.trim(),
      input: inputText.value, output: revised,
      source: state.source, level: state.level, genre: state.genre, style: state.style,
      parentId: viewingHistoryId || null
    };
    var activeBook = getActiveBook(proj);
    if(activeBook) activeBook.history.push(newEntry);
    else (proj.history = proj.history || []).push(newEntry);

    viewingHistoryId = newEntry.id;
    commitChange();
    progressText.textContent = 'เธเธฑเธเธ—เธถเธเน€เธฃเธตเธขเธเธฃเนเธญเธข';
    setTimeout(function(){ progressText.textContent = ''; }, 1500);
  });

  document.getElementById('importTextBtn').addEventListener('click', function(){ document.getElementById('textFile').click(); });
  var batchImportBtn = document.getElementById('batchImportBtn');
  var batchFileInput = document.getElementById('batchFileInput');
  batchImportBtn.addEventListener('click', function(){ batchFileInput.click(); });
  batchFileInput.addEventListener('change', function(e){
    var files = Array.from(e.target.files || []);
    e.target.value = '';
    if(files.length) runBatchImport(files);
  });
  document.getElementById('textFile').addEventListener('change', async function(e){
    var file = e.target.files[0];
    e.target.value = '';
    if(!file) return;

    var rawText;
    try{
      rawText = await readFileAsText(file);
    }catch(err){
      showError('เธญเนเธฒเธเนเธเธฅเนเนเธกเนเธชเธณเน€เธฃเนเธ: ' + (err.message || ''));
      return;
    }

    var segments = detectChapterSplits(rawText);
    if(segments){
      var wantSplit = await showConfirmDialog(
        'เธเธเธซเธฅเธฒเธขเธ•เธญเธเนเธเนเธเธฅเนเธเธตเน',
        'เธ•เธฃเธงเธเธเธเธฃเธนเธเนเธเธเธซเธฑเธงเธเนเธญเธ•เธญเธเนเธเนเธเธฅเนเธ—เธฑเนเธเธซเธกเธ” ' + segments.length + ' เธ•เธญเธ (เน€เธเนเธ "' + segments[0].label + '") เธ•เนเธญเธเธเธฒเธฃเนเธเนเธเนเธฅเธฐเนเธเธฅเธ—เธตเธฅเธฐเธ•เธญเธเธญเธฑเธ•เนเธเธกเธฑเธ•เธดเธซเธฃเธทเธญเนเธกเน?\n\nเธเธ” "เธขเธเน€เธฅเธดเธ" เน€เธเธทเนเธญเธเธณเน€เธเนเธฒเธ—เธฑเนเธเนเธเธฅเนเน€เธเนเธเธเนเธญเธเน€เธ”เธตเธขเธงเนเธเธเน€เธ”เธดเธกเนเธ—เธ'
      );
      if(wantSplit){
        var proj = getCurrentProject();
        var key = document.getElementById('apiKey').value.trim();
        if(!proj){ showError('เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธซเธฃเธทเธญเธชเธฃเนเธฒเธเน€เธฃเธทเนเธญเธเธเธดเธขเธฒเธขเธเนเธญเธ'); return; }
        if(!key){ showError('เธเธฃเธธเธ“เธฒเนเธชเน API Key เธเนเธญเธ'); return; }
        var virtualFiles = segments.map(function(seg){
          return { name: safeFilename(seg.label) + '.txt', __virtualText: seg.text };
        });
        runBatchImport(virtualFiles);
        return;
      }
    }

    inputText.value = rawText;
    inCount.textContent = countWords(inputText.value) + ' เธเธณ';
    updateChunkInfo();
    highlightSuspicious(inputText.value);
    saveDraftSoon();
  });

  document.getElementById('exportBackupBtn').addEventListener('click', async function(){
    try{
      var flushed = await flushSaveData();
      if(!flushed){ await showAlertDialog('เธชเธณเธฃเธญเธเธเนเธญเธกเธนเธฅเนเธกเนเธชเธณเน€เธฃเนเธ', 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธฑเธเธ—เธถเธเธเนเธญเธกเธนเธฅเธฅเนเธฒเธชเธธเธ”เธฅเธเธเธฒเธเธเนเธญเธกเธนเธฅเนเธ”เน'); return; }
      var payload = await storageV2.exportBackup();
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'prung-aksorn-backup-v2-' + new Date().toISOString().slice(0,10) + '.json';
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 0);
    }catch(err){
      console.error('Backup export failed:', err);
      await showAlertDialog('เธชเธณเธฃเธญเธเธเนเธญเธกเธนเธฅเนเธกเนเธชเธณเน€เธฃเนเธ', 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธชเธฃเนเธฒเธเนเธเธฅเนเธชเธณเธฃเธญเธเธเนเธญเธกเธนเธฅเธ—เธตเนเธกเธตเธเธงเธฒเธกเธชเธกเธเธนเธฃเธ“เนเนเธ”เน');
    }
  });

  document.getElementById('importBackupBtn').addEventListener('click', function(){ document.getElementById('backupFile').click(); });
  document.getElementById('backupFile').addEventListener('change', function(e){
    var file = e.target.files[0];
    if(!file) return;
    var reader = new FileReader();
    reader.onload = async function(){
      try {
        var rawParsed = JSON.parse(String(reader.result || ''));
        var format = storageV2.detectBackupFormat(rawParsed);
        if(format === 'unknown'){
          throw new Error('เนเธกเนเธฃเธนเนเธเธฑเธเธฃเธนเธเนเธเธเนเธเธฅเนเธชเธณเธฃเธญเธเธเธตเน เธฃเธฐเธเธเธฃเธญเธเธฃเธฑเธ Backup V2 เนเธฅเธฐ Backup เธฃเธธเนเธเน€เธเนเธฒเธเนเธญเธ V2 เน€เธ—เนเธฒเธเธฑเนเธ');
        }

        var checked = await storageV2.validateBackup(rawParsed);
        var r = checked.report;
        var summary;
        if(format === 'legacy'){
          summary = 'เธเธเนเธเธฅเน Backup เธฃเธธเนเธเน€เธเนเธฒ\n\n' +
            'เธฃเธฐเธเธเธเธฐเธ—เธณเธเธฒเธฃเนเธเธฅเธ Legacy โ’ V2 Normalized เธเนเธญเธเธเธนเนเธเธทเธ\n' +
            'Projects: '+r.projects+'\nBooks: '+r.books+'\nChapters: '+r.chapters+'\nGlossary: '+r.glossary+'\nRevisions: '+r.revisions+'\n\n' +
            'SHA-256: VALID (เธเธณเธเธงเธ“เนเธซเธกเนเธเธฒเธเธเนเธญเธกเธนเธฅ V2 เธ—เธตเนเนเธเธฅเธเนเธฅเนเธง)\n' +
            'Schema เธเธฅเธฒเธขเธ—เธฒเธ: 2 (supported)\n\n' +
            'เธฃเธฐเธเธเธเธฐเนเธกเนเธชเธฃเนเธฒเธเธซเธฃเธทเธญเธเธนเนเธเธทเธ Translation Jobs เนเธฅเธฐเธเธฐเธชเธฃเนเธฒเธ Safety Backup เธญเธฑเธ•เนเธเธกเธฑเธ•เธดเธเนเธญเธเนเธ—เธเธ—เธตเนเธเนเธญเธกเธนเธฅเธเธฑเธเธเธธเธเธฑเธ';
        }else{
          summary = 'Projects: '+r.projects+'\nBooks: '+r.books+'\nChapters: '+r.chapters+'\nGlossary: '+r.glossary+'\nRevisions: '+r.revisions+'\n\nSHA-256: VALID\nSchema: 2 (supported)\n\nเธเธฒเธฃเธเธนเนเธเธทเธเธเธฐเนเธ—เธเธ—เธตเนเธเนเธญเธกเธนเธฅเธเธฑเธเธเธธเธเธฑเธเธ—เธฑเนเธเธซเธกเธ” เนเธฅเธฐเธฃเธฐเธเธเธเธฐเธชเธฃเนเธฒเธ Safety Backup เธญเธฑเธ•เนเธเธกเธฑเธ•เธดเธเนเธญเธเธ”เธณเน€เธเธดเธเธเธฒเธฃ';
        }

        if(await showConfirmDialog('เธขเธทเธเธขเธฑเธเธเธฒเธฃเธเธนเนเธเธทเธเธเนเธญเธกเธนเธฅ', summary, true, 'เธ•เธเธฅเธ')){
          var result = await storageV2.restoreBackup(rawParsed);
          if(!result.success) throw new Error('Restore did not complete.');
          await loadData();
          applySettingsToUI();
          renderProjects();
          renderBottomHistory();
          updateActiveBanner();
          loadProjectDraft(getCurrentProject());
          await showAlertDialog(
            'เธเธนเนเธเธทเธเธชเธณเน€เธฃเนเธ',
            format === 'legacy'
              ? 'เธเธนเนเธเธทเธ Backup เธฃเธธเนเธเน€เธเนเธฒเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง เธฃเธฐเธเธเนเธ”เนเนเธเธฅเธเธเนเธญเธกเธนเธฅเน€เธเนเธ V2 เนเธฅเธฐเธ•เธฃเธงเธเธชเธญเธเธเธฒเธเธเนเธญเธกเธนเธฅเธซเธฅเธฑเธเธเธฒเธฃเธเธนเนเธเธทเธเธชเธณเน€เธฃเนเธ'
              : 'เธเธนเนเธเธทเธเธเนเธญเธกเธนเธฅเนเธฅเธฐเธ•เธฃเธงเธเธชเธญเธเธเธฒเธเธเนเธญเธกเธนเธฅเธซเธฅเธฑเธเธเธฒเธฃเธเธนเนเธเธทเธเน€เธฃเธตเธขเธเธฃเนเธญเธขเนเธฅเนเธง'
          );
        }
      } catch(err) {
        console.error('Backup restore failed:', err);
        var msg = String(err&&err.message || 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธนเนเธเธทเธเนเธเธฅเนเธชเธณเธฃเธญเธเนเธ”เน');
        if(msg.indexOf('rolled back safely')>=0){
          await showAlertDialog('เธเธนเนเธเธทเธเนเธกเนเธชเธณเน€เธฃเนเธ', msg+'\n\nเธเนเธญเธกเธนเธฅเน€เธ”เธดเธกเธ–เธนเธเธเธณเธเธฅเธฑเธเธเธทเธเนเธฅเนเธง');
        }else if(msg.indexOf('rollback failed')>=0){
          await showAlertDialog('เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เธฃเนเธฒเธขเนเธฃเธ', msg+'\n\nเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเธทเธเธขเธฑเธเธชเธ–เธฒเธเธฐเธเนเธญเธกเธนเธฅเนเธ”เน');
        }else{
          await showAlertDialog('เนเธเธฅเนเธชเธณเธฃเธญเธเนเธกเนเธ–เธนเธเธ•เนเธญเธ', msg);
        }
      }
    };
    reader.onerror = function(){
      console.error('Backup file read failed:', reader.error || file.name);
      showAlertDialog('เธญเนเธฒเธเนเธเธฅเนเธชเธณเธฃเธญเธเนเธกเนเธชเธณเน€เธฃเนเธ', 'เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธญเนเธฒเธเนเธเธฅเน Backup เธ—เธตเนเน€เธฅเธทเธญเธเนเธ”เน เธเธฃเธธเธ“เธฒเธฅเธญเธเนเธเธฅเนเธญเธทเนเธเธญเธตเธเธเธฃเธฑเนเธ').catch(function(dialogErr){
        console.error('Backup file read error dialog failed:', dialogErr);
      });
    };
    reader.onabort = function(){
      console.warn('Backup file read aborted:', file.name);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

/* ---------------- เธเธฑเธเธเนเธเธฑเธเธ—เธณเธเธงเธฒเธกเธชเธฐเธญเธฒเธ”เธญเธฑเธเธเธฃเธฐเธเธขเธฐ, เธชเธฃเธฐเน€เธเธตเนเธขเธ & เนเธเธฉเธ“เธฒเน€เธงเนเธ ---------------- */
  function normalizeOCR(text){
    if(!text) return '';

    // 1. เนเธเธฅเธเธฃเธซเธฑเธช PUA เธเธทเนเธเธเธฒเธเน€เธ”เธดเธก 8 เธ•เธฑเธง
    var puaMap = {
      '\uE200': 'เธ', '\uE201': 'เธ', '\uE202': 'เธ', '\uE203': 'เธ”',
      '\uE204': 'เธ', '\uE205': 'เธ', '\uE206': 'เธก', '\uE207': 'เธฃ'
    };
    text = text.replace(/[\uE200-\uE207]/g, function(m){ return puaMap[m] || m; });

    // 2. เธฅเธเธเนเธญเธเธงเธฒเธกเธเธขเธฐ เนเธเธฉเธ“เธฒ เธเธธเนเธกเธเธณเธ—เธฒเธ เนเธฅเธฐ Video Player Artifacts เธเธฒเธเน€เธงเนเธเธเธดเธขเธฒเธข
    text = text
      // เธฅเธเธเธธเนเธก Previous/Next Chapter เนเธฅเธฐ Table of Contents
      .replace(/^[ \t]*(?:[โ€น<ยซ]?[ \t]*(?:Previous|Next)[ \t]*Chapter[ \t]*[โ€บ>ยป]?|Table of Contents|Back to list)[ \t]*$/gim, '')
      // เธฅเธเธเธทเนเธญ Ad Network เน€เธเนเธ Ezoic
      .replace(/^[ \t]*Ezoic[ \t]*$/gim, '')
      // เธฅเธเธเธธเนเธกเนเธฅเธฐเธเนเธญเธเธงเธฒเธกเธเธฒเธ Video Player เนเธเธฉเธ“เธฒ (Play, Unmute, Fullscreen เธฏเธฅเธฏ)
      .replace(/^[ \t]*(?:[ร—xX]|Play|Pause|Unmute|Mute|Fullscreen|Advertisement:\s*\d+:\d+|Now Playing|Play Video|Watch on|Video channel logo)[ \t]*$/gim, '')
      // เธฅเธเนเธ–เธเธซเธฑเธงเธเนเธญเนเธฅเธฐเธเธณเธเธฃเธฃเธขเธฒเธขเธงเธดเธ”เธตเนเธญเนเธเธฉเธ“เธฒ (video of: ..., Daily Gospel เธฏเธฅเธฏ)
      .replace(/^[ \t]*(?:video of:\s*.*|Watch on\s*.*|.*Play Video.*)$/gim, '')
      .replace(/^[ \t]*(?:Daily Gospel.*|Catholic Bible.*|Fiction vs Nonfiction.*|Web Wealth.*)$/gim, '');

    // 3. เธฅเนเธฒเธเธญเธฑเธเธเธฃเธฐเธฅเนเธญเธเธซเธ, เธชเธฑเธเธฅเธฑเธเธฉเธ“เนเธชเนเธเธเน€เธเธตเนเธขเธ, เธชเธฃเธฐเนเธญ
    return text
      .replace(/\r/g, '')
      .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF\u202A-\u202E]/g, '') // เธฅเธ zero-width, soft-hyphen, bidi
      .replace(/[โ€โ€]/g, '"').replace(/[โ€โ€]/g, "'")
      .replace(/[โ–กโ– โ—โ—โ€ปยค]/g, '')
      .replace(/รขโฌล“/g, '"').replace(/รขโฌ /g, '"')
      .replace(/เน€เน€/g, 'เน')
      .replace(/\n{3,}/g, '\n\n'); // เธขเธธเธเธเธฃเธฃเธ—เธฑเธ”เธงเนเธฒเธเธ—เธตเนเน€เธเธดเธ”เธเธฒเธเธเธฒเธฃเธฅเธเธเธขเธฐ เนเธซเนเน€เธซเธฅเธทเธญเน€เธงเนเธเธงเธฃเธฃเธเธขเนเธญเธซเธเนเธฒเธเธเธ•เธด (2 เธเธฃเธฃเธ—เธฑเธ”)
  }

  /* ---------------- เธฃเธฐเธเธเธ•เธฃเธงเธเธเธฑเธเธเนเธญเธเธงเธฒเธกเน€เธเธตเนเธขเธ & เธเธญเธเธ•เน PUA ---------------- */
  function highlightSuspicious(text){
    var box = document.getElementById('suspiciousBox');
    if(!box) return;
    if(!text || !text.trim()){ box.style.display = 'none'; box.innerHTML = ''; return; }

    var lines = text.split('\n');
    var puaRegex = /[\uE000-\uF8FF]/g;
    var danglingVowelRegex = /(?:^|\s)[เธฐเธฑเธดเธตเธถเธทเธธเธนเธบเนเนเนเนเนเน]/; // เธชเธฃเธฐเธซเธฃเธทเธญเธงเธฃเธฃเธ“เธขเธธเธเธ•เนเธฅเธญเธขเธ—เธตเนเนเธกเนเธกเธตเธเธขเธฑเธเธเธเธณเธซเธเนเธฒ
    var symbolRegex = /[โ–กโ– โ—โ—โ€ปยค]/g;
    var tripleRepeatRegex = /(.)\1\1\1/;

    var totalPuaCount = 0;
    var badLines = [];

    lines.forEach(function(line, idx){
      var lineTrim = line.trim();
      if(!lineTrim) return;

      var puaMatches = lineTrim.match(puaRegex);
      var hasDangling = danglingVowelRegex.test(lineTrim);
      var hasSymbol = symbolRegex.test(lineTrim);
      var hasRepeat = tripleRepeatRegex.test(lineTrim);

      if(puaMatches || hasDangling || hasSymbol || hasRepeat){
        var reasons = [];
        if(puaMatches){
          totalPuaCount += puaMatches.length;
          reasons.push('เธเธญเธเธ•เนเน€เธเธตเนเธขเธ/PUA ' + puaMatches.length + ' เธ•เธฑเธง');
        }
        if(hasDangling) reasons.push('เธเธขเธฑเธเธเธเธฐเธ•เนเธเธซเธฒเธข (เธชเธฃเธฐเธฅเธญเธข)');
        if(hasSymbol) reasons.push('เธกเธตเธชเธฑเธเธฅเธฑเธเธฉเธ“เนเธเธขเธฐ');
        if(hasRepeat) reasons.push('เธญเธฑเธเธฉเธฃเธเนเธณเธเธดเธ”เธเธเธ•เธด');

        badLines.push({
          lineNum: idx + 1,
          preview: lineTrim.slice(0, 60),
          reasons: reasons.join(', ')
        });
      }
    });

    if(badLines.length > 0){
      box.style.display = 'block';
      box.innerHTML = '';

      var header = document.createElement('div');
      header.innerHTML = '<b style="color:var(--pen);">โ  เธเธเธเนเธญเธเธงเธฒเธกเธเธดเธ”เธเธเธ•เธด ' + badLines.length + ' เธเธฃเธฃเธ—เธฑเธ”</b> ' +
        (totalPuaCount > 0 ? '<span style="font-size:12px;color:var(--ink-soft);">(เธ•เธฃเธงเธเธเธเธญเธฑเธเธฉเธฃเธเธญเธเธ•เนเธเนเธญเธ PUA เธฃเธงเธก ' + totalPuaCount.toLocaleString() + ' เธ•เธฑเธง)</span>' : '');
      box.appendChild(header);

      var list = document.createElement('div');
      list.style.fontSize = '12px';
      list.style.marginTop = '6px';

      badLines.slice(0, 4).forEach(function(item){
        var row = document.createElement('div');
        row.style.marginBottom = '3px';
        row.innerHTML = '<b>เธเธฃเธฃเธ—เธฑเธ” ' + item.lineNum + ':</b> <code>' + escapeHtml(item.preview) + '</code> <span style="color:var(--pen);font-size:11px;">โณ ' + item.reasons + '</span>';
        list.appendChild(row);
      });

      if(badLines.length > 4){
        var more = document.createElement('div');
        more.style.marginTop = '4px';
        more.style.fontStyle = 'italic';
        more.style.color = 'var(--ink-soft)';
        more.textContent = '...เนเธฅเธฐเธญเธตเธ ' + (badLines.length - 4) + ' เธเธฃเธฃเธ—เธฑเธ”เธ—เธตเนเธกเธตเธฅเธฑเธเธฉเธ“เธฐเน€เธ”เธตเธขเธงเธเธฑเธ';
        list.appendChild(more);
      }

      box.appendChild(list);
    } else {
      box.style.display = 'none';
    }
  }

  quickRepairBtn.addEventListener('click', function(){
    hideError();
    var text = inputText.value.trim();
    if(!text){ showError('เธเธฃเธธเธ“เธฒเนเธชเนเธเนเธญเธเธงเธฒเธกเธ•เนเธเธเธเธฑเธเธเนเธญเธ'); return; }

    inputText.value = normalizeOCR(text);
    highlightSuspicious(inputText.value);
    saveDraftSoon();

    progressText.textContent = 'เธเนเธญเธกเธเนเธญเธเธงเธฒเธกเธฃเธงเธ”เน€เธฃเนเธงเน€เธชเธฃเนเธเธชเธดเนเธ';
    setTimeout(function(){ progressText.textContent = ''; }, 2000);
  });

/* ---------------- Prompt เธเนเธญเธก OCR 2 เธฃเธฐเธ”เธฑเธ (เธ เธฒเธฉเธฒเนเธ—เธข vs เธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจ) ---------------- */
  function buildOCRRepairPrompt(sampleText){
    // เธ•เธฃเธงเธเธชเธญเธเธงเนเธฒเธเนเธญเธเธงเธฒเธกเน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธขเธซเธฃเธทเธญเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจ
    var hasThai = /[\u0E00-\u0E7F]/.test(sampleText || '');
    var isThaiMode = (state.source === 'polish') || hasThai;

    if (isThaiMode) {
      // ๐น เธฃเธฐเธ”เธฑเธเธ—เธตเน 1: เธเนเธญเธก OCR เธ เธฒเธฉเธฒเนเธ—เธข เนเธฅเธฐเธ–เธญเธ”เธฃเธซเธฑเธชเธเธญเธเธ•เน PUA
      return `เธเธธเธ“เธเธทเธญเธฃเธฐเธเธเธ•เธฃเธงเธเธชเธญเธเนเธฅเธฐเธเนเธญเธกเนเธเธกเธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเนเธ—เธข (Thai OCR & Font De-obfuscation Engine)

เธซเธเนเธฒเธ—เธตเนเธเธญเธเธเธธเธ“:
1. เธญเนเธฒเธเธเธฃเธดเธเธ—เธเธญเธเธเธฃเธฐเนเธขเธเธ เธฒเธฉเธฒเนเธ—เธข เนเธฅเนเธงเธ–เธญเธ”เธฃเธซเธฑเธชเธ•เธฑเธงเธญเธฑเธเธฉเธฃ PUA เธ—เธตเนเน€เธเธตเนเธขเธ เธซเธฃเธทเธญเธ•เธฑเธงเธญเธฑเธเธฉเธฃเธ—เธตเนเธชเนเธเธเธเธดเธ” เนเธซเนเธเธฅเธฑเธเธกเธฒเน€เธเนเธเธเธณเธ เธฒเธฉเธฒเนเธ—เธขเธ—เธตเนเธ–เธนเธเธ•เนเธญเธเนเธฅเธฐเธชเธกเธเธนเธฃเธ“เน 100%
2. เธเนเธญเธกเธเธณเธ—เธตเนเธชเธฃเธฐเธซเธฃเธทเธญเธงเธฃเธฃเธ“เธขเธธเธเธ•เนเธซเธฅเธธเธ”เธซเธฒเธขเธเธฒเธเธเธฒเธฃเธชเนเธเธ เนเธฅเธฐเนเธเนเธชเธฃเธฐเนเธญเน€เธเธตเนเธขเธ (เน€เน€ -> เน)

[เธเนเธญเธซเนเธฒเธกเน€เธ”เนเธ”เธเธฒเธ” - Strict Constraints]
1. เธซเนเธฒเธกเธชเธฃเธธเธเธเธงเธฒเธก เธซเนเธฒเธกเธ•เธฑเธ”เธ—เธญเธเน€เธเธทเนเธญเธซเธฒ เนเธฅเธฐเธซเนเธฒเธกเนเธ•เนเธเน€เธฃเธทเนเธญเธเธ•เนเธญเน€เธ”เนเธ”เธเธฒเธ”!
2. เธ•เนเธญเธเธเธเน€เธเธทเนเธญเธซเธฒเน€เธ”เธดเธก เธขเนเธญเธซเธเนเธฒเน€เธ”เธดเธก เธเธ—เธชเธเธ—เธเธฒ เนเธฅเธฐเน€เธเธฃเธทเนเธญเธเธซเธกเธฒเธขเธเธณเธเธนเธ”เนเธงเนเธเธฃเธเธ–เนเธงเธ 100%
3. เธ•เธญเธเธเธฅเธฑเธเน€เธเธเธฒเธฐเธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเนเธ—เธขเธ—เธตเนเธเนเธญเธกเน€เธชเธฃเนเธเนเธฅเนเธงเน€เธ—เนเธฒเธเธฑเนเธ เธซเนเธฒเธกเธกเธตเธเธณเธญเธเธดเธเธฒเธข เธเธณเธเธณ เธซเธฃเธทเธญเธเนเธญเธเธงเธฒเธกเน€เธเธดเธ”/เธเธดเธ”`;
    } else {
      //  เธฃเธฐเธ”เธฑเธเธ—เธตเน 2: เธเนเธญเธก OCR เธ เธฒเธฉเธฒเธ•เนเธเธเธเธฑเธเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจ (เน€เธเนเธ เธ เธฒเธฉเธฒเธญเธฑเธเธเธคเธฉ) เนเธ”เธขเธซเนเธฒเธกเนเธเธฅ
      return `You are a professional Raw Text OCR Corrector and Typo Repair Engine.

Your task is to fix optical character recognition (OCR) scan errors, broken typography, and line-break artifacts in the provided foreign text (e.g., English).

[Tasks to perform]
1. Rejoin hyphenated words split across line breaks (e.g., "trans- lation" -> "translation", "con- dition" -> "condition").
2. Fix common OCR character confusions (e.g., "rn" mistyped as "m", "cl" as "d", "1" or "I" as "l", broken quotes like "รขโฌล“").
3. Fix obvious spelling mistakes caused by scanning artifacts while preserving novel terms, character names, and original tone.

[STRICT CONSTRAINTS - CRITICAL]
1. STRICTLY DO NOT TRANSLATE! Keep the text in its original language (e.g., English) 100%.
2. Do not summarize, truncate, or rewrite sentences.
3. Preserve all paragraphs, dialogues, and quotation marks intact.
4. Output ONLY the repaired original text without any explanations or conversational remarks.`;
    }
  }

  function splitIntoChunks(text, maxLen){
    if(text.length <= maxLen) return [text];
    var paras = text.split(/\n\s*\n/);
    var chunks = [], current = '';
    function pushCurrent(){
      if(current){ chunks.push(current); current = ''; }
    }
    function splitOversizedParagraph(para){
      var parts = [];
      var sentences = para.split(/(?<=[.!?ใ€๏ผ๏ผ\n])\s*/).filter(Boolean);
      var buf = '';
      sentences.forEach(function(sen){
        if((buf + sen).length > maxLen){
          if(buf) parts.push(buf);
          if(sen.length > maxLen){
            for(var k = 0; k < sen.length; k += maxLen) parts.push(sen.slice(k, k + maxLen));
            buf = '';
          } else {
            buf = sen;
          }
        } else {
          buf += sen;
        }
      });
      if(buf) parts.push(buf);
      return parts;
    }
    for(var i=0; i<paras.length; i++){
      var p = paras[i];
      if(p.length > maxLen){
        pushCurrent();
        splitOversizedParagraph(p).forEach(function(part){ chunks.push(part); });
        continue;
      }
      if((current + '\n\n' + p).length > maxLen){
        pushCurrent();
        current = p;
      } else current = current ? current + '\n\n' + p : p;
    }
    pushCurrent();
    return chunks;
  }

  function showError(msg){ errorBox.textContent = msg; errorBox.classList.add('show'); }
  function hideError(){ errorBox.classList.remove('show'); }
