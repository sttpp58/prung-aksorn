  function readFileAsText(file){
    if(file && typeof file.__virtualText === 'string'){
      return Promise.resolve(file.__virtualText);
    }
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(String(reader.result || '')); };
      reader.onerror = function(){ reject(new Error('เธญเนเธฒเธเนเธเธฅเนเนเธกเนเธชเธณเน€เธฃเนเธ: ' + file.name)); };
      reader.readAsText(file, 'UTF-8');
    });
  }

  function detectChapterSplits(text){
    var pattern = /^[ \t]*(?:(?:เธเธ—เธ—เธตเน|เธ•เธญเธเธ—เธตเน)[ \t]*\d+|Chapter[ \t]*\d+|Ch\.[ \t]*\d+|็ฌฌ[ \t]*(?:\d+|[ใ€้ถไธ€ไบไธๅไบ”ๅ…ญไธๅ…ซไนๅ็พๅไธค]+)[ \t]*็ซ )[^\n]*$/gim;
    var matches = [];
    var m;
    while((m = pattern.exec(text)) !== null){
      matches.push({ index: m.index, heading: m[0].trim().slice(0, 60) });
      if(m.index === pattern.lastIndex) pattern.lastIndex++;
    }
    if(matches.length < 2) return null;

    var segments = [];
    var prefix = text.slice(0, matches[0].index).trim();
    for(var i = 0; i < matches.length; i++){
      var start = matches[i].index;
      var end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
      var segText = text.slice(start, end).trim();
      if(i === 0 && prefix) segText = prefix + '\n\n' + segText;
      if(segText) segments.push({ label: matches[i].heading, text: segText });
    }
    return segments.length >= 2 ? segments : null;
  }

  async function runSingleTranslationForBatch(chunks, proj, key, model, label, originalText, batchId, batchIndex, chunkSize, normalizedText, targetBookId){
    var results = [];
    var previousTail = '';
    var activeBook = (proj.books || []).find(function(b){ return b.id === targetBookId; }) || null;
    if(!activeBook) throw new Error('เนเธกเนเธเธ Book เธ•เนเธเธ—เธฒเธเธเธญเธ Batch');
    var translationJobId = makeId('tj');
    var translationChapterId = makeId('h');
    var jobCreated = false;
    var translationJobCompleted = false;
    var batchProvider = providerSel.value;
    var batchSettingsSnapshot = captureTranslationSettingsSnapshot(batchProvider, model, chunkSize);
    var batchContext = captureAppContext(proj, activeBook);
    var batchJobRevision = null;
    try{
      var batchCreatedJob = await PrungAksornStorageV2.createTranslationJob({jobId:translationJobId,projectId:proj.id,bookId:activeBook ? activeBook.id : null,chapterId:translationChapterId,jobType:'batch',batchId:batchId,batchIndex:batchIndex,provider:batchProvider,model:model,chunkSize:chunkSize,totalChunks:chunks.length,sourceSnapshot:{text:String(normalizedText || normalizeOCR(originalText || '')),originalText:String(originalText || ''),title:String(label || ''),normalized:true},settingsSnapshot:batchSettingsSnapshot});
      jobCreated = true;
      var batchRunningJob = await PrungAksornStorageV2.updateTranslationJob({jobId:translationJobId,status:'running',expectedRevision:batchCreatedJob.revision});
      batchJobRevision = batchRunningJob.revision;
      activeTranslationJobRevision = batchJobRevision;
      activeTranslationJobId = translationJobId;
      for(var i = 0; i < chunks.length; i++){
        // เธชเนเธ chunks[i] เน€เธเนเธฒเนเธเธ”เนเธงเธข Snapshot เธเธญเธ settings เน€เธเธทเนเธญเนเธกเนเนเธซเน global UI state เน€เธเธฅเธตเนเธขเธ prompt เธฃเธฐเธซเธงเนเธฒเธ Batch Job
        var sys = buildTranslatePromptWithSettings(proj, previousTail, chunks[i], batchSettingsSnapshot);
        var part = await callAIWithRetry(sys, chunks[i], key, model, activeController.signal, 2, batchProvider);
        var partTrim = part.trim();
        previousTail = getTail(partTrim, 300);
        var batchCheckpointedJob = await PrungAksornStorageV2.checkpointTranslationJob({jobId:translationJobId,retryCount:0,expectedRevision:batchJobRevision},i,partTrim,previousTail);
        batchJobRevision = batchCheckpointedJob.revision;
        activeTranslationJobRevision = batchJobRevision;
        results.push(partTrim);
      }
      await PrungAksornStorageV2.completeTranslationJob(translationJobId,batchJobRevision);
      if(isAppContextCurrent(batchContext)){
        analyzeTQGCompletedOutput(normalizedText || normalizeOCR(originalText || ''), results.join('\n\n'), proj);
      }
      batchJobRevision = null;
      activeTranslationJobRevision = null;
      translationJobCompleted = true;
      activeTranslationJobId = null;

      var outputText = results.join('\n\n');
      var newEntry = { id: translationChapterId, ts: Date.now(), label: label, input: originalText, output: outputText };
      if(activeBook) activeBook.history.push(newEntry);
      else (proj.history = proj.history || []).push(newEntry);
    }catch(err){
      if(jobCreated && !translationJobCompleted){
        try{
          if(err.name === 'AbortError') await PrungAksornStorageV2.cancelTranslationJob(translationJobId,batchJobRevision);
          else await PrungAksornStorageV2.failTranslationJob(translationJobId,{code:'BATCH_TRANSLATION_FAILED',message:String(err.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”'),chunkIndex:typeof i === 'number' ? i : null,retryCount:0,timestamp:Date.now()},batchJobRevision);
        }catch(jobErr){
          console.warn('Batch translation job state checkpoint failed:', jobErr);
        }
      }
      activeTranslationJobId = null;
      throw err;
    }
  }
  async function runBatchImport(files){
    var proj = getCurrentProject();
    var key = document.getElementById('apiKey').value.trim();
    if(!proj){ showError('เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเธซเธฃเธทเธญเธชเธฃเนเธฒเธเน€เธฃเธทเนเธญเธเธเธดเธขเธฒเธขเธเนเธญเธ'); return; }
    if(!key){ showError('เธเธฃเธธเธ“เธฒเนเธชเน API Key เธเนเธญเธ'); return; }
    if(batchInProgress || warnIfAiBusy()) return;
    var batchTargetBook = getActiveBook(proj);
    if(!batchTargetBook){ showError('เนเธกเนเธเธเน€เธฅเนเธกเธ•เนเธเธ—เธฒเธเธเธญเธ Batch'); return; }
    var batchTargetBookId = batchTargetBook.id;

    hideError();
    var maxLen = parseInt(document.getElementById('chunkLen').value) || 3000;
    batchInProgress = true;
    batchCancelled = false;
    resetTQGQualityPanel();
    setAiBusy(true);
    setTranslationSettingsLocked(true);
    resetActionStats();
    cancelBtn.classList.add('show');

    var batchId = makeId('batch');
    var succeeded = [];
    var failed = [];

    for(var idx = 0; idx < files.length; idx++){
      if(batchCancelled) break;
      var f = files[idx];
      progressText.textContent = 'เธเธณเธฅเธฑเธเนเธเธฅเนเธเธฅเน ' + (idx + 1) + '/' + files.length + ': ' + f.name;
      try{
        activeController = new AbortController();
        var raw = await readFileAsText(f);
        var text = normalizeOCR(raw);
        var chunks = splitIntoChunks(text, maxLen);
        var label = f.name.replace(/\.[^.]+$/, '');
        await runSingleTranslationForBatch(chunks, proj, key, modelInput.value, label, text, batchId, idx, maxLen, text, batchTargetBookId);
        succeeded.push(f.name);
        commitChange();
      }catch(err){
        if(err.name === 'AbortError'){ batchCancelled = true; break; }
        failed.push(f.name + ' (' + (err.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”') + ')');
      }
    }

    batchInProgress = false;
    setTranslationSettingsLocked(false);
    setAiBusy(false);
    cancelBtn.classList.remove('show');
    progressText.textContent = '';

    var summary = 'เธเธณเน€เธเนเธฒเน€เธชเธฃเนเธเธชเธดเนเธ: เธชเธณเน€เธฃเนเธ ' + succeeded.length + '/' + files.length + ' เนเธเธฅเน';
    if(batchCancelled) summary += ' (เธขเธเน€เธฅเธดเธเธเนเธญเธเธเธฃเธ)';
    if(currentActionTokens > 0) summary += '\n\n(เนเธเน API เนเธเธ—เธฑเนเธเธซเธกเธ” ' + currentActionTokens.toLocaleString() + ' tokens, เธเธฃเธฐเธกเธฒเธ“ $' + currentActionCost.toFixed(4) + ')';
    if(failed.length) summary += '\n\nเธฅเนเธกเน€เธซเธฅเธง:\n- ' + failed.join('\n- ');
    refreshTranslationRecoveryUI();
    await showAlertDialog('เธชเธฃเธธเธเธเธฅเธเธฒเธฃเธเธณเน€เธเนเธฒ', summary);
  }

  processBtn.addEventListener('click', async function(){
    hideError();
    if(warnIfAiBusy()) return;
    var proj = getCurrentProject();
    var text = inputText.value.trim();
    var key = document.getElementById('apiKey').value.trim();
    if(!proj || !text || !key){ showError('เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธเน€เธฃเธทเนเธญเธ เนเธชเนเน€เธเธทเนเธญเธซเธฒ เนเธฅเธฐ API Key'); return; }

    var maxLen = parseInt(document.getElementById('chunkLen').value) || 3000;
    var normalizedText = normalizeOCR(text);
    var chunks = splitIntoChunks(normalizedText, maxLen);
    pendingResume = null;
    pendingBatchResume = null;
    if(resumeBtn){ resumeBtn.classList.remove('show'); resumeBtn.textContent='เธ”เธณเน€เธเธดเธเธเธฒเธฃเธ•เนเธญ'; }
    await runTranslation(chunks, proj, key, modelInput.value, 0, [], text, makeId('h'), null, normalizedText);
  });

  if(resumeBtn){
    resumeBtn.addEventListener('click', async function(){
      hideError();
      if(warnIfAiBusy()) return;
      if(pendingBatchResume){
        var batchState=pendingBatchResume;
        await runBatchTranslationRecovery(batchState);
        return;
      }
      if(!pendingResume) return;
      var key = document.getElementById('apiKey').value.trim() || pendingResume.key;
      if(pendingResume.provider && providerSel.value !== pendingResume.provider){ showError('Provider เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ ' + pendingResume.provider + ' เธเนเธญเธเธ”เธณเน€เธเธดเธเธเธฒเธฃเธ•เนเธญ'); return; }
      if(modelInput.value !== pendingResume.model){ showError('Model เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ ' + pendingResume.model + ' เธเนเธญเธเธ”เธณเน€เธเธดเธเธเธฒเธฃเธ•เนเธญ'); return; }
      await runTranslation(pendingResume.chunks, pendingResume.proj, key, pendingResume.model, pendingResume.startIndex, pendingResume.results, pendingResume.originalText, pendingResume.chapterId, pendingResume.jobId, pendingResume.sourceSnapshotText, pendingResume.settingsSnapshot);
    });
  }

  repairBtn.addEventListener('click', async function(){
    hideError();
    if(warnIfAiBusy()) return;
    var text = inputText.value.trim();
    var key = document.getElementById('apiKey').value.trim();
    var repairContext = captureAppContext(getCurrentProject(), getActiveBook(getCurrentProject()));
    var repairSourceSnapshot = text;
    var repairModelSnapshot = modelInput.value;
    if(!text || !key){ showError('เธเธฃเธธเธ“เธฒเนเธชเนเน€เธเธทเนเธญเธซเธฒเนเธฅเธฐ API Key'); return; }

    text = normalizeOCR(text);
    var chunks = splitIntoChunks(text, 1800);

    activeController = new AbortController();
    setAiBusy(true);
    resetActionStats();
    cancelBtn.classList.add('show');
    progressText.textContent = 'เธเธณเธฅเธฑเธเธเนเธญเธก OCR เธ”เนเธงเธข AI...';
    var sys = buildOCRRepairPrompt(text); //  เธชเนเธ text เน€เธเนเธฒเนเธเน€เธเธทเนเธญเนเธซเนเธฃเธฐเธเธเน€เธฅเธทเธญเธเนเธซเธกเธ”เธญเธฑเธ•เนเธเธกเธฑเธ•เธด
    var repairedParts = [];

    try {
      for(var i=0; i<chunks.length; i++){
        if(isAppContextCurrent(repairContext)) progressText.textContent = chunks.length > 1 ? ('เธเธณเธฅเธฑเธเธเนเธญเธกเธชเนเธงเธเธ—เธตเน ' + (i+1) + '/' + chunks.length) : 'เธเธณเธฅเธฑเธเธเนเธญเธก OCR เธ”เนเธงเธข AI...';
        var repaired = await callAIWithRetry(sys, chunks[i], key, repairModelSnapshot, activeController.signal, 2);
        if(!isAppContextCurrent(repairContext) || inputText.value.trim() !== repairSourceSnapshot) return;
        repairedParts.push(repaired.trim());
      }
      if(!isAppContextCurrent(repairContext) || inputText.value.trim() !== repairSourceSnapshot) return;
      inputText.value = repairedParts.join('\n\n');
      highlightSuspicious(inputText.value);
      saveDraftSoon();

      var statsStr = '';
      if(currentActionTokens > 0) statsStr = ' (เนเธเนเนเธ ' + currentActionTokens.toLocaleString() + ' tokens, ~$' + currentActionCost.toFixed(4) + ')';
      progressText.textContent = 'เธเนเธญเธก OCR เธ”เนเธงเธข AI เน€เธฃเธตเธขเธเธฃเนเธญเธข' + statsStr;
      setTimeout(function(){ if(isAppContextCurrent(repairContext) && progressText.textContent.includes('เธเนเธญเธก OCR เธ”เนเธงเธข AI เน€เธฃเธตเธขเธเธฃเนเธญเธข')) progressText.textContent = ''; }, 4000);
    } catch(err){
      if(err.name !== 'AbortError' && isAppContextCurrent(repairContext)) showError(err.message);
    } finally {
      setAiBusy(false);
      if(isAppContextCurrent(repairContext)) cancelBtn.classList.remove('show');
    }
  });

  cancelBtn.addEventListener('click', function(){
    batchCancelled = true;
    if(activeController) activeController.abort();
  });

  copyBtn.addEventListener('click', function(){
    navigator.clipboard.writeText(output.textContent).then(function(){
      copyBtn.textContent = 'เธเธฑเธ”เธฅเธญเธเนเธฅเนเธง';
      setTimeout(function(){ copyBtn.textContent = 'เธเธฑเธ”เธฅเธญเธ'; }, 1500);
    }).catch(function(err){
      console.error('Clipboard copy failed:', err);
      showError('เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธฑเธ”เธฅเธญเธเธเนเธญเธเธงเธฒเธกเนเธเธขเธฑเธเธเธฅเธดเธเธเธญเธฃเนเธ”เนเธ”เน');
    });
  });
