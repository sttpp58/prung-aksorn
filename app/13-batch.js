  function readFileAsText(file){
    if(file && typeof file.__virtualText === 'string'){
      return Promise.resolve(file.__virtualText);
    }
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(String(reader.result || '')); };
      reader.onerror = function(){ reject(new Error('อ่านไฟล์ไม่สำเร็จ: ' + file.name)); };
      reader.readAsText(file, 'UTF-8');
    });
  }

  function detectChapterSplits(text){
    var pattern = /^[ \t]*(?:(?:บทที่|ตอนที่)[ \t]*\d+|Chapter[ \t]*\d+|Ch\.[ \t]*\d+|第[ \t]*(?:\d+|[〇零一二三四五六七八九十百千两]+)[ \t]*章)[^\n]*$/gim;
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

  async function runSingleTranslationForBatch(chunks, proj, key, model, label, originalText, batchId, batchIndex, chunkSize, normalizedText, targetBookId, chunkerVersion){
    var results = [];
    var previousTail = '';
    var activeBook = (proj.books || []).find(function(b){ return b.id === targetBookId; }) || null;
    if(!activeBook) throw new Error('ไม่พบ Book ต้นทางของ Batch');
    var translationJobId = makeId('tj');
    var translationChapterId = makeId('h');
    var jobCreated = false;
    var translationJobCompleted = false;
    var batchProvider = providerSel.value;
    var batchSettingsSnapshot = captureTranslationSettingsSnapshot(batchProvider, model, chunkSize);
    var batchContext = captureAppContext(proj, activeBook);
    var batchJobRevision = null;
    try{
      var batchChunkMeta = await buildTranslationChunkMetadata(chunks, chunkerVersion || 'v2');
      var batchCreatedJob = await PrungAksornStorageV2.createTranslationJob({jobId:translationJobId,projectId:proj.id,bookId:activeBook ? activeBook.id : null,chapterId:translationChapterId,jobType:'batch',batchId:batchId,batchIndex:batchIndex,provider:batchProvider,model:model,chunkSize:chunkSize,totalChunks:chunks.length,chunkerVersion:batchChunkMeta.chunkerVersion,chunkLengths:batchChunkMeta.chunkLengths,chunkDigest:batchChunkMeta.chunkDigest,sourceSnapshot:{text:String(normalizedText || normalizeOCR(originalText || '')),originalText:String(originalText || ''),title:String(label || ''),normalized:true},settingsSnapshot:batchSettingsSnapshot});
      jobCreated = true;
      var batchRunningJob = await PrungAksornStorageV2.updateTranslationJob({jobId:translationJobId,status:'running',expectedRevision:batchCreatedJob.revision});
      batchJobRevision = batchRunningJob.revision;
      activeTranslationJobRevision = batchJobRevision;
      activeTranslationJobId = translationJobId;
      for(var i = 0; i < chunks.length; i++){
        // ส่ง chunks[i] เข้าไปด้วย Snapshot ของ settings เพื่อไม่ให้ global UI state เปลี่ยน prompt ระหว่าง Batch Job
        var part = await callTranslationChunkWithTruncationGuard(proj, previousTail, chunks[i], key, model, activeController.signal, 2, batchProvider, batchSettingsSnapshot);
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
          else await PrungAksornStorageV2.failTranslationJob(translationJobId,{code:'BATCH_TRANSLATION_FAILED',message:String(err.message || 'เกิดข้อผิดพลาด'),chunkIndex:typeof i === 'number' ? i : null,retryCount:0,timestamp:Date.now()},batchJobRevision);
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
    if(!proj){ showError('กรุณาเลือกหรือสร้างเรื่องนิยายก่อน'); return; }
    if(!key){ showError('กรุณาใส่ API Key ก่อน'); return; }
    if(batchInProgress || warnIfAiBusy()) return;
    var batchTargetBook = getActiveBook(proj);
    if(!batchTargetBook){ showError('ไม่พบเล่มต้นทางของ Batch'); return; }
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
      progressText.textContent = 'กำลังแปลไฟล์ ' + (idx + 1) + '/' + files.length + ': ' + f.name;
      try{
        activeController = new AbortController();
        var raw = await readFileAsText(f);
        var text = normalizeOCR(raw);
        var chunks = splitIntoChunksForVersion(text, maxLen, 'v2');
        var label = f.name.replace(/\.[^.]+$/, '');
        await runSingleTranslationForBatch(chunks, proj, key, modelInput.value, label, text, batchId, idx, maxLen, text, batchTargetBookId, 'v2');
        succeeded.push(f.name);
        commitChange();
      }catch(err){
        if(err.name === 'AbortError'){ batchCancelled = true; break; }
        failed.push(f.name + ' (' + (err.message || 'เกิดข้อผิดพลาด') + ')');
      }
    }

    batchInProgress = false;
    setTranslationSettingsLocked(false);
    setAiBusy(false);
    cancelBtn.classList.remove('show');
    progressText.textContent = '';

    var summary = 'นำเข้าเสร็จสิ้น: สำเร็จ ' + succeeded.length + '/' + files.length + ' ไฟล์';
    if(batchCancelled) summary += ' (ยกเลิกก่อนครบ)';
    if(currentActionTokens > 0) summary += '\n\n(ใช้ API ไปทั้งหมด ' + currentActionTokens.toLocaleString() + ' tokens, ประมาณ $' + currentActionCost.toFixed(4) + ')';
    if(failed.length) summary += '\n\nล้มเหลว:\n- ' + failed.join('\n- ');
    refreshTranslationRecoveryUI();
    await showAlertDialog('สรุปผลการนำเข้า', summary);
  }

  processBtn.addEventListener('click', async function(){
    hideError();
    if(warnIfAiBusy()) return;
    var proj = getCurrentProject();
    var text = inputText.value.trim();
    var key = document.getElementById('apiKey').value.trim();
    if(!proj || !text || !key){ showError('กรุณาเลือกเรื่อง ใส่เนื้อหา และ API Key'); return; }

    var maxLen = parseInt(document.getElementById('chunkLen').value) || 3000;
    var normalizedText = normalizeOCR(text);
    var chunks = splitIntoChunksForVersion(normalizedText, maxLen, 'v2');
    pendingResume = null;
    pendingBatchResume = null;
    if(resumeBtn){ resumeBtn.classList.remove('show'); resumeBtn.textContent='ดำเนินการต่อ'; }
    await runTranslation(chunks, proj, key, modelInput.value, 0, [], text, makeId('h'), null, normalizedText, null, 'v2');
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
      if(pendingResume.provider && providerSel.value !== pendingResume.provider){ showError('Provider ปัจจุบันไม่ตรงกับ Job: กรุณาเลือก ' + pendingResume.provider + ' ก่อนดำเนินการต่อ'); return; }
      if(modelInput.value !== pendingResume.model){ showError('Model ปัจจุบันไม่ตรงกับ Job: กรุณาเลือก ' + pendingResume.model + ' ก่อนดำเนินการต่อ'); return; }
      await runTranslation(pendingResume.chunks, pendingResume.proj, key, pendingResume.model, pendingResume.startIndex, pendingResume.results, pendingResume.originalText, pendingResume.chapterId, pendingResume.jobId, pendingResume.sourceSnapshotText, pendingResume.settingsSnapshot, pendingResume.chunkerVersion || 'v1');
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
    if(!text || !key){ showError('กรุณาใส่เนื้อหาและ API Key'); return; }

    text = normalizeOCR(text);
    var chunks = splitIntoChunks(text, 1800);

    activeController = new AbortController();
    setAiBusy(true);
    resetActionStats();
    cancelBtn.classList.add('show');
    progressText.textContent = 'กำลังซ่อม OCR ด้วย AI...';
    var sys = buildOCRRepairPrompt(text); //  ส่ง text เข้าไปเพื่อให้ระบบเลือกโหมดอัตโนมัติ
    var repairedParts = [];

    try {
      for(var i=0; i<chunks.length; i++){
        if(isAppContextCurrent(repairContext)) progressText.textContent = chunks.length > 1 ? ('กำลังซ่อมส่วนที่ ' + (i+1) + '/' + chunks.length) : 'กำลังซ่อม OCR ด้วย AI...';
        var repaired = await callAIWithRetry(sys, chunks[i], key, repairModelSnapshot, activeController.signal, 2);
        if(!isAppContextCurrent(repairContext) || inputText.value.trim() !== repairSourceSnapshot) return;
        repairedParts.push(repaired.trim());
      }
      if(!isAppContextCurrent(repairContext) || inputText.value.trim() !== repairSourceSnapshot) return;
      inputText.value = repairedParts.join('\n\n');
      highlightSuspicious(inputText.value);
      saveDraftSoon();

      var statsStr = '';
      if(currentActionTokens > 0) statsStr = ' (ใช้ไป ' + currentActionTokens.toLocaleString() + ' tokens, ~$' + currentActionCost.toFixed(4) + ')';
      progressText.textContent = 'ซ่อม OCR ด้วย AI เรียบร้อย' + statsStr;
      setTimeout(function(){ if(isAppContextCurrent(repairContext) && progressText.textContent.includes('ซ่อม OCR ด้วย AI เรียบร้อย')) progressText.textContent = ''; }, 4000);
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
      copyBtn.textContent = 'คัดลอกแล้ว';
      setTimeout(function(){ copyBtn.textContent = 'คัดลอก'; }, 1500);
    }).catch(function(err){
      console.error('Clipboard copy failed:', err);
      showError('ไม่สามารถคัดลอกข้อความไปยังคลิปบอร์ดได้');
    });
  });
