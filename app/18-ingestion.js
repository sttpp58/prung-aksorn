/* ---------------- External Auto-Ingestion Receiver (พร้อมแปลชื่อตอนเป็นไทย) ---------------- */
  async function importExternalChapter(title, content, autoStart) {
    if (!content) return;
    var proj = getCurrentProject();
    if (!proj) {
      showError('กรุณาสร้างหรือเลือกเรื่องนิยายก่อนรับข้อมูลจากเว็บ');
      return;
    }
    var ingestBook = getActiveBook(proj);
    if(!ingestBook){
      showError('ไม่พบเล่มต้นทางของข้อมูลที่นำเข้า');
      return;
    }
    advanceAppContextGeneration();
    var ingestContext = captureAppContext(proj, ingestBook);
    hideError();
    hideGlossaryEnforce();

    // 1. Stage 1: คลีนข้อความชื่อตอนด่วนด้วย Regex
    var cleanTitle = (title || '').trim();
    // แยกคำที่ติดกัน เช่น "GodChapter 3391" -> "Chapter 3391"
    cleanTitle = cleanTitle.replace(/([a-zA-Z])(Chapter\s*\d+)/i, '$1 $2');

    var chapMatch = cleanTitle.match(/(?:Chapter|ตอนที่|บทที่)\s*(\d+)[:\s-]*(.*)/i);
    var chapNum = chapMatch ? chapMatch[1] : '';
    var rawSubtitle = chapMatch ? chapMatch[2].trim() : cleanTitle;

    // ตั้งค่าชื่อตอนเบื้องต้นทันที (เช่น "บทที่ 3391: Natural Spirit")
    if (chapNum) {
      chapterTitle.value = 'บทที่ ' + chapNum + (rawSubtitle ? ': ' + rawSubtitle : '');
    } else {
      chapterTitle.value = cleanTitle || 'ตอนใหม่';
    }

    inputText.value = normalizeOCR(content.trim());
    inCount.textContent = countWords(inputText.value) + ' คำ';
    updateChunkInfo();
    highlightSuspicious(inputText.value);
    saveDraftSoon();
    switchMobileTab('source');

    progressText.textContent = ' นำเข้าเนื้อหาเรียบร้อย กำลังเตรียมแปล...';

    // 2. Stage 2: สั่งแปลชื่อตอนเป็นภาษาไทยด้วย AI แบบเบื้องหลัง (Background Parallel Task)
    var key = document.getElementById('apiKey').value.trim();
    if (key && rawSubtitle && /[a-zA-Z]/.test(rawSubtitle)) {
      (async function translateTitleBackground() {
        try {
          var filterRes = filterRelevantGlossary(proj.glossary, rawSubtitle);
          var glossHint = filterRes.text ? (' ยึดตามคลังคำ: ' + filterRes.text) : '';
          var sysTitle = "คุณคือนักแปลนิยาย แปลชื่อตอนภาษาอังกฤษต่อไปนี้เป็นชื่อตอนภาษาไทยที่สละสลวย กระชับ เหมาะกับนิยายแฟนตาซี/กำลังภายใน" +
                         glossHint + " ตอบเฉพาะชื่อตอนภาษาไทยเท่านั้น ห้ามใส่เครื่องหมายคำพูด ห้ามมีคำนำ";
          var translatedSub = await callAIWithRetry(sysTitle, rawSubtitle, key, modelInput.value, null, 1);
          if (translatedSub && translatedSub.trim()) {
            var finalTitle = chapNum ? ('บทที่ ' + chapNum + ': ' + translatedSub.trim()) : translatedSub.trim();
            var targetProj = appData.projects.find(function(p){ return p.id === ingestContext.projectId; }) || null;
            var targetBook = targetProj && (targetProj.books || []).find(function(b){ return b.id === ingestContext.bookId; }) || null;
            if(!targetBook || !isAppContextCurrent(ingestContext)) return;
            targetBook.chapterTitle = finalTitle;
            chapterTitle.value = finalTitle;
            saveData();
          }
        } catch(e) {
          console.warn('แปลชื่อตอนไม่สำเร็จ ใช้ชื่อเดิม:', e);
        }
      })();
    }

    // 3. สั่งเริ่มแปลเนื้อหาทันที
    if (autoStart && !aiBusy) {
      setTimeout(function() {
        if(!isAppContextCurrent(ingestContext) || aiBusy) return;
        processBtn.click();
      }, 400);
    }
  }

  // ดักฟังสัญญาณที่ส่งมาจาก Tampermonkey
  function validatePrungIngestMessage(e) {
    if (!e || e.source !== window || e.origin !== window.location.origin) return null;
    var data = e.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    if (data.type !== 'PRUNG_INGEST') return null;
    if (data.title !== undefined && (typeof data.title !== 'string' || data.title.length > 500)) return null;
    if (typeof data.content !== 'string' || !data.content.trim() || data.content.length > 500000) return null;
    if (data.autoStart !== undefined && typeof data.autoStart !== 'boolean') return null;
    return {
      title: typeof data.title === 'string' ? data.title : '',
      content: data.content,
      autoStart: data.autoStart === true
    };
  }

  // External ingestion receiver
  window.addEventListener('message', function(e) {
    var ingestMessage = validatePrungIngestMessage(e);
    if (ingestMessage) {
      importExternalChapter(ingestMessage.title, ingestMessage.content, ingestMessage.autoStart)
        .catch(function(err){
          console.error('External chapter import failed:', err);
        });
    }
  });

  /* เริ่มต้นระบบแบบ Asynchronous */
