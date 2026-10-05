  async function runSurgicalGlossaryFixWithAI(missedTerms){
    var key = document.getElementById('apiKey').value.trim();
    if(!key){ await showAlertDialog('เธขเธฑเธเนเธกเนเนเธ”เนเนเธชเน API Key', 'เธเธฃเธธเธ“เธฒเนเธชเน API Key เนเธเธซเธเนเธฒเธ•เธฑเนเธเธเนเธฒเธเนเธญเธ'); return; }
    if(warnIfAiBusy()) return;
    var surgicalContext = captureAppContext(getCurrentProject(), getActiveBook(getCurrentProject()));
    var surgicalOutputSnapshot = output.textContent;

    var termRules = missedTerms.map(function(t){ return '- เธ•เนเธเธเธเธฑเธ: "' + t.src + '" เธ•เนเธญเธเนเธเธฅเน€เธเนเธ: "' + t.trans + '"'; }).join('\n');
    var sys = "เธเธธเธ“เธเธทเธญเธฃเธฐเธเธเธ•เธฃเธงเธเธชเธญเธเนเธฅเธฐเนเธเนเนเธเธเธธเธ“เธ เธฒเธเธเนเธญเธเธงเธฒเธกเนเธเธฅเธ เธฒเธฉเธฒเนเธ—เธข "
      + "เธกเธตเธซเธเนเธฒเธ—เธตเนเนเธเนเนเธเธเธณเธจเธฑเธเธ—เนเน€เธเธเธฒเธฐเธ—เธตเนเนเธเธฅเธเธดเธ”เนเธฅเธฐเธ•เธฃเธงเธเธเธฑเธเธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธ—เธตเนเธซเธฅเธธเธ”เธเธฐเธเธเธกเธฒเนเธเธเธ—เนเธเธฅ "
      + "เนเธ”เธขเธ•เนเธญเธเธฃเธฑเธเธฉเธฒเน€เธเธทเนเธญเธซเธฒเธ•เนเธเธเธเธฑเธเธชเนเธงเธเธ—เธตเนเธ–เธนเธเธ•เนเธญเธเนเธงเนเนเธซเนเธกเธฒเธเธ—เธตเนเธชเธธเธ”\n\n" + "[เธฃเธฒเธขเธเธฒเธฃเธเธณเธจเธฑเธเธ—เนเน€เธเธเธฒเธฐ]\n" + (termRules || "เนเธกเนเธกเธตเธฃเธฒเธขเธเธฒเธฃเธเธณเธจเธฑเธเธ—เนเธ—เธตเนเธ•เนเธญเธเนเธเนเนเธ")
      + "\n\n" + "[เธ เธฒเธฃเธเธดเธเธ—เธตเน 1: เธ•เธฃเธงเธเธชเธญเธเธเธณเธจเธฑเธเธ—เนเน€เธเธเธฒเธฐ]\n"
      + "1. เธ•เธฃเธงเธเธชเธญเธเธเธณเธจเธฑเธเธ—เนเนเธเธเนเธญเธเธงเธฒเธกเน€เธ—เธตเธขเธเธเธฑเธเธฃเธฒเธขเธเธฒเธฃเธเธณเธจเธฑเธเธ—เนเธ—เธตเนเธเธณเธซเธเธ”\n"
      + "2. เนเธเนเนเธเธเธณเธจเธฑเธเธ—เนเธ—เธตเนเนเธเธฅเนเธกเนเธ•เธฃเธเธ•เธฒเธกเธฃเธฒเธขเธเธฒเธฃ เนเธ”เธขเธเธดเธเธฒเธฃเธ“เธฒเธเธงเธฒเธกเธซเธกเธฒเธขเนเธฅเธฐเธเธฃเธดเธเธ—เธเธฃเธฐเธเธญเธ\n"
      + "3. เธซเธฒเธเธเธณเธจเธฑเธเธ—เนเธ–เธนเธเธ•เนเธญเธเธญเธขเธนเนเนเธฅเนเธง เนเธซเนเธเธเธเนเธญเธเธงเธฒเธกเน€เธ”เธดเธกเนเธงเน\n" + "4. เธซเนเธฒเธกเนเธ—เธเธ—เธตเนเธเธณเธ—เธตเนเธ•เธฃเธเธเธฑเธเน€เธเธตเธขเธเธเธฒเธเธชเนเธงเธ เธซเธฒเธเธญเธฒเธเธ—เธณเนเธซเนเธเธงเธฒเธกเธซเธกเธฒเธขเธซเธฃเธทเธญเธฃเธนเธเธเธณเธเธดเธ”เน€เธเธตเนเธขเธ\n\n"
      + "[เธ เธฒเธฃเธเธดเธเธ—เธตเน 2: เธ•เธฃเธงเธเธเธฑเธเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธ—เธตเนเธซเธฅเธธเธ”เธเธฐเธเธ]\n" + "1. เธ•เธฃเธงเธเธชเธญเธเธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเนเธ—เธขเน€เธเธทเนเธญเธเนเธเธซเธฒเธเธณ เธงเธฅเธต เธซเธฃเธทเธญเธเธฃเธฐเนเธขเธเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธ—เธตเนเธญเธฒเธเธซเธฅเธเน€เธซเธฅเธทเธญเธเธฒเธเธเธฒเธฃเนเธเธฅ\n"
      + "2. เธเธดเธเธฒเธฃเธ“เธฒเธงเนเธฒเธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธเธฑเนเธเน€เธเนเธเธชเนเธงเธเธซเธเธถเนเธเธเธญเธเน€เธเธทเนเธญเธซเธฒเธ—เธตเนเธเธงเธฃเนเธเธฅเธซเธฃเธทเธญเน€เธเนเธเธเธณเธ—เธตเนเธเธณเน€เธเนเธเธ•เนเธญเธเธเธเนเธงเน\n"
      + "3. เธซเธฒเธเธเธเธเธณเธซเธฃเธทเธญเธงเธฅเธตเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธ—เธตเนเน€เธเนเธเธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เธเธฒเธเธเธฒเธฃเนเธเธฅ เนเธซเนเนเธเธฅเธซเธฃเธทเธญเนเธ—เธเธ—เธตเนเน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธขเธ•เธฒเธกเธเธงเธฒเธกเธซเธกเธฒเธขเนเธฅเธฐเธเธฃเธดเธเธ—เธเธญเธเธเธฃเธฐเนเธขเธ\n"
      + "4. เธซเธฒเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธฃเธฐเธเธธเธเธงเธฒเธกเธซเธกเธฒเธขเนเธ”เนเธญเธขเนเธฒเธเธกเธฑเนเธเนเธ เธซเนเธฒเธกเน€เธ”เธฒเธเธงเธฒเธกเธซเธกเธฒเธขเธซเธฃเธทเธญเธชเธฃเนเธฒเธเธเนเธญเธเธงเธฒเธกเธ—เธ”เนเธ—เธ เนเธซเนเธเธเธเนเธญเธเธงเธฒเธกเน€เธ”เธดเธกเนเธงเน\n" + "5. เธซเนเธฒเธกเธ–เธทเธญเธงเนเธฒเธเธณเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธ—เธธเธเธเธณเน€เธเนเธเธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เนเธ”เธขเธญเธฑเธ•เนเธเธกเธฑเธ•เธด\n\n" +
      "[เธเนเธญเธขเธเน€เธงเนเธเธ—เธตเนเธ•เนเธญเธเธฃเธฐเธกเธฑเธ”เธฃเธฐเธงเธฑเธ]\n" + "1. เธเธทเนเธญเธเธธเธเธเธฅ เธเธทเนเธญเธชเธ–เธฒเธเธ—เธตเน เธเธทเนเธญเธญเธเธเนเธเธฃ เธเธทเนเธญเธชเธณเธเธฑเธ เธเธทเนเธญเธ—เธฑเธเธฉเธฐ เนเธฅเธฐเธเธทเนเธญเน€เธเธเธฒเธฐเธ—เธตเนเธเธงเธฃเธเธเธฃเธนเธเน€เธ”เธดเธก\n" +
      "2. เธเธณเธ—เธฑเธเธจเธฑเธเธ—เนเธ เธฒเธฉเธฒเนเธ—เธขเธ—เธตเนเนเธเนเธเธฑเธเธ•เธฒเธกเธเธเธ•เธด\n" + "3. เธเธณเธจเธฑเธเธ—เนเน€เธเธเธฒเธฐเธซเธฃเธทเธญเธเธณเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธ—เธตเนเธกเธตเธเธงเธฒเธกเธเธณเน€เธเนเธเธ•เนเธญเน€เธเธทเนเธญเธซเธฒ\n" +
      "4. เธ•เธฑเธงเน€เธฅเธ เธชเธฑเธเธฅเธฑเธเธฉเธ“เน เธญเธฑเธเธฉเธฃเธขเนเธญ เนเธฅเธฐเธเนเธญเธเธงเธฒเธกเธ—เธตเนเนเธกเนเนเธเนเน€เธเธทเนเธญเธซเธฒเธชเธณเธซเธฃเธฑเธเนเธเธฅ\n" + "5. เธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธ—เธตเนเน€เธเนเธเธชเนเธงเธเธซเธเธถเนเธเธเธญเธเธเธ—เธชเธเธ—เธเธฒ เธเธทเนเธญเน€เธฃเธทเนเธญเธ เธซเธฃเธทเธญเธเนเธญเธเธงเธฒเธกเธญเนเธฒเธเธญเธดเธเธ—เธตเนเนเธกเนเธเธงเธฃเนเธเธฅเธ•เธฒเธกเธเธฃเธดเธเธ—\n\n" +
      "[เธเนเธญเธเธณเธเธฑเธ”เนเธเธเธฒเธฃเนเธเนเนเธ]\n" + "1. เนเธเนเนเธเน€เธเธเธฒเธฐเธเธณเธจเธฑเธเธ—เนเธ—เธตเนเธเธดเธ”เนเธฅเธฐเธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเธ•เนเธฒเธเธเธฃเธฐเน€เธ—เธจเธ—เธตเนเธขเธทเธเธขเธฑเธเนเธ”เนเธงเนเธฒเน€เธเนเธเธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เธเธฒเธเธเธฒเธฃเนเธเธฅ\n" +
      "2. เธซเนเธฒเธกเน€เธฃเธตเธขเธเน€เธฃเธตเธขเธ เน€เธเธตเธขเธเนเธซเธกเน เธชเธฃเธธเธ เธเธขเธฒเธขเธเธงเธฒเธก เธซเธฃเธทเธญเธ•เธฑเธ”เธ—เธญเธเธเธฃเธฐเนเธขเธเธ—เธตเนเธ–เธนเธเธ•เนเธญเธเธญเธขเธนเนเนเธฅเนเธง\n" +
      "3. เธซเนเธฒเธกเน€เธเธฅเธตเนเธขเธเนเธเธฅเธเน€เธเธทเนเธญเธซเธฒ เธฅเธณเธ”เธฑเธเธเธฃเธฐเนเธขเธ เธฅเธณเธ”เธฑเธเธขเนเธญเธซเธเนเธฒ เธซเธฃเธทเธญเนเธเธฃเธเธชเธฃเนเธฒเธเธเธญเธเธเนเธญเธเธงเธฒเธกเนเธ”เธขเนเธกเนเธเธณเน€เธเนเธ\n" +
      "4. เธฃเธฑเธเธฉเธฒเน€เธเธฃเธทเนเธญเธเธซเธกเธฒเธขเธงเธฃเธฃเธเธ•เธญเธ เน€เธเธฃเธทเนเธญเธเธซเธกเธฒเธขเธเธณเธเธนเธ” เธเธฒเธฃเน€เธงเนเธเธงเธฃเธฃเธ เนเธฅเธฐเธฃเธนเธเนเธเธเธเนเธญเธเธงเธฒเธกเน€เธ”เธดเธกเนเธซเนเธกเธฒเธเธ—เธตเนเธชเธธเธ”\n" +
      "5. เธซเนเธฒเธกเน€เธเธดเนเธกเน€เธเธทเนเธญเธซเธฒเนเธซเธกเนเธซเธฃเธทเธญเนเธ•เนเธเน€เธ•เธดเธกเธเนเธญเธกเธนเธฅเธ—เธตเนเนเธกเนเธกเธตเธญเธขเธนเนเนเธเธเนเธญเธเธงเธฒเธกเธ•เนเธเธเธเธฑเธ\n" +
      "6. เธซเธฒเธเนเธกเนเธเธเธเนเธญเธเธดเธ”เธเธฅเธฒเธ” เนเธซเนเธเธเธเนเธญเธเธงเธฒเธกเธ•เนเธเธเธเธฑเธเนเธงเนเนเธ”เธขเนเธกเนเน€เธเธฅเธตเนเธขเธเนเธเธฅเธ\n\n" +
      "[เธฃเธนเธเนเธเธเธเธฅเธฅเธฑเธเธเน]\n" +
      "1. เธชเนเธเธเธทเธเธเนเธญเธเธงเธฒเธกเธเธเธฑเธเน€เธ•เนเธกเธซเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเนเธฅเธฐเนเธเนเนเธเนเธฅเนเธงเน€เธ—เนเธฒเธเธฑเนเธ\n" +
      "2. เธซเนเธฒเธกเธฃเธฒเธขเธเธฒเธเธฃเธฒเธขเธเธฒเธฃเธเธณเธ—เธตเนเธ•เธฃเธงเธเธเธเธซเธฃเธทเธญเธเธณเธ—เธตเนเนเธเนเนเธ\n" +
      "3. เธซเนเธฒเธกเนเธชเธ”เธเน€เธซเธ•เธธเธเธฅ เธเธฑเนเธเธ•เธญเธเธเธฒเธฃเธงเธดเน€เธเธฃเธฒเธฐเธซเน เธซเธฃเธทเธญเธเธณเธญเธเธดเธเธฒเธขเน€เธเธดเนเธกเน€เธ•เธดเธก\n" +
      "4. เธซเนเธฒเธกเนเธเน Markdown เธซเธฃเธทเธญเน€เธเธดเนเธกเธเนเธญเธเธงเธฒเธกเธเธฃเธญเธเธเธฅเธฅเธฑเธเธเน";

    activeController = new AbortController();
    setAiBusy(true);
    cancelBtn.classList.add('show');
    progressText.textContent = 'เธเธณเธฅเธฑเธเนเธซเน AI เนเธ—เธเธ—เธตเนเธเธณเธจเธฑเธเธ—เนเนเธซเนเธ•เธฃเธเธ•เธฒเธกเธเธฅเธฑเธเธเธณ...';

    try {
      var currentOutput = surgicalOutputSnapshot;
      var fixedResult = await callAIWithRetry(sys, currentOutput, key, modelInput.value, activeController.signal, 1);
      if(fixedResult && fixedResult.trim()){
        if(!isAppContextCurrent(surgicalContext) || output.textContent !== surgicalOutputSnapshot) return;
        output.textContent = fixedResult.trim();
        output.dispatchEvent(new Event('input'));
        hideGlossaryEnforce();
        progressText.textContent = 'เนเธเนเนเธเธเธณเธจเธฑเธเธ—เนเนเธซเนเธ•เธฃเธเธ•เธฒเธกเธเธฅเธฑเธเธเธณเน€เธฃเธตเธขเธเธฃเนเธญเธข!';
        setTimeout(function(){ if(isAppContextCurrent(surgicalContext) && progressText.textContent.includes('เนเธเนเนเธเธเธณเธจเธฑเธเธ—เนเนเธซเนเธ•เธฃเธเธ•เธฒเธกเธเธฅเธฑเธเธเธณเน€เธฃเธตเธขเธเธฃเนเธญเธข!')) progressText.textContent = ''; }, 3000);
      }
    } catch(err){
      if(err.name !== 'AbortError' && isAppContextCurrent(surgicalContext)) await showAlertDialog('เนเธเนเนเธเนเธกเนเธชเธณเน€เธฃเนเธ', err.message);
    } finally {
      setAiBusy(false);
      if(isAppContextCurrent(surgicalContext)){
        cancelBtn.classList.remove('show');
        progressText.textContent = '';
      }
    }
  }

  async function runTranslation(chunks, proj, key, model, startIndex, existingResults, originalText, chapterId, jobId, sourceSnapshotText, settingsSnapshot){
    activeController = new AbortController();
    setAiBusy(true);
    resetActionStats();
    if(resumeBtn) resumeBtn.classList.remove('show');
    cancelBtn.classList.add('show');
    hideGlossaryEnforce();

    var results = existingResults.slice();
    var activeBook = getActiveBook(proj);
    var translationContext = captureAppContext(proj, activeBook);
    var translationTitle = String(chapterTitle.value || 'เนเธเธฅเนเธซเธกเน');
    setOutput(results.join('\n\n'));
    var previousTail = results.length ? getTail(results[results.length - 1], 300) : '';
    var translationJobId = jobId || makeId('tj');
    var translationChapterId = chapterId || makeId('h');
    var translationRetryCount = 0;
    var translationProvider = providerSel.value;
    var translationSettingsSnapshot = normalizeTranslationSettingsSnapshot(settingsSnapshot, translationProvider, model, document.getElementById('chunkLen').value);
    var translationJobRevision = null;
    if(!jobId){
      try{
        var createdJob = await PrungAksornStorageV2.createTranslationJob({jobId:translationJobId,projectId:proj.id,bookId:activeBook ? activeBook.id : null,chapterId:translationChapterId,jobType:'single',provider:translationProvider,model:model,chunkSize:parseInt(document.getElementById('chunkLen').value)||3000,totalChunks:chunks.length,sourceSnapshot:{text:String(sourceSnapshotText || normalizeOCR(originalText || '')),originalText:String(originalText || ''),title:String(chapterTitle.value || ''),normalized:true},settingsSnapshot:translationSettingsSnapshot});
        var runningJob = await PrungAksornStorageV2.updateTranslationJob({jobId:translationJobId,status:'running',expectedRevision:createdJob.revision});
        translationJobRevision = runningJob.revision;
      }catch(jobErr){
        setAiBusy(false);
        if(isAppContextCurrent(translationContext)){
          cancelBtn.classList.remove('show');
          showError('เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธชเธฃเนเธฒเธ Translation Job เนเธ”เน: ' + (jobErr.message || jobErr));
        }
        return;
      }
    }else{
      var recoveredSettingsSnapshot = normalizeTranslationSettingsSnapshot(settingsSnapshot, translationProvider, model, document.getElementById('chunkLen').value);
      var recoveredRunningJob = await PrungAksornStorageV2.updateTranslationJob({jobId:translationJobId,status:'running',settingsSnapshot:recoveredSettingsSnapshot,expectedRevision:Number(pendingResume && pendingResume.revision || 0)});
      translationJobRevision = recoveredRunningJob.revision;
      translationProvider = recoveredRunningJob.provider;
      translationSettingsSnapshot = normalizeTranslationSettingsSnapshot(recoveredRunningJob.settingsSnapshot || settingsSnapshot, translationProvider, recoveredRunningJob.model, recoveredRunningJob.chunkSize);
    }
    activeTranslationJobId = translationJobId;
    activeTranslationJobRevision = translationJobRevision;
    setTranslationSettingsLocked(true);
    var chunkRatios = [];
    var suspiciousChunks = [];

    try {
      for(var i = startIndex; i < chunks.length; i++){
        // เธ•เธฃเธงเธเธเธฑเธเธเธณเธเธงเธเธเธณเธจเธฑเธเธ—เนเธ—เธตเนเธ•เธฃเธงเธเธเธเนเธ Chunk เธเธฑเธเธเธธเธเธฑเธ
        var termCheck = filterRelevantGlossary(proj.glossary, chunks[i]);
        var badge = termCheck.count > 0 ? (' (เนเธเนเธเธฅเธฑเธเธเธณ ' + termCheck.count + ' เธเธณ)') : '';

        if(isAppContextCurrent(translationContext)){
          progressText.textContent = 'เธเธณเธฅเธฑเธเธเธฃเธธเธเธชเนเธงเธเธ—เธตเน ' + (i + 1) + '/' + chunks.length + badge;
        }

        // เธชเนเธ chunks[i] เน€เธเนเธฒเนเธเธ”เนเธงเธข Snapshot เธเธญเธ settings เน€เธเธทเนเธญเนเธกเนเนเธซเน global UI state เน€เธเธฅเธตเนเธขเธ prompt เธฃเธฐเธซเธงเนเธฒเธ Job
        var sys = buildTranslatePromptWithSettings(proj, previousTail, chunks[i], translationSettingsSnapshot);
        var part = await callAIWithRetry(sys, chunks[i], key, model, activeController.signal, 2, translationProvider);
        var partTrim = part.trim();

        var analysis = analyzeChunkRatio(chunks[i], partTrim, chunkRatios);
        if(analysis){
          chunkRatios.push(analysis.ratio);
          if(analysis.suspicious) suspiciousChunks.push({ index: i, reasons: analysis.reasons });
        }

        previousTail = getTail(partTrim, 300);
        translationRetryCount = 0;
        var checkpointedJob = await PrungAksornStorageV2.checkpointTranslationJob({jobId:translationJobId,retryCount:translationRetryCount,expectedRevision:translationJobRevision},i,partTrim,previousTail);
        translationJobRevision = checkpointedJob.revision;
        activeTranslationJobRevision = translationJobRevision;
        results.push(partTrim);
        if(isAppContextCurrent(translationContext)){
          setOutput(results.join('\n\n'));
        }
      }
      await PrungAksornStorageV2.completeTranslationJob(translationJobId, translationJobRevision);
      var translationOutput = results.join('\n\n');
      var translationContextCurrent = isAppContextCurrent(translationContext);
      activeTranslationJobRevision = null;
      pendingResume = null;
      activeTranslationJobId = null;
      if(translationContextCurrent) clearTranslationRecoveryUI();

      var newEntry = { id: translationChapterId, ts: Date.now(), label: translationTitle, input: originalText, output: translationOutput };
      if(activeBook) activeBook.history.push(newEntry);
      else (proj.history = proj.history || []).push(newEntry);

      commitChange();

      if(translationContextCurrent){
        setOutput(translationOutput);
        analyzeTQGCompletedOutput(sourceSnapshotText || normalizeOCR(originalText || ''), translationOutput, proj);
        viewingHistoryId = newEntry.id;
        stamp.classList.add('show');
        setResultFocus(true);
        switchMobileTab('output');
        scrollToTopTarget();
        refreshTranslationRecoveryUI();

        if(suspiciousChunks.length){
          var warnMsg = 'โ  เธเธ ' + suspiciousChunks.length + ' เธชเนเธงเธเธ—เธตเนเธเธณเนเธเธฅเธญเธฒเธเนเธกเนเธเธฃเธเธ–เนเธงเธ เนเธเธฐเธเธณเนเธซเนเธ•เธฃเธงเธเธ—เธฒเธเน€เธเธดเนเธกเน€เธ•เธดเธก:\n' +
            suspiciousChunks.map(function(s){ return 'โ€ข เธชเนเธงเธเธ—เธตเน ' + (s.index + 1) + ': ' + s.reasons.join('; '); }).join('\n');
          showQualityWarning(warnMsg);
        }

        var missed = checkMissedGlossaryTerms(originalText, translationOutput, proj.glossary);
        renderGlossaryEnforceWarning(missed);

        var statsStr = '';
        if(currentActionTokens > 0) statsStr = ' (เนเธเนเนเธ ' + currentActionTokens.toLocaleString() + ' tokens, ~$' + currentActionCost.toFixed(4) + ')';
        progressText.textContent = 'เธเธฃเธธเธเธญเธฑเธเธฉเธฃเน€เธชเธฃเนเธเธชเธดเนเธ' + statsStr;
        setTimeout(function(){ if(isAppContextCurrent(translationContext) && progressText.textContent.includes('เธเธฃเธธเธเธญเธฑเธเธฉเธฃเน€เธชเธฃเนเธเธชเธดเนเธ')) progressText.textContent = ''; }, 4000);
      } else {
        refreshTranslationRecoveryUI();
      }

    } catch(err){
      if(err.name !== 'AbortError'){
        var failedJob = await PrungAksornStorageV2.failTranslationJob(translationJobId,{code:'TRANSLATION_FAILED',message:String(err.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”'),chunkIndex:i,retryCount:translationRetryCount,timestamp:Date.now()},translationJobRevision);
        translationJobRevision = failedJob.revision;
        activeTranslationJobId = null;
        if(isAppContextCurrent(translationContext)){
          pendingResume = { chunks: chunks, proj: proj, key: key, model: model, provider: translationProvider, startIndex: i, results: results, originalText: originalText, chapterId: translationChapterId, jobId: translationJobId, sourceSnapshotText: sourceSnapshotText || normalizeOCR(originalText || ''), revision: translationJobRevision, settingsSnapshot: translationSettingsSnapshot };
          showError((err.message || 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”') + ' โ€” เธ—เธณเนเธเนเธฅเนเธง ' + i + '/' + chunks.length + ' เธชเนเธงเธ เธเธ” "เนเธเธฅเธ•เนเธญเธเธฒเธเธ—เธตเนเธเนเธฒเธ" เน€เธเธทเนเธญเธ—เธณเธ•เนเธญเธเธฒเธเธ•เธฃเธเธเธตเนเนเธ”เน (เนเธกเนเธ•เนเธญเธเน€เธฃเธดเนเธกเนเธซเธกเน)');
          if(resumeBtn) resumeBtn.classList.add('show');
          refreshTranslationRecoveryUI();
        }else{
          pendingResume = null;
        }
      } else {
        await PrungAksornStorageV2.cancelTranslationJob(translationJobId,translationJobRevision);
        pendingResume = null;
        activeTranslationJobId = null;
      }
    } finally {
      setTranslationSettingsLocked(false);
      setAiBusy(false);
      if(isAppContextCurrent(translationContext)){
        cancelBtn.classList.remove('show');
        if(!progressText.textContent.includes('เธเธฃเธธเธเธญเธฑเธเธฉเธฃเน€เธชเธฃเนเธเธชเธดเนเธ')) progressText.textContent = '';
      }
    }
  }

  var batchInProgress = false;
  var batchCancelled = false;
