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
    inCount.textContent = countWords(inputText.value) + ' คำ';
    updateChunkInfo();
    highlightSuspicious(inputText.value);
    saveDraftSoon();
  });

  var chapterHeadingRegex = /^[ \t]*(?:(?:ตอนที่|ตอที่|ตอน|บทที่|บท|chapter|ch\.|episode|ep\.|第)[ \t]*[0-9〇零一二三四五六七八九十百千两]+(?:[ \t]*章)?|(?:บทนำ|บทำ|บทส่งท้าย|prologue|epilogue|番外)).*$/i;

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
      progressText.textContent = 'ซ่อมฟอนต์ & ดึงชื่อตอนอัตโนมัติเรียบร้อย';
    } else {
      progressText.textContent = 'คลีนอักษรขยะจาก OCR ให้เรียบร้อย';
    }
    setTimeout(function(){ progressText.textContent = ''; }, 2500);
  });

  clearBtn.addEventListener('click', async function(){
    if (inputText.value.trim() !== '' || output.textContent.trim() !== '') {
      var ok = await showConfirmDialog('ล้างข้อความ', 'ต้องการล้างข้อความและผลลัพธ์ทั้งหมด เพื่อเตรียมแปลเนื้อหาใหม่ใช่หรือไม่?\n\n(หากยังไม่ได้บันทึกฉบับแก้ไข ข้อมูลที่ยังไม่บันทึกจะหายไป)', true);
      if(!ok) return;
    }

    advanceAppContextGeneration();
    chapterTitle.value = '';
    inputText.value = '';
    inCount.textContent = '0 คำ';
    updateChunkInfo();
    highlightSuspicious('');

    hideGlossaryEnforce();
    setOutput('');
    output.contentEditable = 'false';
    editOutputBtn.textContent = 'แก้ไขผลลัพธ์';
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
    outCount.textContent = countWords(output.textContent) + ' คำ';
    saveRevisionBtn.disabled = !output.textContent.trim();
  });
  editOutputBtn.addEventListener('click', function(){
    var editing = output.contentEditable === 'true';
    output.contentEditable = editing ? 'false' : 'true';
    editOutputBtn.textContent = editing ? 'แก้ไขผลลัพธ์' : 'เสร็จสิ้น';
    if(!editing) output.focus();
  });

  saveRevisionBtn.addEventListener('click', async function(){
    var proj = getCurrentProject();
    var revised = output.textContent.trim();
    if(!proj || !revised) return;
    var label = await showPromptDialog('ตั้งชื่อฉบับแก้ไข', (chapterTitle.value || 'ฉบับแก้ไข'));
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
    progressText.textContent = 'บันทึกเรียบร้อย';
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
      showError('อ่านไฟล์ไม่สำเร็จ: ' + (err.message || ''));
      return;
    }

    var segments = detectChapterSplits(rawText);
    if(segments){
      var wantSplit = await showConfirmDialog(
        'พบหลายตอนในไฟล์นี้',
        'ตรวจพบรูปแบบหัวข้อตอนในไฟล์ทั้งหมด ' + segments.length + ' ตอน (เช่น "' + segments[0].label + '") ต้องการแบ่งและแปลทีละตอนอัตโนมัติหรือไม่?\n\nกด "ยกเลิก" เพื่อนำเข้าทั้งไฟล์เป็นก้อนเดียวแบบเดิมแทน'
      );
      if(wantSplit){
        var proj = getCurrentProject();
        var key = document.getElementById('apiKey').value.trim();
        if(!proj){ showError('กรุณาเลือกหรือสร้างเรื่องนิยายก่อน'); return; }
        if(!key){ showError('กรุณาใส่ API Key ก่อน'); return; }
        var virtualFiles = segments.map(function(seg){
          return { name: safeFilename(seg.label) + '.txt', __virtualText: seg.text };
        });
        runBatchImport(virtualFiles);
        return;
      }
    }

    inputText.value = rawText;
    inCount.textContent = countWords(inputText.value) + ' คำ';
    updateChunkInfo();
    highlightSuspicious(inputText.value);
    saveDraftSoon();
  });

  document.getElementById('exportBackupBtn').addEventListener('click', async function(){
    try{
      var flushed = await flushSaveData();
      if(!flushed){ await showAlertDialog('สำรองข้อมูลไม่สำเร็จ', 'ไม่สามารถบันทึกข้อมูลล่าสุดลงฐานข้อมูลได้'); return; }
      var payload = await storageV2.exportBackup();
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'prung-aksorn-backup-v2-' + new Date().toISOString().slice(0,10) + '.json';
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); }, 0);
    }catch(err){
      console.error('Backup export failed:', err);
      await showAlertDialog('สำรองข้อมูลไม่สำเร็จ', 'ไม่สามารถสร้างไฟล์สำรองข้อมูลที่มีความสมบูรณ์ได้');
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
          throw new Error('ไม่รู้จักรูปแบบไฟล์สำรองนี้ ระบบรองรับ Backup V2 และ Backup รุ่นเก่าก่อน V2 เท่านั้น');
        }

        var checked = await storageV2.validateBackup(rawParsed);
        var r = checked.report;
        var summary;
        if(format === 'legacy'){
          summary = 'พบไฟล์ Backup รุ่นเก่า\n\n' +
            'ระบบจะทำการแปลง Legacy → V2 Normalized ก่อนกู้คืน\n' +
            'Projects: '+r.projects+'\nBooks: '+r.books+'\nChapters: '+r.chapters+'\nGlossary: '+r.glossary+'\nRevisions: '+r.revisions+'\n\n' +
            'SHA-256: VALID (คำนวณใหม่จากข้อมูล V2 ที่แปลงแล้ว)\n' +
            'Schema ปลายทาง: 2 (supported)\n\n' +
            'ระบบจะไม่สร้างหรือกู้คืน Translation Jobs และจะสร้าง Safety Backup อัตโนมัติก่อนแทนที่ข้อมูลปัจจุบัน';
        }else{
          summary = 'Projects: '+r.projects+'\nBooks: '+r.books+'\nChapters: '+r.chapters+'\nGlossary: '+r.glossary+'\nRevisions: '+r.revisions+'\n\nSHA-256: VALID\nSchema: 2 (supported)\n\nการกู้คืนจะแทนที่ข้อมูลปัจจุบันทั้งหมด และระบบจะสร้าง Safety Backup อัตโนมัติก่อนดำเนินการ';
        }

        if(await showConfirmDialog('ยืนยันการกู้คืนข้อมูล', summary, true, 'ตกลง')){
          var result = await storageV2.restoreBackup(rawParsed);
          if(!result.success) throw new Error('Restore did not complete.');
          await loadData();
          applySettingsToUI();
          renderProjects();
          renderBottomHistory();
          updateActiveBanner();
          loadProjectDraft(getCurrentProject());
          await showAlertDialog(
            'กู้คืนสำเร็จ',
            format === 'legacy'
              ? 'กู้คืน Backup รุ่นเก่าเรียบร้อยแล้ว ระบบได้แปลงข้อมูลเป็น V2 และตรวจสอบฐานข้อมูลหลังการกู้คืนสำเร็จ'
              : 'กู้คืนข้อมูลและตรวจสอบฐานข้อมูลหลังการกู้คืนเรียบร้อยแล้ว'
          );
        }
      } catch(err) {
        console.error('Backup restore failed:', err);
        var msg = String(err&&err.message || 'ไม่สามารถกู้คืนไฟล์สำรองได้');
        if(msg.indexOf('rolled back safely')>=0){
          await showAlertDialog('กู้คืนไม่สำเร็จ', msg+'\n\nข้อมูลเดิมถูกนำกลับคืนแล้ว');
        }else if(msg.indexOf('rollback failed')>=0){
          await showAlertDialog('เกิดข้อผิดพลาดร้ายแรง', msg+'\n\nไม่สามารถยืนยันสถานะข้อมูลได้');
        }else{
          await showAlertDialog('ไฟล์สำรองไม่ถูกต้อง', msg);
        }
      }
    };
    reader.onerror = function(){
      console.error('Backup file read failed:', reader.error || file.name);
      showAlertDialog('อ่านไฟล์สำรองไม่สำเร็จ', 'ไม่สามารถอ่านไฟล์ Backup ที่เลือกได้ กรุณาลองไฟล์อื่นอีกครั้ง').catch(function(dialogErr){
        console.error('Backup file read error dialog failed:', dialogErr);
      });
    };
    reader.onabort = function(){
      console.warn('Backup file read aborted:', file.name);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });

