/* ---------------- External Auto-Ingestion Receiver (เธเธฃเนเธญเธกเนเธเธฅเธเธทเนเธญเธ•เธญเธเน€เธเนเธเนเธ—เธข) ---------------- */
  async function importExternalChapter(title, content, autoStart) {
    if (!content) return;
    var proj = getCurrentProject();
    if (!proj) {
      showError('เธเธฃเธธเธ“เธฒเธชเธฃเนเธฒเธเธซเธฃเธทเธญเน€เธฅเธทเธญเธเน€เธฃเธทเนเธญเธเธเธดเธขเธฒเธขเธเนเธญเธเธฃเธฑเธเธเนเธญเธกเธนเธฅเธเธฒเธเน€เธงเนเธ');
      return;
    }
    var ingestBook = getActiveBook(proj);
    if(!ingestBook){
      showError('เนเธกเนเธเธเน€เธฅเนเธกเธ•เนเธเธ—เธฒเธเธเธญเธเธเนเธญเธกเธนเธฅเธ—เธตเนเธเธณเน€เธเนเธฒ');
      return;
    }
    advanceAppContextGeneration();
    var ingestContext = captureAppContext(proj, ingestBook);
    hideError();
    hideGlossaryEnforce();

    // 1. Stage 1: เธเธฅเธตเธเธเนเธญเธเธงเธฒเธกเธเธทเนเธญเธ•เธญเธเธ”เนเธงเธเธ”เนเธงเธข Regex
    var cleanTitle = (title || '').trim();
    // เนเธขเธเธเธณเธ—เธตเนเธ•เธดเธ”เธเธฑเธ เน€เธเนเธ "GodChapter 3391" -> "Chapter 3391"
    cleanTitle = cleanTitle.replace(/([a-zA-Z])(Chapter\s*\d+)/i, '$1 $2');

    var chapMatch = cleanTitle.match(/(?:Chapter|เธ•เธญเธเธ—เธตเน|เธเธ—เธ—เธตเน)\s*(\d+)[:\s-]*(.*)/i);
    var chapNum = chapMatch ? chapMatch[1] : '';
    var rawSubtitle = chapMatch ? chapMatch[2].trim() : cleanTitle;

    // เธ•เธฑเนเธเธเนเธฒเธเธทเนเธญเธ•เธญเธเน€เธเธทเนเธญเธเธ•เนเธเธ—เธฑเธเธ—เธต (เน€เธเนเธ "เธเธ—เธ—เธตเน 3391: Natural Spirit")
    if (chapNum) {
      chapterTitle.value = 'เธเธ—เธ—เธตเน ' + chapNum + (rawSubtitle ? ': ' + rawSubtitle : '');
    } else {
      chapterTitle.value = cleanTitle || 'เธ•เธญเธเนเธซเธกเน';
    }

    inputText.value = normalizeOCR(content.trim());
    inCount.textContent = countWords(inputText.value) + ' เธเธณ';
    updateChunkInfo();
    highlightSuspicious(inputText.value);
    saveDraftSoon();
    switchMobileTab('source');

    progressText.textContent = ' เธเธณเน€เธเนเธฒเน€เธเธทเนเธญเธซเธฒเน€เธฃเธตเธขเธเธฃเนเธญเธข เธเธณเธฅเธฑเธเน€เธ•เธฃเธตเธขเธกเนเธเธฅ...';

    // 2. Stage 2: เธชเธฑเนเธเนเธเธฅเธเธทเนเธญเธ•เธญเธเน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธขเธ”เนเธงเธข AI เนเธเธเน€เธเธทเนเธญเธเธซเธฅเธฑเธ (Background Parallel Task)
    var key = document.getElementById('apiKey').value.trim();
    if (key && rawSubtitle && /[a-zA-Z]/.test(rawSubtitle)) {
      (async function translateTitleBackground() {
        try {
          var filterRes = filterRelevantGlossary(proj.glossary, rawSubtitle);
          var glossHint = filterRes.text ? (' เธขเธถเธ”เธ•เธฒเธกเธเธฅเธฑเธเธเธณ: ' + filterRes.text) : '';
          var sysTitle = "เธเธธเธ“เธเธทเธญเธเธฑเธเนเธเธฅเธเธดเธขเธฒเธข เนเธเธฅเธเธทเนเธญเธ•เธญเธเธ เธฒเธฉเธฒเธญเธฑเธเธเธคเธฉเธ•เนเธญเนเธเธเธตเนเน€เธเนเธเธเธทเนเธญเธ•เธญเธเธ เธฒเธฉเธฒเนเธ—เธขเธ—เธตเนเธชเธฅเธฐเธชเธฅเธงเธข เธเธฃเธฐเธเธฑเธ เน€เธซเธกเธฒเธฐเธเธฑเธเธเธดเธขเธฒเธขเนเธเธเธ•เธฒเธเธต/เธเธณเธฅเธฑเธเธ เธฒเธขเนเธ" +
                         glossHint + " เธ•เธญเธเน€เธเธเธฒเธฐเธเธทเนเธญเธ•เธญเธเธ เธฒเธฉเธฒเนเธ—เธขเน€เธ—เนเธฒเธเธฑเนเธ เธซเนเธฒเธกเนเธชเนเน€เธเธฃเธทเนเธญเธเธซเธกเธฒเธขเธเธณเธเธนเธ” เธซเนเธฒเธกเธกเธตเธเธณเธเธณ";
          var translatedSub = await callAIWithRetry(sysTitle, rawSubtitle, key, modelInput.value, null, 1);
          if (translatedSub && translatedSub.trim()) {
            var finalTitle = chapNum ? ('เธเธ—เธ—เธตเน ' + chapNum + ': ' + translatedSub.trim()) : translatedSub.trim();
            var targetProj = appData.projects.find(function(p){ return p.id === ingestContext.projectId; }) || null;
            var targetBook = targetProj && (targetProj.books || []).find(function(b){ return b.id === ingestContext.bookId; }) || null;
            if(!targetBook || !isAppContextCurrent(ingestContext)) return;
            targetBook.chapterTitle = finalTitle;
            chapterTitle.value = finalTitle;
            saveData();
          }
        } catch(e) {
          console.warn('เนเธเธฅเธเธทเนเธญเธ•เธญเธเนเธกเนเธชเธณเน€เธฃเนเธ เนเธเนเธเธทเนเธญเน€เธ”เธดเธก:', e);
        }
      })();
    }

    // 3. เธชเธฑเนเธเน€เธฃเธดเนเธกเนเธเธฅเน€เธเธทเนเธญเธซเธฒเธ—เธฑเธเธ—เธต
    if (autoStart && !aiBusy) {
      setTimeout(function() {
        if(!isAppContextCurrent(ingestContext) || aiBusy) return;
        processBtn.click();
      }, 400);
    }
  }

  // เธ”เธฑเธเธเธฑเธเธชเธฑเธเธเธฒเธ“เธ—เธตเนเธชเนเธเธกเธฒเธเธฒเธ Tampermonkey
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

  /* เน€เธฃเธดเนเธกเธ•เนเธเธฃเธฐเธเธเนเธเธ Asynchronous */
