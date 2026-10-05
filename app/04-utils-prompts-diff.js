  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

/* ---------------- ฟังก์ชันตรวจจับคำในบทความแบบยืดหยุ่น (Case-Insensitive + Suffix Support) ---------------- */
  function isTermInText(term, text) {
    if (!term || !text) return false;
    term = term.trim();
    if (!term) return false;

    // 1. ล้างอักขระล่องหนและแปลง Smart Quotes ในคำค้นหาให้เป็นมาตรฐานเดียวกับบทความ
    var cleanTerm = term
      .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

    // 2. ถ้าเป็นภาษาอังกฤษ/ละติน: รองรับตัวพิมพ์เล็ก-ใหญ่ (Case-Insensitive) และการเติม s, es, 's, ed, ing
    if (/^[A-Za-z0-9\s'-]+$/.test(cleanTerm)) {
      try {
        // ดักจับคำ ไม่ว่าจะเป็นรูปเอกพจน์, พหูพจน์ (s/es), แสดงความเป็นเจ้าของ ('s), หรือกริยา (ed/ing)
        var pattern = '\\b' + escapeRegex(cleanTerm) + "(?:'s|’s|s|es|d|ed|ing)?\\b";
        var reg = new RegExp(pattern, 'i');
        if (reg.test(text)) return true;
      } catch(e) {}
    }

    // 3. Fallback: ค้นหาแบบ Substring ไม่สนตัวพิมพ์เล็ก-ใหญ่ (สำหรับภาษาไทย, จีน หรือคำที่มีสัญลักษณ์)
    return text.toLowerCase().indexOf(cleanTerm.toLowerCase()) !== -1;
  }

/* ---------------- ระบบคัดกรองคลังคำแบบคำยาวมาก่อน (Longest-Match-First) ---------------- */
  function filterRelevantGlossary(glossaryText, chunkText) {
    if (!glossaryText || !glossaryText.trim() || !chunkText) return { text: '', count: 0 };

    var lines = glossaryText.split('\n');
    var validTerms = [];
    var seen = Object.create(null);

    // 1. แยกบรรทัดและคัดกรองคู่คำศัพท์ที่ถูกต้อง
    lines.forEach(function(line) {
      var cleanLine = line.trim().replace(/^[-*•\d.]+\s*/, '').trim();
      if (!cleanLine || cleanLine.startsWith('[') || cleanLine.startsWith('#')) return;
      if (!cleanLine.includes('=')) return;

      var parts = cleanLine.split('=');
      var src = parts[0].trim();
      var trans = parts.slice(1).join('=').trim();
      if (!src || !trans) return;

      var keyLower = src.toLowerCase();
      if (seen[keyLower]) return;
      seen[keyLower] = true;

      validTerms.push({ src: src, trans: trans });
    });

    // 2. ⚡ จัดเรียงลำดับจากคำที่ยาวที่สุดไปหาสั้นที่สุด (Longest-Match-First)
    validTerms.sort(function(a, b) {
      return b.src.length - a.src.length || a.src.localeCompare(b.src);
    });

    // 3. ตรวจจับคำที่ปรากฏใน Chunk ตามลำดับความยาว
    var matchedTerms = [];
    validTerms.forEach(function(term) {
      if (isTermInText(term.src, chunkText) || isTermInText(term.trans, chunkText)) {
        matchedTerms.push(term.src + ' = ' + term.trans);
      }
    });

    return {
      text: matchedTerms.join('; '),
      count: matchedTerms.length
    };
  }

  function buildTranslatePrompt(proj, previousTail, currentChunk){
    // ถ้าส่ง currentChunk มาจะกรองคำเฉพาะส่วนนั้น ถ้าไม่ส่งจะใช้คลังคำทั้งหมดตามเดิม
    var filterResult = currentChunk
      ? filterRelevantGlossary(proj.glossary, currentChunk)
      : { text: (proj.glossary ? proj.glossary.replace(/\n+/g, '; ') : ''), count: 0 };

    var glossaryPart = filterResult.text
      ? (' ใช้คำศัพท์เฉพาะที่พบในส่วนนี้อย่างสม่ำเสมอ (เรียงลำดับตามความเจาะจง หากมีคำซ้อนทับกันให้ยึดคำที่ยาวที่สุดเป็นหลัก): ' + filterResult.text + '.')
      : '';
    var contextPart = proj.context ? (' บริบทของเรื่อง: ' + proj.context) : '';
    var tailPart = previousTail ? (' นี่คือข้อความท้ายส่วนก่อนหน้าที่ทำเสร็จไปแล้ว (แค่ให้ดูเพื่อต่อเนื้อความให้ลื่นไหลเป็นธรรมชาติ ห้ามทำซ้ำข้อความนี้อีกในคำตอบ): "' + previousTail + '"') : '';

    var base = state.source === 'translate'
      ? ('คุณเป็นนักแปลนิยายมืออาชีพ ผู้เชี่ยวชาญงานแปลแนว' + state.genre + 'เป็นภาษาไทย หน้าที่ของคุณคือแปลข้อความที่ได้รับเป็นภาษาไทยที่อ่านลื่นไหล เป็นธรรมชาติ เหมาะกับนิยาย รักษาโทนอารมณ์ น้ำเสียง และความหมายดั้งเดิมของต้นฉบับให้ครบถ้วน')
      : ('คุณเป็นบรรณาธิการต้นฉบับนิยายมืออาชีพ ผู้เชี่ยวชาญงานแนว' + state.genre + ' หน้าที่ของคุณคือปรับสำนวนภาษาไทยของข้อความต่อไปนี้ให้ลื่นไหลและเป็นธรรมชาติมากขึ้น โดยไม่เปลี่ยนเนื้อเรื่องหรือความหมายเดิม');

    return base +
      ' ระดับการปรับสำนวน: ' + levelDesc(state.level) +
      ' สำนวนภาษาที่ต้องการ: ' + styleDesc(state.style) + '.' +
      glossaryPart + contextPart + tailPart +
      ' หมายเหตุ: ข้อความที่ได้รับอาจเป็นเพียงส่วนหนึ่งของเรื่องยาว ให้ทำงานต่อเนื่องเสมือนเป็นส่วนหนึ่งของทั้งเรื่อง' +
      ' ตอบกลับเฉพาะข้อความภาษาไทยที่ทำเสร็จแล้วเท่านั้น ห้ามใส่คำอธิบาย คำนำ หมายเหตุ หรือกระบวนการคิด(Chain-of-thought) ใดๆ ทั้งสิ้น ตอบมาแค่ผลลัพธ์เพียวๆ เท่านั้น';
  }
  function getTail(text, maxLen){
    text = (text || '').trim();
    if(text.length <= maxLen) return text;
    return text.slice(-maxLen);
  }

  function diffTokens(oldArr, newArr){
    var n = oldArr.length, m = newArr.length;
    var dp = new Array(n + 1);
    for(var i = 0; i <= n; i++) dp[i] = new Int32Array(m + 1);
    for(var i = n - 1; i >= 0; i--){
      for(var j = m - 1; j >= 0; j--){
        dp[i][j] = oldArr[i] === newArr[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    var result = [];
    var i = 0, j = 0;
    while(i < n && j < m){
      if(oldArr[i] === newArr[j]){ result.push({type:'same', text:oldArr[i]}); i++; j++; }
      else if(dp[i+1][j] >= dp[i][j+1]){ result.push({type:'removed', text:oldArr[i]}); i++; }
      else { result.push({type:'added', text:newArr[j]}); j++; }
    }
    while(i < n){ result.push({type:'removed', text:oldArr[i]}); i++; }
    while(j < m){ result.push({type:'added', text:newArr[j]}); j++; }
    return result;
  }

  function diffTexts(oldText, newText){
    var oldWords = (oldText || '').split(/(\s+)/).filter(function(s){ return s.length; });
    var newWords = (newText || '').split(/(\s+)/).filter(function(s){ return s.length; });
    if(oldWords.length * newWords.length > 3000000){
      oldWords = (oldText || '').split(/\n+/);
      newWords = (newText || '').split(/\n+/);
      if(oldWords.length * newWords.length > 3000000) return null;
    }
    return diffTokens(oldWords, newWords);
  }

  function renderDiffHtml(diffResult){
    var frag = document.createDocumentFragment();
    diffResult.forEach(function(part){
      if(part.type === 'same'){
        frag.appendChild(document.createTextNode(part.text));
      } else {
        var span = document.createElement('span');
        span.className = part.type === 'added' ? 'diff-added' : 'diff-removed';
        span.textContent = part.text;
        frag.appendChild(span);
      }
    });
    return frag;
  }