/* ---------------- ฟังก์ชันทำความสะอาดอักขระขยะ, สระเพี้ยน & โฆษณาเว็บ ---------------- */
  function normalizeOCR(text){
    if(!text) return '';

    // 1. แปลงรหัส PUA พื้นฐานเดิม 8 ตัว
    var puaMap = {
      '\uE200': 'ก', '\uE201': 'ง', '\uE202': 'จ', '\uE203': 'ด',
      '\uE204': 'ค', '\uE205': 'น', '\uE206': 'ม', '\uE207': 'ร'
    };
    text = text.replace(/[\uE200-\uE207]/g, function(m){ return puaMap[m] || m; });

    // 2. ลบข้อความขยะ โฆษณา ปุ่มนำทาง และ Video Player Artifacts จากเว็บนิยาย
    text = text
      // ลบปุ่ม Previous/Next Chapter และ Table of Contents
      .replace(/^[ \t]*(?:[‹<«]?[ \t]*(?:Previous|Next)[ \t]*Chapter[ \t]*[›>»]?|Table of Contents|Back to list)[ \t]*$/gim, '')
      // ลบชื่อ Ad Network เช่น Ezoic
      .replace(/^[ \t]*Ezoic[ \t]*$/gim, '')
      // ลบปุ่มและข้อความจาก Video Player โฆษณา (Play, Unmute, Fullscreen ฯลฯ)
      .replace(/^[ \t]*(?:[×xX]|Play|Pause|Unmute|Mute|Fullscreen|Advertisement:\s*\d+:\d+|Now Playing|Play Video|Watch on|Video channel logo)[ \t]*$/gim, '')
      // ลบแถบหัวข้อและคำบรรยายวิดีโอโฆษณา (video of: ..., Daily Gospel ฯลฯ)
      .replace(/^[ \t]*(?:video of:\s*.*|Watch on\s*.*|.*Play Video.*)$/gim, '')
      .replace(/^[ \t]*(?:Daily Gospel.*|Catholic Bible.*|Fiction vs Nonfiction.*|Web Wealth.*)$/gim, '');

    // 3. ล้างอักขระล่องหน, สัญลักษณ์สแกนเพี้ยน, สระแอ
    return text
      .replace(/\r/g, '')
      .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF\u202A-\u202E]/g, '') // ลบ zero-width, soft-hyphen, bidi
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
      .replace(/[□■◆◇※¤]/g, '')
      .replace(/â€œ/g, '"').replace(/â€ /g, '"')
      .replace(/เเ/g, 'แ')
      .replace(/\n{3,}/g, '\n\n'); // ยุบบรรทัดว่างที่เกิดจากการลบขยะ ให้เหลือเว้นวรรคย่อหน้าปกติ (2 บรรทัด)
  }

  /* ---------------- ระบบตรวจจับข้อความเพี้ยน & ฟอนต์ PUA ---------------- */
  function highlightSuspicious(text){
    var box = document.getElementById('suspiciousBox');
    if(!box) return;
    if(!text || !text.trim()){ box.style.display = 'none'; box.innerHTML = ''; return; }

    var lines = text.split('\n');
    var puaRegex = /[\uE000-\uF8FF]/g;
    var danglingVowelRegex = /(?:^|\s)[ะัิีึืฺุู็่้๊๋์]/; // สระหรือวรรณยุกต์ลอยที่ไม่มีพยัญชนำหน้า
    var symbolRegex = /[□■◆◇※¤]/g;
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
          reasons.push('ฟอนต์เพี้ยน/PUA ' + puaMatches.length + ' ตัว');
        }
        if(hasDangling) reasons.push('พยัญชนะต้นหาย (สระลอย)');
        if(hasSymbol) reasons.push('มีสัญลักษณ์ขยะ');
        if(hasRepeat) reasons.push('อักษรซ้ำผิดปกติ');

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
      header.innerHTML = '<b style="color:var(--pen);">⚠ พบข้อความผิดปกติ ' + badLines.length + ' บรรทัด</b> ' +
        (totalPuaCount > 0 ? '<span style="font-size:12px;color:var(--ink-soft);">(ตรวจพบอักษรฟอนต์ซ่อน PUA รวม ' + totalPuaCount.toLocaleString() + ' ตัว)</span>' : '');
      box.appendChild(header);

      var list = document.createElement('div');
      list.style.fontSize = '12px';
      list.style.marginTop = '6px';

      badLines.slice(0, 4).forEach(function(item){
        var row = document.createElement('div');
        row.style.marginBottom = '3px';
        row.innerHTML = '<b>บรรทัด ' + item.lineNum + ':</b> <code>' + escapeHtml(item.preview) + '</code> <span style="color:var(--pen);font-size:11px;">↳ ' + item.reasons + '</span>';
        list.appendChild(row);
      });

      if(badLines.length > 4){
        var more = document.createElement('div');
        more.style.marginTop = '4px';
        more.style.fontStyle = 'italic';
        more.style.color = 'var(--ink-soft)';
        more.textContent = '...และอีก ' + (badLines.length - 4) + ' บรรทัดที่มีลักษณะเดียวกัน';
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
    if(!text){ showError('กรุณาใส่ข้อความต้นฉบับก่อน'); return; }

    inputText.value = normalizeOCR(text);
    highlightSuspicious(inputText.value);
    saveDraftSoon();

    progressText.textContent = 'ซ่อมข้อความรวดเร็วเสร็จสิ้น';
    setTimeout(function(){ progressText.textContent = ''; }, 2000);
  });

