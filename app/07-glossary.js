  function dedupeGlossary(existingText, newText){
    var seen = Object.create(null);
    var lines = [];
    function addLine(line){
      line = line.trim();
      if(!line) return;
      var key = line.split('=')[0].trim().toLowerCase();
      if(!key || seen[key]) return;
      seen[key] = true;
      lines.push(line);
    }
    (existingText || '').split('\n').forEach(addLine);
    (newText || '').split('\n').forEach(addLine);
    return lines.join('\n');
  }

/* ---------------- Interactive Glossary Review Modal Logic ---------------- */
  var glossaryModal = document.getElementById('glossaryModal');
  var glossaryListBody = document.getElementById('glossaryListBody');
  var glossarySelectedCount = document.getElementById('glossarySelectedCount');
  var glossaryModalCloseBtn = document.getElementById('glossaryModalCloseBtn');
  var glossaryModalCancelBtn = document.getElementById('glossaryModalCancelBtn');
  var glossaryModalSaveBtn = document.getElementById('glossaryModalSaveBtn');
  var glossarySelectAllBtn = document.getElementById('glossarySelectAllBtn');
  var glossaryDeselectAllBtn = document.getElementById('glossaryDeselectAllBtn');

  var currentGlossaryReviewItems = [];
  var glossaryModalResolver = null;

  function updateGlossaryModalCount() {
    var count = currentGlossaryReviewItems.filter(function(i){ return i.selected; }).length;
    glossarySelectedCount.textContent = 'เลือกแล้ว ' + count + ' จาก ' + currentGlossaryReviewItems.length + ' คำ';
    glossaryModalSaveBtn.disabled = (count === 0);
  }

  function showGlossaryReviewModal(items) {
    return new Promise(function(resolve) {
      currentGlossaryReviewItems = items;
      glossaryModalResolver = resolve;
      glossaryListBody.innerHTML = '';

      items.forEach(function(item) {
        var row = document.createElement('div');
        row.className = 'glossary-row-item' + (item.selected ? '' : ' unchecked');

        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = item.selected;
        chk.addEventListener('change', function() {
          item.selected = chk.checked;
          row.classList.toggle('unchecked', !chk.checked);
          updateGlossaryModalCount();
        });
        row.appendChild(chk);

        var srcLabel = document.createElement('span');
        srcLabel.className = 'glossary-item-src';
        srcLabel.textContent = item.src;
        row.appendChild(srcLabel);

        var arrow = document.createElement('span');
        arrow.className = 'glossary-item-arrow';
        arrow.textContent = '=';
        row.appendChild(arrow);

        var transInput = document.createElement('input');
        transInput.type = 'text';
        transInput.className = 'glossary-item-trans';
        transInput.value = item.trans;
        transInput.addEventListener('input', function() {
          item.trans = transInput.value.trim();
        });
        row.appendChild(transInput);

        glossaryListBody.appendChild(row);
      });

      updateGlossaryModalCount();
      glossaryModal.classList.add('show');
    });
  }

  function closeGlossaryReviewModal(confirmed) {
    glossaryModal.classList.remove('show');
    if (glossaryModalResolver) {
      var res = glossaryModalResolver;
      glossaryModalResolver = null;
      if (confirmed) {
        var approved = currentGlossaryReviewItems
          .filter(function(i){ return i.selected && i.src && i.trans; })
          .map(function(i){ return i.src + ' = ' + i.trans; });
        res(approved);
      } else {
        res(null);
      }
    }
  }

  glossaryModalCloseBtn.addEventListener('click', function(){ closeGlossaryReviewModal(false); });
  glossaryModalCancelBtn.addEventListener('click', function(){ closeGlossaryReviewModal(false); });
  glossaryModalSaveBtn.addEventListener('click', function(){ closeGlossaryReviewModal(true); });

  glossarySelectAllBtn.addEventListener('click', function(){
    currentGlossaryReviewItems.forEach(function(i){ i.selected = true; });
    glossaryListBody.querySelectorAll('.glossary-row-item').forEach(function(el){
      el.classList.remove('unchecked');
      el.querySelector('input[type="checkbox"]').checked = true;
    });
    updateGlossaryModalCount();
  });

  glossaryDeselectAllBtn.addEventListener('click', function(){
    currentGlossaryReviewItems.forEach(function(i){ i.selected = false; });
    glossaryListBody.querySelectorAll('.glossary-row-item').forEach(function(el){
      el.classList.add('unchecked');
      el.querySelector('input[type="checkbox"]').checked = false;
    });
    updateGlossaryModalCount();
  });

  // -------------------------------------------------------------
  // ฟังก์ชันสกัดคลังคำพร้อมเปิดหน้าต่าง Pop-up ให้ตรวจก่อนบันทึก
  // -------------------------------------------------------------
  async function runAiGlossaryExtract(proj, textareaEl){
    var text = inputText.value.trim();
    var key = document.getElementById('apiKey').value.trim();
    if(!text){ await showAlertDialog('ยังไม่มีข้อความ', 'กรุณาวางข้อความต้นฉบับก่อนให้ AI วิเคราะห์คลังคำ'); return; }
    if(!key){ await showAlertDialog('ยังไม่ได้ใส่ API Key', 'กรุณาใส่ API Key ในหน้าตั้งค่าก่อน'); return; }
    if(warnIfAiBusy()) return;

    var isThaiSource = (state.source === 'polish');
    var genre = state.genre || 'ทั่วไป';
    var sys = "";

    // Prompt กฎเหล็ก: บังคับฝั่งซ้ายต้องเป็นภาษาต้นฉบับ 100% ห้ามเป็นภาษาไทย
    // -------------------------------------------------------------
    if (isThaiSource) {
      // กรณีเลือกโหมด: "ไทยอยู่แล้ว (ขัดสำนวน)"
      sys = "คุณคือบรรณาธิการภาษาไทย ผู้เชี่ยวชาญนิยายแนว " + genre + "\n" +
            "หน้าที่ของคุณคือ: สแกนข้อความภาษาไทย แล้วดึงเฉพาะคำทับศัพท์ที่มักสะกดผิด หรือคำที่ควรล็อกมาตรฐานการสะกด\n" +
            "[ข้อกำหนดสำคัญมาก]\n" +
            "- ห้ามตอบคำที่ซ้ำกันทั้งสองฝั่งเด็ดขาด (เช่น ห้าม 'เจี้ยนเฉิน = เจี้ยนเฉิน')\n" +
            "- ตอบเฉพาะคำที่มีการแก้ไขหรือล็อกมาตรฐาน เช่น 'คำที่สะกดผิด/คำที่พบ = คำสะกดมาตรฐานที่ถูกต้อง'\n" +
            "- บรรทัดละ 1 คำ ห้ามใส่ bullet ห้ามใส่ตัวเลข";
    } else {
      // กรณีเลือกโหมด: "ภาษาอื่น (แปล)"
      sys = "คุณคือนักแปลนิยายมืออาชีพ ผู้เชี่ยวชาญนิยายแนว " + genre + "\n" +
            "หน้าที่ของคุณคือ: อ่านข้อความต้นฉบับ แล้วสกัดเฉพาะ 'ชื่อเฉพาะและศัพท์เฉพาะ' (ชื่อตัวละคร, สัตว์อสูร, สถานที่, สำนัก, ระดับพลัง, สมุนไพร, โอสถ, อาวุธ) เพื่อทำคลังคำ\n\n" +
            "[กฎเหล็กเด็ดขาดเรื่องภาษา - STRICT CONSTRAINTS]\n" +
            "1. รูปแบบต้องเป็น: [คำภาษาต้นฉบับดั้งเดิม] = [คำแปลภาษาไทย]\n" +
            "2. ฝั่งซ้าย (ก่อนเครื่องหมาย =) ต้องเป็นภาษาต้นทางตามที่ปรากฏในข้อความ 100% (เช่น ภาษาอังกฤษ หรือ ภาษาจีน) ห้ามแปลหรือทับศัพท์เป็นภาษาไทยเด็ดขาด!\n" +
            "   ✅ ตัวอย่างที่ถูกต้อง:\n" +
            "   Jian Chen = เจี้ยนเฉิน\n" +
            "   Empyrean Demon Lord = จอมมารเอ็มไพเรียน\n" +
            "   Nan Potian = หนานโพเทียน\n" +
            "   Fairy Hao Yue = เซียนฮ่าวเยว่\n" +
            "   ❌ ตัวอย่างที่ผิดเด็ดขาด (ห้ามทำ):\n" +
            "   เอ็มไพเรียนเดมอนลอร์ด = จอมมารเอ็มไพเรียน (ผิด! เพราะฝั่งซ้ายเป็นภาษาไทย)\n" +
            "   เจี้ยนเฉิน = เจี้ยนเฉิน (ผิด! เพราะฝั่งซ้ายต้องเป็นภาษาอังกฤษ Jian Chen)\n" +
            "3. ห้ามสกัดคำศัพท์สามัญทั่วไป (เช่น sword, forest, city, water, king)\n" +
            "4. ตอบเฉพาะรายการคำศัพท์บรรทัดละ 1 คำ ห้ามใส่ bullet (- หรือ *) ห้ามใส่ตัวเลขลำดับ และห้ามมีคำอธิบายใดๆ ทั้งสิ้น";
    }

    var chunks = splitIntoChunks(text, 4000);
    var rawResults = '';

    activeController = new AbortController();
    setAiBusy(true);
    resetActionStats();
    cancelBtn.classList.add('show');
    try {
      for(var i = 0; i < chunks.length; i++){
        progressText.textContent = chunks.length > 1
          ? ('กำลังให้ AI วิเคราะห์คลังคำ ส่วนที่ ' + (i + 1) + '/' + chunks.length + '...')
          : 'กำลังให้ AI วิเคราะห์คลังคำและชื่อเฉพาะ...';
        var result = await callAIWithRetry(sys, chunks[i], key, modelInput.value, activeController.signal, 1);
        if(result && result.trim()){
          rawResults += '\n' + result.trim();
        }
      }

      var parsedItems = [];
      var seen = Object.create(null);
      var existingKeys = Object.create(null);
      (proj.glossary || '').split('\n').forEach(function(line){
        var k = line.split('=')[0].trim().toLowerCase();
        if(k) existingKeys[k] = true;
      });

      rawResults.split('\n').forEach(function(rawLine){
        var line = rawLine.trim().replace(/^[-*•\d.]+\s*/, '').trim();
        if(!line.includes('=')) return;
        var parts = line.split('=');
        var src = parts[0].trim();
        var trans = parts.slice(1).join('=').trim();
        if(!src || !trans) return;
        if(src.toLowerCase() === trans.toLowerCase()) return; //  ป้องกันกรณีคำฝั่งซ้ายตรงกับฝั่งขวาเป๊ะๆ (เช่น เจี้ยนเฉิน = เจี้ยนเฉิน)

        var keyLower = src.toLowerCase();
        if(!seen[keyLower]){
          seen[keyLower] = true;
          parsedItems.push({
            src: src,
            trans: trans,
            selected: !existingKeys[keyLower] // ถ้ามีในคลังคำเดิมแล้วจะ uncheck ไว้
          });
        }
      });

      if(parsedItems.length === 0){
        await showAlertDialog('ไม่พบคำศัพท์', 'AI ไม่พบชื่อเฉพาะหรือคำศัพท์ใหม่ในข้อความนี้');
        return;
      }

      // เปิดหน้าต่าง Pop-up ให้ผู้ใช้ตรวจสอบ
      var approvedList = await showGlossaryReviewModal(parsedItems);
      if(approvedList && approvedList.length > 0){
        var merged = dedupeGlossary(proj.glossary || '', approvedList.join('\n'));
        proj.glossary = merged;
        textareaEl.value = proj.glossary;
        saveData();

        var statsStr = '';
        if(currentActionTokens > 0) statsStr = '\n\n(ใช้ไป ' + currentActionTokens.toLocaleString() + ' tokens, ประมาณ $' + currentActionCost.toFixed(4) + ')';
        await showAlertDialog('สำเร็จ', 'บันทึกคำศัพท์ ' + approvedList.length + ' คำ ลงในคลังคำเรียบร้อยแล้ว' + statsStr);
      }
    } catch(err){
      if(err.name !== 'AbortError'){
        await showAlertDialog('ทำไม่สำเร็จ', 'ไม่สามารถดึงคลังคำได้: ' + (err.message || ''));
      }
    } finally {
      setAiBusy(false);
      cancelBtn.classList.remove('show');
      progressText.textContent = '';
    }
  }

  var historyViewBanner = document.getElementById('historyViewBanner');
  var historyViewBannerBottom = document.getElementById('historyViewBannerBottom');
  var historyViewLabel = document.getElementById('historyViewLabel');
  var historyViewLabelBottom = document.getElementById('historyViewLabelBottom');
  var chapterTitle = document.getElementById('chapterTitle');
  var inputText = document.getElementById('inputText');
  var inCount = document.getElementById('inCount');
  var outCount = document.getElementById('outCount');
  var output = document.getElementById('output');
  var stamp = document.getElementById('stamp');
  var qualityWarningBox = document.getElementById('qualityWarningBox');
  var tqgQualityToggleBtn = document.getElementById('tqgQualityToggleBtn');
  var tqgQualityPanel = document.getElementById('tqgQualityPanel');
  var tqgQualityState = null;
  var outputFontValue = document.getElementById('outputFontValue');
  if(window.TQGQualityUI && tqgQualityToggleBtn && tqgQualityPanel){
    window.TQGQualityUI.bindToggle(tqgQualityToggleBtn, tqgQualityPanel);
    window.TQGQualityUI.mount(tqgQualityPanel, {});
  }
  var saveStatusText = document.getElementById('saveStatusText');
