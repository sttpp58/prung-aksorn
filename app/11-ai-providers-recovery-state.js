  async function callOpenAI(sys, text, key, model, signal, responseFormat){
    var body = {
      model: model,
      messages: [{role:'system', content:sys}, {role:'user', content:text}],
      temperature: 0.1
    };
    if(responseFormat === 'json'){
      body.response_format = { type: 'json_object' };
    }
    var res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: JSON.stringify(body),
      signal: signal
    });
    if(!res.ok){
      var errData = await res.json().catch(function(){ return {}; });
      var e1 = new Error(errData.error && errData.error.message ? errData.error.message : ('OpenAI error: ' + res.status));
      e1.status = res.status;
      throw e1;
    }
    var data = await res.json();
    if(data.usage) {
      updateApiStats(model, data.usage.prompt_tokens || 0, data.usage.completion_tokens || 0);
    }
    return data.choices[0].message.content;
  }

  /* เรียก Gemini โดยส่ง Key ผ่าน Header x-goog-api-key */
  async function callGemini(sys, text, key, model, signal, responseFormat){
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent';
    var generationConfig = {
      temperature: 0.0,
      topP: 0.1
    };
    if(responseFormat === 'json'){
      generationConfig.responseMimeType = 'application/json';
    }
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sys }] },
        contents: [{ parts: [{ text: text }] }],
        generationConfig: generationConfig
      }),
      signal: signal
    });
    if(!res.ok){
      var errData = await res.json().catch(function(){ return {}; });
      var e2 = new Error(errData.error && errData.error.message ? errData.error.message : ('Gemini error: ' + res.status));
      e2.status = res.status;
      throw e2;
    }
    var data = await res.json();
    if(data.usageMetadata) {
      updateApiStats(model, data.usageMetadata.promptTokenCount || 0, data.usageMetadata.candidatesTokenCount || 0);
    }

    if(data.promptFeedback && data.promptFeedback.blockReason){
      var eBlocked = new Error('Gemini ปฏิเสธคำขอนี้ทั้งหมด เนื่องจาก ' + describeGeminiBlockReason(data.promptFeedback.blockReason) + ' — ลองแบ่งเนื้อหาให้สั้น/เบาลง หรือสลับไปใช้โมเดล Gemini รุ่นเต็ม (ไม่ใช่ lite) แทน');
      eBlocked.status = 'gemini_blocked';
      throw eBlocked;
    }

    var candidate = data.candidates && data.candidates[0];
    var parts = candidate && candidate.content && candidate.content.parts;
    var textOut = (parts && parts.length) ? parts.map(function(p){ return p.text || ''; }).join('') : '';

    if(!textOut){
      var reasonMsg = describeGeminiFinishReason(candidate && candidate.finishReason);
      var eEmpty = new Error('Gemini ไม่สามารถแปลข้อความส่วนนี้ได้ (' + reasonMsg + ') — ลองแบ่งเนื้อหาให้สั้นลง หรือสลับไปใช้โมเดล Gemini รุ่นเต็ม (ไม่ใช่ lite) แทน');
      eEmpty.status = 'gemini_empty';
      throw eEmpty;
    }

    if(candidate.finishReason === 'MAX_TOKENS'){
      showError('คำเตือน: คำแปลของส่วนนี้อาจถูกตัดกลางคัน เพราะยาวเกินขีดจำกัดคำตอบของโมเดล ' + model + ' — แนะนำให้ลดขนาด "ความยาวสูงสุดต่อส่วน" ลงแล้วลองแปลส่วนนี้ใหม่');
    }

    return textOut;
  }

  var pendingResume = null;
  var pendingBatchResume = null;
  var activeTranslationJobId = null;
  var activeTranslationJobRevision = null;
  var translationRecoveryJobs = [];
  var RECOVERY_UI_STORAGE_KEY = 'prungAksornRecoveryUI-v1';
  var recoveryDismissed = Object.create(null);
  var aiBusy = false;

  function loadTranslationRecoveryUIState(){
    try{
      var raw = localStorage.getItem(RECOVERY_UI_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if(parsed && typeof parsed === 'object' && !Array.isArray(parsed)){
        Object.keys(parsed).forEach(function(key){
          if(Number.isFinite(Number(parsed[key]))) recoveryDismissed[key] = Number(parsed[key]);
        });
      }
    }catch(e){
      console.warn('Translation recovery UI state load failed:', e);
    }
  }

  function saveTranslationRecoveryUIState(){
    try{
      localStorage.setItem(RECOVERY_UI_STORAGE_KEY, JSON.stringify(recoveryDismissed));
    }catch(e){
      console.warn('Translation recovery UI state save failed:', e);
    }
  }

  function pruneTranslationRecoveryUIState(){
    var keys = Object.keys(recoveryDismissed);
    if(keys.length <= 200) return;
    keys.sort(function(a,b){ return recoveryDismissed[a] - recoveryDismissed[b]; });
    while(keys.length > 200) delete recoveryDismissed[keys.shift()];
    saveTranslationRecoveryUIState();
  }

  function getTranslationRecoveryStateKey(job){
    return String(job && job.jobId || '') + '@' +
      String(job && Number.isInteger(job.revision) ? job.revision : (job && job.updatedAt || 0));
  }

  function isTranslationRecoveryDismissed(job){
    return !!recoveryDismissed[getTranslationRecoveryStateKey(job)];
  }

  function dismissTranslationRecoveryJob(job){
    if(!job || !job.jobId) return;
    recoveryDismissed[getTranslationRecoveryStateKey(job)] = Date.now();
    pruneTranslationRecoveryUIState();
    saveTranslationRecoveryUIState();
    refreshTranslationRecoveryUI();
  }

  function getTranslationRecoveryLogicalKey(job){
    if(job && job.chapterId){
      return [job.projectId || '', job.bookId || '', job.chapterId].join('|');
    }
    return 'job|' + String(job && job.jobId || '');
  }

  function hasCompletedTranslationHistory(job){
    if(!job || !job.projectId || !job.chapterId) return false;
    var proj = appData.projects.find(function(p){ return p.id === job.projectId; });
    return !!(proj && findEntryById(proj, job.chapterId));
  }

  function dedupeTranslationRecoveryCandidates(candidates){
    var latest = Object.create(null);
    candidates.forEach(function(job){
      var key = getTranslationRecoveryLogicalKey(job);
      var prev = latest[key];
      if(!prev ||
         Number(job.updatedAt || 0) > Number(prev.updatedAt || 0) ||
         (Number(job.updatedAt || 0) === Number(prev.updatedAt || 0) && Number(job.revision || 0) > Number(prev.revision || 0))){
        latest[key] = job;
      }
    });
    return Object.keys(latest).map(function(key){ return latest[key]; })
      .sort(function(a,b){
        return Number(b.updatedAt || 0) - Number(a.updatedAt || 0) ||
               Number(b.revision || 0) - Number(a.revision || 0);
      });
  }
  function setTranslationSettingsLocked(locked){
    document.querySelectorAll('#sourceSeg button, #levelSeg button, #genreChips button, #styleSeg button').forEach(function(btn){
      btn.disabled = !!locked;
    });
  }

  function setAiBusy(busy){
    aiBusy = busy;
    processBtn.disabled = busy;
    if(resumeBtn) resumeBtn.disabled = busy;
    repairBtn.disabled = busy;
    if(batchImportBtn) batchImportBtn.disabled = busy;
    providerSel.disabled = busy;
    modelInput.disabled = busy;
    if(typeof setModelPickerDisabled === 'function') setModelPickerDisabled(busy);
    document.getElementById('chunkLen').disabled = busy;
  }
  function warnIfAiBusy(){
    if(aiBusy){
      showError('กำลังมีงาน AI อีกอย่างทำงานอยู่ กรุณารอให้เสร็จหรือกดยกเลิกก่อน');
      return true;
    }
    return false;
  }

  /* =============================================================
     ระบบตรวจจับและแทนที่คำศัพท์ที่ AI ลืมใช้ (Post-Translation Glossary Enforcer)
     ============================================================= */
  var glossaryEnforceBox = document.getElementById('glossaryEnforceBox');

  function hideGlossaryEnforce(){
    if(!glossaryEnforceBox) return;
    glossaryEnforceBox.style.display = 'none';
    glossaryEnforceBox.innerHTML = '';
  }

  // ฟังก์ชันสแกนหาคำที่ต้นฉบับมี แต่คำแปลภาษาไทยไม่มีคำนั้นปรากฏอยู่
  function checkMissedGlossaryTerms(sourceText, targetText, glossaryText){
    if(!sourceText || !targetText || !glossaryText || !glossaryText.trim()) return [];

    var lines = glossaryText.split('\n');
    var missed = [];
    var seen = Object.create(null);

    lines.forEach(function(line){
      var cleanLine = line.trim().replace(/^[-*•\d.]+\s*/, '').trim();
      if(!cleanLine || cleanLine.startsWith('[') || cleanLine.startsWith('#')) return;
      if(!cleanLine.includes('=')) return;

      var parts = cleanLine.split('=');
      var src = parts[0].trim();
      var trans = parts.slice(1).join('=').trim();
      if(!src || !trans) return;

      var keyLower = src.toLowerCase();
      if(seen[keyLower]) return;

      // ถ้าคำต้นฉบับปรากฏในข้อความต้นฉบับ แต่ "คำแปลไทย" กลับไม่ปรากฏในข้อความผลลัพธ์
      if(isTermInText(src, sourceText) && targetText.indexOf(trans) === -1){
        seen[keyLower] = true;
        missed.push({ src: src, trans: trans });
      }
    });

    return missed;
  }

  // ฟังก์ชันแสดงแถบแจ้งเตือนและปุ่มแก้ไข
  function renderGlossaryEnforceWarning(missedTerms){
    if(!glossaryEnforceBox) return;
    if(!missedTerms || missedTerms.length === 0){
      hideGlossaryEnforce();
      return;
    }

    glossaryEnforceBox.innerHTML = '';

    var header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';
    header.innerHTML = '<b style="color:var(--gold);font-size:13.5px;">⚠ พบคำศัพท์ที่ AI อาจไม่ได้แปลตามคลังคำ (' + missedTerms.length + ' คำ):</b>';

    var closeBtn = document.createElement('button');
    closeBtn.className = 'icon-btn';
    closeBtn.textContent = '✕';
    closeBtn.title = 'ซ่อนคำเตือนนี้';
    closeBtn.addEventListener('click', hideGlossaryEnforce);
    header.appendChild(closeBtn);
    glossaryEnforceBox.appendChild(header);

    var list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '6px';

    missedTerms.forEach(function(term){
      var row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '8px';
      row.style.padding = '6px 10px';
      row.style.background = 'var(--paper-card)';
      row.style.border = '1px solid var(--paper-line)';
      row.style.borderRadius = '4px';

      var label = document.createElement('span');
      label.innerHTML = '<code>' + escapeHtml(term.src) + '</code> ➔ <b style="color:var(--pen);">' + escapeHtml(term.trans) + '</b>';
      row.appendChild(label);

      var actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '6px';

      // ปุ่มแทนที่คำด้วยตัวเอง
      var replaceManualBtn = document.createElement('button');
      replaceManualBtn.className = 'utility-btn';
      replaceManualBtn.style.padding = '3px 8px';
      replaceManualBtn.style.fontSize = '11.5px';
      replaceManualBtn.textContent = '✎ แทนที่คำ';
      replaceManualBtn.addEventListener('click', async function(){
        var wrongWord = await showPromptDialog('พิมพ์คำในผลลัพธ์ที่ต้องการแทนที่ด้วย "' + term.trans + '":', '');
        if(wrongWord && wrongWord.trim()){
          var curOutput = output.textContent;
          var regex = new RegExp(escapeRegex(wrongWord.trim()), 'g');
          output.textContent = curOutput.replace(regex, term.trans);
          output.dispatchEvent(new Event('input'));
          // ตรวจสอบซ้ำหลังแทนที่
          var remaining = checkMissedGlossaryTerms(inputText.value, output.textContent, getCurrentProject().glossary);
          renderGlossaryEnforceWarning(remaining);
        }
      });
      actions.appendChild(replaceManualBtn);

      row.appendChild(actions);
      list.appendChild(row);
    });

    glossaryEnforceBox.appendChild(list);

    // ปุ่มกดให้ AI แก้ไขคำทั้งหมดแบบรวมศูนย์ใน 1 คลิก
    var aiFixAllContainer = document.createElement('div');
    aiFixAllContainer.style.marginTop = '10px';
    aiFixAllContainer.style.display = 'flex';
    aiFixAllContainer.style.justifyContent = 'flex-end';

    var aiFixAllBtn = document.createElement('button');
    aiFixAllBtn.className = 'utility-btn';
    aiFixAllBtn.style.background = 'var(--gold)';
    aiFixAllBtn.style.color = '#fff';
    aiFixAllBtn.style.borderColor = 'var(--gold)';
    aiFixAllBtn.style.fontWeight = '600';
    aiFixAllBtn.textContent = '⚡ ให้ AI ช่วยแทนที่คำศัพท์ทั้งหมดในผลลัพธ์ทันที';
    aiFixAllBtn.addEventListener('click', function(){
      runSurgicalGlossaryFixWithAI(missedTerms);
    });
    aiFixAllContainer.appendChild(aiFixAllBtn);
    glossaryEnforceBox.appendChild(aiFixAllContainer);

    glossaryEnforceBox.style.display = 'block';
  }

  // คำสั่งยิงให้ AI ทำ Surgical Edit แทนที่เฉพาะคำที่หลุดโดยไม่แตะต้องประโยคอื่น