/* ---------------- Prompt ซ่อม OCR 2 ระดับ (ภาษาไทย vs ภาษาต่างประเทศ) ---------------- */
  function buildOCRRepairPrompt(sampleText){
    // ตรวจสอบว่าข้อความเป็นภาษาไทยหรือภาษาต่างประเทศ
    var hasThai = /[\u0E00-\u0E7F]/.test(sampleText || '');
    var isThaiMode = (state.source === 'polish') || hasThai;

    if (isThaiMode) {
      // 🇹 ระดับที่ 1: ซ่อม OCR ภาษาไทย และถอดรหัสฟอนต์ PUA
      return `คุณคือระบบตรวจสอบและซ่อมแซมข้อความภาษาไทย (Thai OCR & Font De-obfuscation Engine)

หน้าที่ของคุณ:
1. อ่านบริบทของประโยคภาษาไทย แล้วถอดรหัสตัวอักษร PUA ที่เพี้ยน หรือตัวอักษรที่สแกนผิด ให้กลับมาเป็นคำภาษาไทยที่ถูกต้องและสมบูรณ์ 100%
2. ซ่อมคำที่สระหรือวรรณยุกต์หลุดหายจากการสแกน และแก้สระแอเพี้ยน (เเ -> แ)

[ข้อห้ามเด็ดขาด - Strict Constraints]
1. ห้ามสรุปความ ห้ามตัดทอนเนื้อหา และห้ามแต่งเรื่องต่อเด็ดขาด!
2. ต้องคงเนื้อหาเดิม ย่อหน้าเดิม บทสนทนา และเครื่องหมายคำพูดไว้ครบถ้วน 100%
3. ตอบกลับเฉพาะข้อความภาษาไทยที่ซ่อมเสร็จแล้วเท่านั้น ห้ามมีคำอธิบาย คำนำ หรือข้อความเปิด/ปิด`;
    } else {
      //  ระดับที่ 2: ซ่อม OCR ภาษาต้นฉบับต่างประเทศ (เช่น ภาษาอังกฤษ) โดยห้ามแปล
      return `You are a professional Raw Text OCR Corrector and Typo Repair Engine.

Your task is to fix optical character recognition (OCR) scan errors, broken typography, and line-break artifacts in the provided foreign text (e.g., English).

[Tasks to perform]
1. Rejoin hyphenated words split across line breaks (e.g., "trans- lation" -> "translation", "con- dition" -> "condition").
2. Fix common OCR character confusions (e.g., "rn" mistyped as "m", "cl" as "d", "1" or "I" as "l", broken quotes like "â€œ").
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
      var sentences = para.split(/(?<=[.!?。！？\n])\s*/).filter(Boolean);
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
