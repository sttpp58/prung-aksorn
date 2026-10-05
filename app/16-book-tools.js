  var mineBookGlossaryBtn = document.getElementById('mineBookGlossaryBtn');
  if(mineBookGlossaryBtn){
    mineBookGlossaryBtn.addEventListener('click', async function(){
      var proj = getCurrentProject();
      var activeBook = getActiveBook(proj);
      var historyList = getActiveHistoryList(proj);
      var key = document.getElementById('apiKey').value.trim();

      if(!proj || !historyList || historyList.length === 0){
        await showAlertDialog('ไม่มีข้อมูล', 'ยังไม่มีตอนที่แปลในเล่มนี้สำหรับสแกนคลังคำ');
        return;
      }
      if(!key){
        await showAlertDialog('ยังไม่ได้ใส่ API Key', 'กรุณาใส่ API Key ในหน้าตั้งค่าก่อน');
        return;
      }
      if(warnIfAiBusy()) return;

      var genre = state.genre || 'ทั่วไป';
      var isThaiSource = (state.source === 'polish');
      var sys = "";

      if (isThaiSource) {
        // กรณีโหมดขัดเกลาสำนวนภาษาไทย
        sys = "คุณคือบรรณาธิการภาษาไทยผู้เชี่ยวชาญนิยายแนว " + genre + "\n" +
              "หน้าที่ของคุณคือ: อ่านตัวอย่างเนื้อหาของแต่ละตอน แล้วดึงเฉพาะชื่อเฉพาะ คำทับศัพท์ หรือคำศัพท์สำคัญของทั้งเล่ม\n" +
              "รูปแบบผลลัพธ์: 'คำที่พบ = คำสะกดมาตรฐานที่ถูกต้อง' บรรทัดละ 1 คำ ห้ามตอบคำซ้ำกันสองฝั่ง ห้ามใส่ bullet";
      } else {
        // กรณีโหมดแปลภาษาต่างประเทศ (Bilingual Alignment)
        sys = "คุณคือนักสกัดคำศัพท์และจับคู่คำแปลสองภาษา (Bilingual Terminology Alignment Specialist) ผู้เชี่ยวชาญนิยายแนว " + genre + "\n\n" +
              "หน้าที่ของคุณคือ: อ่านข้อความ 'ต้นฉบับ' คู่กับ 'คำแปล' ในแต่ละตอนต่อไปนี้ แล้วดึงเฉพาะ 'ชื่อเฉพาะและศัพท์เฉพาะ' (ชื่อตัวละคร, สัตว์อสูร, สถานที่, สำนัก, ระดับพลัง, สมุนไพร, โอสถ, อาวุธ)\n" +
              "โดยนำคำภาษาต้นฉบับมาจับคู่กับ 'คำแปลภาษาไทยที่ใช้จริงในเนื้อหา' ของเรื่องนี้\n\n" +
              "[กฎเหล็กเด็ดขาดเรื่องภาษา - STRICT CONSTRAINTS]\n" +
              "1. รูปแบบต้องเป็น: [คำภาษาต้นฉบับเป๊ะๆ จากต้นฉบับ] = [คำแปลภาษาไทยที่ใช้จริงในคำแปล]\n" +
              "2. ฝั่งซ้าย (ก่อนเครื่องหมาย =) ต้องเป็นภาษาต้นทางตามที่ปรากฏในต้นฉบับ 100% (เช่น ภาษาอังกฤษ หรือ ภาษาจีน) ห้ามแปลหรือทับศัพท์เป็นภาษาไทยเด็ดขาด!\n" +
              "   ✅ ถูกต้อง: Jian Chen = เจี้ยนเฉิน\n" +
              "   ✅ ถูกต้อง: Chaotic Body = ร่างบรรพกาล\n" +
              "   ❌ ผิดเด็ดขาด: เจี้ยนเฉิน = เจี้ยนเฉิน (ห้ามเป็นภาษาไทยทั้งสองฝั่ง)\n" +
              "3. ห้ามสกัดคำศัพท์สามัญทั่วไป (เช่น sword, forest, city, monster, water)\n" +
              "4. ตอบเฉพาะรายการคำศัพท์บรรทัดละ 1 คำ ห้ามใส่ bullet ห้ามใส่ตัวเลขลำดับ และห้ามมีคำอธิบายเพิ่มเติม";
      }

      // กระชับเนื้อหาตัวอย่าง: ดึงชื่อตอน + 4 ย่อหน้าสำคัญ (ลดขนาดข้อมูลลง 50%)
      var pairedBookText = historyList.map(function(entry, idx){
        var title = entry.label || ('ตอนที่ ' + (idx + 1));
        var inputExcerpt = (entry.input || '').slice(0, 450).trim();
        var outputExcerpt = (entry.output || '').slice(0, 450).trim();

        if (inputExcerpt) {
          return '=== ' + title + ' ===\n[ต้นฉบับ]:\n' + inputExcerpt + '\n[คำแปล]:\n' + outputExcerpt;
        } else {
          return '=== ' + title + ' ===\n[คำแปล]:\n' + outputExcerpt;
        }
      }).join('\n\n');

      // 2. ขยายขนาด Chunk เป็น 7500 ตัวอักษร (ลดจำนวนรอบในการส่ง API ลงเหลือแค่ 4-8 รอบ)
      var chunks = splitIntoChunks(pairedBookText, 7500);
      var rawResults = '';

      activeController = new AbortController();
      setAiBusy(true);
      resetActionStats();
      cancelBtn.classList.add('show');

      try {
        for(var i = 0; i < chunks.length; i++){
          progressText.textContent = chunks.length > 1
            ? ('กำลังสแกนคลังคำทั้งเล่ม ส่วนที่ ' + (i + 1) + '/' + chunks.length + ' (คุมความเร็ว Rate Limit)...')
            : 'กำลังสแกนคลังคำจากทุกตอนในเล่ม...';

          var result = await callAIWithRetry(sys, chunks[i], key, modelInput.value, activeController.signal, 1);
          if(result && result.trim()) rawResults += '\n' + result.trim();

          // 3. หน่วงเวลา 3.2 วินาทีระหว่างก้อน (ป้องกันการยิงเกิน 20 RPM 100%)
          if (i < chunks.length - 1) {
            await sleep(4100);
          }
        }

        // แยกคู่คำศัพท์ และกรองคำซ้ำ
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

          // ดักจับ: ห้ามคำฝั่งซ้ายตรงกับฝั่งขวา (ป้องกันคำไทย = คำไทย)
          if(src.toLowerCase() === trans.toLowerCase()) return;

          var kLower = src.toLowerCase();
          if(!seen[kLower]){
            seen[kLower] = true;
            parsedItems.push({
              src: src,
              trans: trans,
              selected: !existingKeys[kLower] // ถ้ามีในคลังคำเดิมแล้วจะ uncheck ไว้ล่วงหน้า
            });
          }
        });

        if(parsedItems.length === 0){
          await showAlertDialog('ไม่พบคำศัพท์ใหม่', 'AI สแกนทั้งเล่มแล้วแต่ไม่พบคำศัพท์เฉพาะใหม่เพิ่มเติม');
          return;
        }

        // เปิด Pop-up ตาราง Checklist ให้ผู้ใช้ตรวจสอบและเลือก
        var approved = await showGlossaryReviewModal(parsedItems);
        if(approved && approved.length > 0){
          proj.glossary = dedupeGlossary(proj.glossary || '', approved.join('\n'));
          renderProjects();
          saveData();

          var statsStr = '';
          if(currentActionTokens > 0) statsStr = '\n\n(ใช้ไป ' + currentActionTokens.toLocaleString() + ' tokens, ประมาณ $' + currentActionCost.toFixed(4) + ')';
          await showAlertDialog('สำเร็จ', 'บันทึกคำศัพท์ของเล่มนี้จำนวน ' + approved.length + ' คำ เข้าสู่คลังคำเรียบร้อยแล้ว' + statsStr);
        }
      } catch(err){
        if(err.name !== 'AbortError') await showAlertDialog('ทำไม่สำเร็จ', err.message);
      } finally {
        setAiBusy(false);
        cancelBtn.classList.remove('show');
        progressText.textContent = '';
      }
    });
  }

  /* =============================================================
     ฟังก์ชันสืบทอดบริบทและสำนวนข้ามเล่ม (Cross-Book Style Inheritance)
     1. สกัดคู่มือสรรพนามและน้ำเสียงลงช่อง Context
     2. จับคู่คำศัพท์ข้ามภาษา (English = Thai) เข้าสู่คลังคำ
     ============================================================= */
  var inheritCrossBookBtn = document.getElementById('inheritCrossBookBtn');
  if(inheritCrossBookBtn){
    inheritCrossBookBtn.addEventListener('click', async function(){
      var proj = getCurrentProject();
      var activeBook = getActiveBook(proj);
      var key = document.getElementById('apiKey').value.trim();

      if(!proj || !proj.books || proj.books.length < 2){
        await showAlertDialog('ต้องมีอย่างน้อย 2 เล่ม', 'คุณต้องสร้างอย่างน้อย 2 เล่มในเรื่องนี้เพื่อสืบทอดสำนวนจากเล่มก่อนหน้า');
        return;
      }
      if(!key){
        await showAlertDialog('ยังไม่ได้ใส่ API Key', 'กรุณาใส่ API Key ในหน้าตั้งค่าก่อน');
        return;
      }
      if(warnIfAiBusy()) return;

      // แสดงรายชื่อเล่มอื่นที่ไม่ใช่เล่มปัจจุบัน
      var otherBooks = proj.books.filter(function(b){ return b.id !== activeBook.id; });
      var bookOptionsText = otherBooks.map(function(b, idx){ return (idx + 1) + '. ' + b.title; }).join('\n');

      var promptMsg = 'ต้องการใช้เล่มใดเป็น "เล่มต้นแบบสำนวน" สำหรับ ' + activeBook.title + '?\n\nพิมพ์หมายเลขเล่มที่ต้องการ:\n' + bookOptionsText;
      var selectedIdxStr = await showPromptDialog(promptMsg, '1');
      if(!selectedIdxStr) return;

      var chosenIndex = parseInt(selectedIdxStr.trim(), 10) - 1;
      var refBook = otherBooks[chosenIndex];
      if(!refBook || !refBook.history || refBook.history.length === 0){
        await showAlertDialog('ไม่มีข้อมูล', 'เล่มต้นแบบที่เลือกยังไม่มีประวัติการแปล');
        return;
      }

      // ดึงตัวอย่างข้อความภาษาไทยจากเล่มต้นแบบ (เล่ม 1)
      var refThaiSample = refBook.history.slice(0, 10).map(function(h){ return (h.output || '').slice(0, 800); }).join('\n\n');
      var targetInputText = inputText.value.trim(); // ข้อความต้นฉบับเล่มใหม่ (เช่น ภาษาอังกฤษ)

      activeController = new AbortController();
      setAiBusy(true);
      resetActionStats();
      cancelBtn.classList.add('show');
      progressText.textContent = 'กำลังวิเคราะห์สำนวนและจับคู่คำศัพท์จาก ' + refBook.title + '...';

      try {
        // ขั้นตอนที่ 1: สกัดสรรพนามและคู่มือตัวละคร (Pronoun & Persona Bible)
        var sysTone = "คุณคือนักวิเคราะห์วรรณกรรม อ่านตัวอย่างนิยายภาษาไทยต่อไปนี้ แล้วสรุป 'คู่มือสำนวนและสรรพนามของตัวละคร' สั้นๆ กระชับ:\n" +
                      "- ระบุว่าตัวละครเอกและตัวละครสำคัญแทนตัวเองว่าอะไร (ข้า, ผม, ฉัน) และเรียกคนอื่นว่าอะไร (เจ้า, ท่าน, เธอ)\n" +
                      "- ระบุระดับภาษาและโทนเสียงของเรื่อง (โบราณ, ปัจจุบัน, สุภาพ, ดุดัน)\n" +
                      "ตอบเฉพาะข้อสรุปเป็นข้อๆ ห้ามมีคำนำ";
        var toneResult = await callAIWithRetry(sysTone, refThaiSample.slice(0, 4000), key, modelInput.value, activeController.signal, 1);

        if(toneResult && toneResult.trim()){
          var newContext = (proj.context ? proj.context.trim() + '\n\n' : '') +
                           '[คู่มือสำนวนและสรรพนามจาก ' + refBook.title + ']\n' + toneResult.trim();
          proj.context = newContext;
        }

        // ขั้นตอนที่ 2: ถ้ามีข้อความต้นฉบับภาษาอังกฤษ ให้จับคู่คำศัพท์ English = Thai
        var matchedTerms = [];
        if(targetInputText){
          progressText.textContent = 'กำลังจับคู่คำศัพท์ระหว่างต้นฉบับใหม่กับสำนวนเดิมใน ' + refBook.title + '...';
          var sysAlign = "คุณคือนักแปลนิยายมืออาชีพ\n" +
                         "นี่คือตัวอย่างสำนวนภาษาไทยที่เคยแปลไว้ในเล่มก่อนหน้า:\n" + refThaiSample.slice(0, 3000) + "\n\n" +
                         "หน้าที่ของคุณคือ: อ่านข้อความต้นฉบับของเล่มใหม่ต่อไปนี้ แล้วจับคู่ชื่อเฉพาะ/ศัพท์เฉพาะ ให้ตรงกับคำแปลไทยที่เคยใช้ในเล่มก่อนหน้า\n" +
                         "รูปแบบผลลัพธ์: [คำภาษาต้นฉบับเป๊ะๆ จากต้นฉบับ] = [คำแปลไทยที่เคยใช้ในเล่มก่อนหน้า]\n" +
                         "ห้ามทับศัพท์ภาษาไทยฝั่งซ้าย และห้ามมีคำอธิบายเพิ่มเติม";
          var alignResult = await callAIWithRetry(sysAlign, targetInputText.slice(0, 4000), key, modelInput.value, activeController.signal, 1);

          if(alignResult && alignResult.trim()){
            var seen = Object.create(null);
            alignResult.split('\n').forEach(function(line){
              var l = line.trim().replace(/^[-*•\d.]+\s*/, '');
              if(l.includes('=')){
                var p = l.split('=');
                var src = p[0].trim();
                var trans = p.slice(1).join('=').trim();
                if(src && trans && src.toLowerCase() !== trans.toLowerCase()){
                  if(!seen[src.toLowerCase()]){
                    seen[src.toLowerCase()] = true;
                    matchedTerms.push({ src: src, trans: trans, selected: true });
                  }
                }
              }
            });
          }
        }

        // เปิด Pop-up Checklist ให้ตรวจคำศัพท์ที่จับคู่ได้
        if(matchedTerms.length > 0){
          var approved = await showGlossaryReviewModal(matchedTerms);
          if(approved && approved.length > 0){
            proj.glossary = dedupeGlossary(proj.glossary || '', approved.join('\n'));
          }
        }

        renderProjects();
        saveData();

        var successMsg = '1. บันทึกคู่มือสรรพนามและน้ำเสียงของ ' + refBook.title + ' ลงในช่องบริบทเรียบร้อยแล้ว\n' +
                         (matchedTerms.length > 0 ? '2. จับคู่คำศัพท์ข้ามเล่มเข้าสู่คลังคำเรียบร้อยแล้ว' : '2. พร้อมแปลเล่มใหม่ต่อด้วยสำนวนเดิมทันที');
        await showAlertDialog('สืบทอดสำนวนสำเร็จ!', successMsg);
      } catch(err){
        if(err.name !== 'AbortError') await showAlertDialog('ทำไม่สำเร็จ', err.message);
      } finally {
        setAiBusy(false);
        cancelBtn.classList.remove('show');
        progressText.textContent = '';
      }
    });
  }
