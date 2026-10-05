  async function runSurgicalGlossaryFixWithAI(missedTerms){
    var key = document.getElementById('apiKey').value.trim();
    if(!key){ await showAlertDialog('ยังไม่ได้ใส่ API Key', 'กรุณาใส่ API Key ในหน้าตั้งค่าก่อน'); return; }
    if(warnIfAiBusy()) return;
    var surgicalContext = captureAppContext(getCurrentProject(), getActiveBook(getCurrentProject()));
    var surgicalOutputSnapshot = output.textContent;

    var termRules = missedTerms.map(function(t){ return '- ต้นฉบับ: "' + t.src + '" ต้องแปลเป็น: "' + t.trans + '"'; }).join('\n');
    var sys = "คุณคือระบบตรวจสอบและแก้ไขคุณภาพข้อความแปลภาษาไทย "
      + "มีหน้าที่แก้ไขคำศัพท์เฉพาะที่แปลผิดและตรวจจับข้อความภาษาต่างประเทศที่หลุดปะปนมาในบทแปล "
      + "โดยต้องรักษาเนื้อหาต้นฉบับส่วนที่ถูกต้องไว้ให้มากที่สุด\n\n" + "[รายการคำศัพท์เฉพาะ]\n" + (termRules || "ไม่มีรายการคำศัพท์ที่ต้องแก้ไข")
      + "\n\n" + "[ภารกิจที่ 1: ตรวจสอบคำศัพท์เฉพาะ]\n"
      + "1. ตรวจสอบคำศัพท์ในข้อความเทียบกับรายการคำศัพท์ที่กำหนด\n"
      + "2. แก้ไขคำศัพท์ที่แปลไม่ตรงตามรายการ โดยพิจารณาความหมายและบริบทประกอบ\n"
      + "3. หากคำศัพท์ถูกต้องอยู่แล้ว ให้คงข้อความเดิมไว้\n" + "4. ห้ามแทนที่คำที่ตรงกันเพียงบางส่วน หากอาจทำให้ความหมายหรือรูปคำผิดเพี้ยน\n\n"
      + "[ภารกิจที่ 2: ตรวจจับภาษาต่างประเทศที่หลุดปะปน]\n" + "1. ตรวจสอบข้อความภาษาไทยเพื่อค้นหาคำ วลี หรือประโยคภาษาต่างประเทศที่อาจหลงเหลือจากการแปล\n"
      + "2. พิจารณาว่าข้อความภาษาต่างประเทศนั้นเป็นส่วนหนึ่งของเนื้อหาที่ควรแปลหรือเป็นคำที่จำเป็นต้องคงไว้\n"
      + "3. หากพบคำหรือวลีภาษาต่างประเทศที่เป็นข้อผิดพลาดจากการแปล ให้แปลหรือแทนที่เป็นภาษาไทยตามความหมายและบริบทของประโยค\n"
      + "4. หากไม่สามารถระบุความหมายได้อย่างมั่นใจ ห้ามเดาความหมายหรือสร้างข้อความทดแทน ให้คงข้อความเดิมไว้\n" + "5. ห้ามถือว่าคำภาษาต่างประเทศทุกคำเป็นข้อผิดพลาดโดยอัตโนมัติ\n\n" +
      "[ข้อยกเว้นที่ต้องระมัดระวัง]\n" + "1. ชื่อบุคคล ชื่อสถานที่ ชื่อองค์กร ชื่อสำนัก ชื่อทักษะ และชื่อเฉพาะที่ควรคงรูปเดิม\n" +
      "2. คำทับศัพท์ภาษาไทยที่ใช้กันตามปกติ\n" + "3. คำศัพท์เฉพาะหรือคำต่างประเทศที่มีความจำเป็นต่อเนื้อหา\n" +
      "4. ตัวเลข สัญลักษณ์ อักษรย่อ และข้อความที่ไม่ใช่เนื้อหาสำหรับแปล\n" + "5. ข้อความภาษาต่างประเทศที่เป็นส่วนหนึ่งของบทสนทนา ชื่อเรื่อง หรือข้อความอ้างอิงที่ไม่ควรแปลตามบริบท\n\n" +
      "[ข้อจำกัดในการแก้ไข]\n" + "1. แก้ไขเฉพาะคำศัพท์ที่ผิดและข้อความภาษาต่างประเทศที่ยืนยันได้ว่าเป็นข้อผิดพลาดจากการแปล\n" +
      "2. ห้ามเรียบเรียง เขียนใหม่ สรุป ขยายความ หรือตัดทอนประโยคที่ถูกต้องอยู่แล้ว\n" +
      "3. ห้ามเปลี่ยนแปลงเนื้อหา ลำดับประโยค ลำดับย่อหน้า หรือโครงสร้างของข้อความโดยไม่จำเป็น\n" +
      "4. รักษาเครื่องหมายวรรคตอน เครื่องหมายคำพูด การเว้นวรรค และรูปแบบข้อความเดิมให้มากที่สุด\n" +
      "5. ห้ามเพิ่มเนื้อหาใหม่หรือแต่งเติมข้อมูลที่ไม่มีอยู่ในข้อความต้นฉบับ\n" +
      "6. หากไม่พบข้อผิดพลาด ให้คงข้อความต้นฉบับไว้โดยไม่เปลี่ยนแปลง\n\n" +
      "[รูปแบบผลลัพธ์]\n" +
      "1. ส่งคืนข้อความฉบับเต็มหลังตรวจสอบและแก้ไขแล้วเท่านั้น\n" +
      "2. ห้ามรายงานรายการคำที่ตรวจพบหรือคำที่แก้ไข\n" +
      "3. ห้ามแสดงเหตุผล ขั้นตอนการวิเคราะห์ หรือคำอธิบายเพิ่มเติม\n" +
      "4. ห้ามใช้ Markdown หรือเพิ่มข้อความครอบผลลัพธ์";

    activeController = new AbortController();
    setAiBusy(true);
    cancelBtn.classList.add('show');
    progressText.textContent = 'กำลังให้ AI แทนที่คำศัพท์ให้ตรงตามคลังคำ...';

    try {
      var currentOutput = surgicalOutputSnapshot;
      var fixedResult = await callAIWithRetry(sys, currentOutput, key, modelInput.value, activeController.signal, 1);
      if(fixedResult && fixedResult.trim()){
        if(!isAppContextCurrent(surgicalContext) || output.textContent !== surgicalOutputSnapshot) return;
        output.textContent = fixedResult.trim();
        output.dispatchEvent(new Event('input'));
        hideGlossaryEnforce();
        progressText.textContent = 'แก้ไขคำศัพท์ให้ตรงตามคลังคำเรียบร้อย!';
        setTimeout(function(){ if(isAppContextCurrent(surgicalContext) && progressText.textContent.includes('แก้ไขคำศัพท์ให้ตรงตามคลังคำเรียบร้อย!')) progressText.textContent = ''; }, 3000);
      }
    } catch(err){
      if(err.name !== 'AbortError' && isAppContextCurrent(surgicalContext)) await showAlertDialog('แก้ไขไม่สำเร็จ', err.message);
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
    var translationTitle = String(chapterTitle.value || 'แปลใหม่');
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
          showError('ไม่สามารถสร้าง Translation Job ได้: ' + (jobErr.message || jobErr));
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
        // ตรวจนับจำนวนคำศัพท์ที่ตรวจพบใน Chunk ปัจจุบัน
        var termCheck = filterRelevantGlossary(proj.glossary, chunks[i]);
        var badge = termCheck.count > 0 ? (' (ใช้คลังคำ ' + termCheck.count + ' คำ)') : '';

        if(isAppContextCurrent(translationContext)){
          progressText.textContent = 'กำลังปรุงส่วนที่ ' + (i + 1) + '/' + chunks.length + badge;
        }

        // ส่ง chunks[i] เข้าไปด้วย Snapshot ของ settings เพื่อไม่ให้ global UI state เปลี่ยน prompt ระหว่าง Job
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
          var warnMsg = '⚠ พบ ' + suspiciousChunks.length + ' ส่วนที่คำแปลอาจไม่ครบถ้วน แนะนำให้ตรวจทานเพิ่มเติม:\n' +
            suspiciousChunks.map(function(s){ return '• ส่วนที่ ' + (s.index + 1) + ': ' + s.reasons.join('; '); }).join('\n');
          showQualityWarning(warnMsg);
        }

        var missed = checkMissedGlossaryTerms(originalText, translationOutput, proj.glossary);
        renderGlossaryEnforceWarning(missed);

        var statsStr = '';
        if(currentActionTokens > 0) statsStr = ' (ใช้ไป ' + currentActionTokens.toLocaleString() + ' tokens, ~$' + currentActionCost.toFixed(4) + ')';
        progressText.textContent = 'ปรุงอักษรเสร็จสิ้น' + statsStr;
        setTimeout(function(){ if(isAppContextCurrent(translationContext) && progressText.textContent.includes('ปรุงอักษรเสร็จสิ้น')) progressText.textContent = ''; }, 4000);
      } else {
        refreshTranslationRecoveryUI();
      }

    } catch(err){
      if(err.name !== 'AbortError'){
        var failedJob = await PrungAksornStorageV2.failTranslationJob(translationJobId,{code:'TRANSLATION_FAILED',message:String(err.message || 'เกิดข้อผิดพลาด'),chunkIndex:i,retryCount:translationRetryCount,timestamp:Date.now()},translationJobRevision);
        translationJobRevision = failedJob.revision;
        activeTranslationJobId = null;
        if(isAppContextCurrent(translationContext)){
          pendingResume = { chunks: chunks, proj: proj, key: key, model: model, provider: translationProvider, startIndex: i, results: results, originalText: originalText, chapterId: translationChapterId, jobId: translationJobId, sourceSnapshotText: sourceSnapshotText || normalizeOCR(originalText || ''), revision: translationJobRevision, settingsSnapshot: translationSettingsSnapshot };
          showError((err.message || 'เกิดข้อผิดพลาด') + ' — ทำไปแล้ว ' + i + '/' + chunks.length + ' ส่วน กด "แปลต่อจากที่ค้าง" เพื่อทำต่อจากตรงนี้ได้ (ไม่ต้องเริ่มใหม่)');
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
        if(!progressText.textContent.includes('ปรุงอักษรเสร็จสิ้น')) progressText.textContent = '';
      }
    }
  }

  var batchInProgress = false;
  var batchCancelled = false;
