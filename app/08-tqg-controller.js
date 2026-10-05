  function hideQualityWarning(){
    qualityWarningBox.style.display = 'none';
    qualityWarningBox.textContent = '';
  }
  function showQualityWarning(msg){
    qualityWarningBox.textContent = msg;
    qualityWarningBox.style.display = 'block';
  }

  function resetTQGQualityPanel(){
    tqgQualityState = null;
    if(window.TQGQualityUI && tqgQualityPanel){
      window.TQGQualityUI.mount(tqgQualityPanel, {});
      tqgQualityPanel.hidden = true;
      if(tqgQualityToggleBtn) tqgQualityToggleBtn.setAttribute('aria-expanded', 'false');
    }
  }

  function renderTQGQualityPanel(){
    if(!window.TQGQualityUI || !tqgQualityPanel) return;
    var stateData = tqgQualityState || {};
    window.TQGQualityUI.mount(tqgQualityPanel, {
      analysis: stateData.analysis || null,
      inspection: stateData.inspection || null,
      repair: stateData.repair || null
    }, {
      onInspect: inspectCurrentTQGQuality,
      onRepair: repairCurrentTQGQuality
    });
  }

  function isTQGQualityContextCurrent(){
    if(!tqgQualityState || state.source !== 'translate') return false;
    var currentSource = normalizeOCR(inputText.value || '');
    var currentTarget = output.textContent || '';
    return isAppContextCurrent(tqgQualityState.context) &&
      currentSource === tqgQualityState.sourceText &&
      currentTarget === tqgQualityState.targetText;
  }

  function createTQGAITransport(){
    var key = document.getElementById('apiKey').value.trim();
    if(!key) throw new Error('กรุณาใส่ API Key ก่อนใช้ TQG AI Inspector/Repair');
    return function(request){
      return callAIWithRetry(
        request.systemPrompt,
        request.userPrompt,
        key,
        modelInput.value,
        activeController.signal,
        1,
        providerSel.value,
        'json'
      );
    };
  }

  function analyzeTQGCompletedOutput(sourceText, targetText, proj){
    if(state.source !== 'translate'){
      resetTQGQualityPanel();
      return;
    }
    if(!window.TQGIntegration || !window.TQGQualityUI) return;
    try{
      var result = window.TQGIntegration.analyzeCompletedOutput({
        completed: true,
        sourceText: String(sourceText || ''),
        targetText: String(targetText || ''),
        glossaryText: proj && typeof proj.glossary === 'string' ? proj.glossary : ''
      });
      if(result.status !== 'COMPLETED'){
        console.warn('TQG analysis did not complete:', result.reason || result.status);
        return;
      }
      tqgQualityState = {
        context: captureAppContext(proj, getActiveBook(proj)),
        sourceText: String(sourceText || ''),
        targetText: String(targetText || ''),
        glossaryText: proj && typeof proj.glossary === 'string' ? proj.glossary : '',
        analysis: result.analysis,
        inspection: null,
        repair: null
      };
      renderTQGQualityPanel();
    }catch(err){
      console.warn('TQG integration boundary failed safely:', err);
    }
  }

  async function inspectCurrentTQGQuality(){
    if(!tqgQualityState || !tqgQualityState.analysis) return;
    if(!isTQGQualityContextCurrent()){
      resetTQGQualityPanel();
      showQualityWarning('ผลตรวจ TQG เดิมไม่ตรงกับข้อความปัจจุบัน กรุณาแปลให้เสร็จก่อนตรวจซ้ำ');
      return;
    }
    if(warnIfAiBusy()) return;
    try{
      activeController = new AbortController();
      setAiBusy(true);
      resetActionStats();
      cancelBtn.classList.add('show');
      progressText.textContent = 'กำลังตรวจคุณภาพ TQG ด้วย AI Inspector...';
      var inspectionContext = captureAppContext(getCurrentProject(), getActiveBook(getCurrentProject()));
      var inspectionSourceText = tqgQualityState.sourceText;
      var inspectionTargetText = tqgQualityState.targetText;
      var result = await window.TQGIntegration.inspectCompletedOutput({
        completed: true,
        analysis: tqgQualityState.analysis,
        sourceText: tqgQualityState.sourceText,
        targetText: tqgQualityState.targetText,
        glossaryText: tqgQualityState.glossaryText,
        transport: createTQGAITransport(),
        analyzer: window.TQG ? window.TQG.analyze : null
      });
      if(!isAppContextCurrent(inspectionContext) ||
         !tqgQualityState ||
         tqgQualityState.sourceText !== inspectionSourceText ||
         tqgQualityState.targetText !== inspectionTargetText){
        return;
      }
      tqgQualityState.inspection = result;
      tqgQualityState.repair = null;
      renderTQGQualityPanel();
    }catch(err){
      if(err.name !== 'AbortError' && isAppContextCurrent(inspectionContext)) showError('TQG Inspector ไม่สำเร็จ: ' + (err.message || err));
    }finally{
      setAiBusy(false);
      if(isAppContextCurrent(inspectionContext)){
        cancelBtn.classList.remove('show');
        progressText.textContent = '';
      }
    }
  }

  async function repairCurrentTQGQuality(){
    if(!tqgQualityState || !tqgQualityState.analysis || !tqgQualityState.inspection) return;
    if(!isTQGQualityContextCurrent()){
      resetTQGQualityPanel();
      showQualityWarning('ผลตรวจ TQG เดิมไม่ตรงกับข้อความปัจจุบัน กรุณาตรวจผลลัพธ์ใหม่ก่อนซ่อม');
      return;
    }
    if(warnIfAiBusy()) return;
    try{
      activeController = new AbortController();
      setAiBusy(true);
      resetActionStats();
      cancelBtn.classList.add('show');
      progressText.textContent = 'กำลังซ่อมเฉพาะช่วงที่ TQG ยืนยัน...';
      var repairContext = captureAppContext(getCurrentProject(), getActiveBook(getCurrentProject()));
      var repairSourceText = tqgQualityState.sourceText;
      var repairTargetText = tqgQualityState.targetText;
      var inspection = tqgQualityState.inspection;
      var result = await window.TQGIntegration.repairConfirmedAnomaly({
        completed: true,
        analysis: tqgQualityState.analysis,
        originalAnalysis: tqgQualityState.analysis,
        sourceText: tqgQualityState.sourceText,
        targetText: tqgQualityState.targetText,
        glossaryText: tqgQualityState.glossaryText,
        findings: tqgQualityState.analysis.findings,
        suspiciousSpan: inspection.span,
        inspectorResult: inspection,
        repairInstruction: inspection.replacementHint || 'Repair only the confirmed suspicious span.',
        transport: createTQGAITransport(),
        analyze: window.TQG ? window.TQG.analyze : null
      });
      if(!isAppContextCurrent(repairContext) ||
         !tqgQualityState ||
         tqgQualityState.sourceText !== repairSourceText ||
         tqgQualityState.targetText !== repairTargetText){
        return;
      }
      tqgQualityState.repair = result;
      if(result.status === 'ACCEPTED' && result.accepted === true){
        tqgQualityState.targetText = result.output;
        output.textContent = result.output;
        outCount.textContent = countWords(result.output) + ' คำ';
        spread.classList.toggle('has-result', !!result.output.trim());
        copyBtn.disabled = false;
        downloadBtn.disabled = false;
        editOutputBtn.disabled = false;
        saveRevisionBtn.disabled = false;
      }
      renderTQGQualityPanel();
    }catch(err){
      if(err.name !== 'AbortError' && isAppContextCurrent(repairContext)) showError('TQG Repair ไม่สำเร็จ: ' + (err.message || err));
    }finally{
      setAiBusy(false);
      if(isAppContextCurrent(repairContext)){
        cancelBtn.classList.remove('show');
        progressText.textContent = '';
      }
    }
  }
