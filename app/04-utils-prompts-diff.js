  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

/* ---------------- เธเธฑเธเธเนเธเธฑเธเธ•เธฃเธงเธเธเธฑเธเธเธณเนเธเธเธ—เธเธงเธฒเธกเนเธเธเธขเธทเธ”เธซเธขเธธเนเธ (Case-Insensitive + Suffix Support) ---------------- */
  function isTermInText(term, text) {
    if (!term || !text) return false;
    term = term.trim();
    if (!term) return false;

    // 1. เธฅเนเธฒเธเธญเธฑเธเธเธฃเธฐเธฅเนเธญเธเธซเธเนเธฅเธฐเนเธเธฅเธ Smart Quotes เนเธเธเธณเธเนเธเธซเธฒเนเธซเนเน€เธเนเธเธกเธฒเธ•เธฃเธเธฒเธเน€เธ”เธตเธขเธงเธเธฑเธเธเธ—เธเธงเธฒเธก
    var cleanTerm = term
      .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/[โ€โ€]/g, '"').replace(/[โ€โ€]/g, "'");

    // 2. เธ–เนเธฒเน€เธเนเธเธ เธฒเธฉเธฒเธญเธฑเธเธเธคเธฉ/เธฅเธฐเธ•เธดเธ: เธฃเธญเธเธฃเธฑเธเธ•เธฑเธงเธเธดเธกเธเนเน€เธฅเนเธ-เนเธซเธเน (Case-Insensitive) เนเธฅเธฐเธเธฒเธฃเน€เธ•เธดเธก s, es, 's, ed, ing
    if (/^[A-Za-z0-9\s'-]+$/.test(cleanTerm)) {
      try {
        // เธ”เธฑเธเธเธฑเธเธเธณ เนเธกเนเธงเนเธฒเธเธฐเน€เธเนเธเธฃเธนเธเน€เธญเธเธเธเธเน, เธเธซเธนเธเธเธเน (s/es), เนเธชเธ”เธเธเธงเธฒเธกเน€เธเนเธเน€เธเนเธฒเธเธญเธ ('s), เธซเธฃเธทเธญเธเธฃเธดเธขเธฒ (ed/ing)
        var pattern = '\\b' + escapeRegex(cleanTerm) + "(?:'s|โ€s|s|es|d|ed|ing)?\\b";
        var reg = new RegExp(pattern, 'i');
        if (reg.test(text)) return true;
      } catch(e) {}
    }

    // 3. Fallback: เธเนเธเธซเธฒเนเธเธ Substring เนเธกเนเธชเธเธ•เธฑเธงเธเธดเธกเธเนเน€เธฅเนเธ-เนเธซเธเน (เธชเธณเธซเธฃเธฑเธเธ เธฒเธฉเธฒเนเธ—เธข, เธเธตเธ เธซเธฃเธทเธญเธเธณเธ—เธตเนเธกเธตเธชเธฑเธเธฅเธฑเธเธฉเธ“เน)
    return text.toLowerCase().indexOf(cleanTerm.toLowerCase()) !== -1;
  }

/* ---------------- เธฃเธฐเธเธเธเธฑเธ”เธเธฃเธญเธเธเธฅเธฑเธเธเธณเนเธเธเธเธณเธขเธฒเธงเธกเธฒเธเนเธญเธ (Longest-Match-First) ---------------- */
  function filterRelevantGlossary(glossaryText, chunkText) {
    if (!glossaryText || !glossaryText.trim() || !chunkText) return { text: '', count: 0 };

    var lines = glossaryText.split('\n');
    var validTerms = [];
    var seen = Object.create(null);

    // 1. เนเธขเธเธเธฃเธฃเธ—เธฑเธ”เนเธฅเธฐเธเธฑเธ”เธเธฃเธญเธเธเธนเนเธเธณเธจเธฑเธเธ—เนเธ—เธตเนเธ–เธนเธเธ•เนเธญเธ
    lines.forEach(function(line) {
      var cleanLine = line.trim().replace(/^[-*โ€ข\d.]+\s*/, '').trim();
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

    // 2. โก เธเธฑเธ”เน€เธฃเธตเธขเธเธฅเธณเธ”เธฑเธเธเธฒเธเธเธณเธ—เธตเนเธขเธฒเธงเธ—เธตเนเธชเธธเธ”เนเธเธซเธฒเธชเธฑเนเธเธ—เธตเนเธชเธธเธ” (Longest-Match-First)
    validTerms.sort(function(a, b) {
      return b.src.length - a.src.length || a.src.localeCompare(b.src);
    });

    // 3. เธ•เธฃเธงเธเธเธฑเธเธเธณเธ—เธตเนเธเธฃเธฒเธเธเนเธ Chunk เธ•เธฒเธกเธฅเธณเธ”เธฑเธเธเธงเธฒเธกเธขเธฒเธง
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
    // เธ–เนเธฒเธชเนเธ currentChunk เธกเธฒเธเธฐเธเธฃเธญเธเธเธณเน€เธเธเธฒเธฐเธชเนเธงเธเธเธฑเนเธ เธ–เนเธฒเนเธกเนเธชเนเธเธเธฐเนเธเนเธเธฅเธฑเธเธเธณเธ—เธฑเนเธเธซเธกเธ”เธ•เธฒเธกเน€เธ”เธดเธก
    var filterResult = currentChunk
      ? filterRelevantGlossary(proj.glossary, currentChunk)
      : { text: (proj.glossary ? proj.glossary.replace(/\n+/g, '; ') : ''), count: 0 };

    var glossaryPart = filterResult.text
      ? (' เนเธเนเธเธณเธจเธฑเธเธ—เนเน€เธเธเธฒเธฐเธ—เธตเนเธเธเนเธเธชเนเธงเธเธเธตเนเธญเธขเนเธฒเธเธชเธกเนเธณเน€เธชเธกเธญ (เน€เธฃเธตเธขเธเธฅเธณเธ”เธฑเธเธ•เธฒเธกเธเธงเธฒเธกเน€เธเธฒเธฐเธเธ เธซเธฒเธเธกเธตเธเธณเธเนเธญเธเธ—เธฑเธเธเธฑเธเนเธซเนเธขเธถเธ”เธเธณเธ—เธตเนเธขเธฒเธงเธ—เธตเนเธชเธธเธ”เน€เธเนเธเธซเธฅเธฑเธ): ' + filterResult.text + '.')
      : '';
    var contextPart = proj.context ? (' เธเธฃเธดเธเธ—เธเธญเธเน€เธฃเธทเนเธญเธ: ' + proj.context) : '';
    var tailPart = previousTail ? (' เธเธตเนเธเธทเธญเธเนเธญเธเธงเธฒเธกเธ—เนเธฒเธขเธชเนเธงเธเธเนเธญเธเธซเธเนเธฒเธ—เธตเนเธ—เธณเน€เธชเธฃเนเธเนเธเนเธฅเนเธง (เนเธเนเนเธซเนเธ”เธนเน€เธเธทเนเธญเธ•เนเธญเน€เธเธทเนเธญเธเธงเธฒเธกเนเธซเนเธฅเธทเนเธเนเธซเธฅเน€เธเนเธเธเธฃเธฃเธกเธเธฒเธ•เธด เธซเนเธฒเธกเธ—เธณเธเนเธณเธเนเธญเธเธงเธฒเธกเธเธตเนเธญเธตเธเนเธเธเธณเธ•เธญเธ): "' + previousTail + '"') : '';

    var base = state.source === 'translate'
      ? ('เธเธธเธ“เน€เธเนเธเธเธฑเธเนเธเธฅเธเธดเธขเธฒเธขเธกเธทเธญเธญเธฒเธเธตเธ เธเธนเนเน€เธเธตเนเธขเธงเธเธฒเธเธเธฒเธเนเธเธฅเนเธเธง' + state.genre + 'เน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธข เธซเธเนเธฒเธ—เธตเนเธเธญเธเธเธธเธ“เธเธทเธญเนเธเธฅเธเนเธญเธเธงเธฒเธกเธ—เธตเนเนเธ”เนเธฃเธฑเธเน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธขเธ—เธตเนเธญเนเธฒเธเธฅเธทเนเธเนเธซเธฅ เน€เธเนเธเธเธฃเธฃเธกเธเธฒเธ•เธด เน€เธซเธกเธฒเธฐเธเธฑเธเธเธดเธขเธฒเธข เธฃเธฑเธเธฉเธฒเนเธ—เธเธญเธฒเธฃเธกเธ“เน เธเนเธณเน€เธชเธตเธขเธ เนเธฅเธฐเธเธงเธฒเธกเธซเธกเธฒเธขเธ”เธฑเนเธเน€เธ”เธดเธกเธเธญเธเธ•เนเธเธเธเธฑเธเนเธซเนเธเธฃเธเธ–เนเธงเธ')
      : ('เธเธธเธ“เน€เธเนเธเธเธฃเธฃเธ“เธฒเธเธดเธเธฒเธฃเธ•เนเธเธเธเธฑเธเธเธดเธขเธฒเธขเธกเธทเธญเธญเธฒเธเธตเธ เธเธนเนเน€เธเธตเนเธขเธงเธเธฒเธเธเธฒเธเนเธเธง' + state.genre + ' เธซเธเนเธฒเธ—เธตเนเธเธญเธเธเธธเธ“เธเธทเธญเธเธฃเธฑเธเธชเธณเธเธงเธเธ เธฒเธฉเธฒเนเธ—เธขเธเธญเธเธเนเธญเธเธงเธฒเธกเธ•เนเธญเนเธเธเธตเนเนเธซเนเธฅเธทเนเธเนเธซเธฅเนเธฅเธฐเน€เธเนเธเธเธฃเธฃเธกเธเธฒเธ•เธดเธกเธฒเธเธเธถเนเธ เนเธ”เธขเนเธกเนเน€เธเธฅเธตเนเธขเธเน€เธเธทเนเธญเน€เธฃเธทเนเธญเธเธซเธฃเธทเธญเธเธงเธฒเธกเธซเธกเธฒเธขเน€เธ”เธดเธก');

    return base +
      ' เธฃเธฐเธ”เธฑเธเธเธฒเธฃเธเธฃเธฑเธเธชเธณเธเธงเธ: ' + levelDesc(state.level) +
      ' เธชเธณเธเธงเธเธ เธฒเธฉเธฒเธ—เธตเนเธ•เนเธญเธเธเธฒเธฃ: ' + styleDesc(state.style) + '.' +
      glossaryPart + contextPart + tailPart +
      ' เธซเธกเธฒเธขเน€เธซเธ•เธธ: เธเนเธญเธเธงเธฒเธกเธ—เธตเนเนเธ”เนเธฃเธฑเธเธญเธฒเธเน€เธเนเธเน€เธเธตเธขเธเธชเนเธงเธเธซเธเธถเนเธเธเธญเธเน€เธฃเธทเนเธญเธเธขเธฒเธง เนเธซเนเธ—เธณเธเธฒเธเธ•เนเธญเน€เธเธทเนเธญเธเน€เธชเธกเธทเธญเธเน€เธเนเธเธชเนเธงเธเธซเธเธถเนเธเธเธญเธเธ—เธฑเนเธเน€เธฃเธทเนเธญเธ' +
      ' เธ•เธญเธเธเธฅเธฑเธเน€เธเธเธฒเธฐเธเนเธญเธเธงเธฒเธกเธ เธฒเธฉเธฒเนเธ—เธขเธ—เธตเนเธ—เธณเน€เธชเธฃเนเธเนเธฅเนเธงเน€เธ—เนเธฒเธเธฑเนเธ เธซเนเธฒเธกเนเธชเนเธเธณเธญเธเธดเธเธฒเธข เธเธณเธเธณ เธซเธกเธฒเธขเน€เธซเธ•เธธ เธซเธฃเธทเธญเธเธฃเธฐเธเธงเธเธเธฒเธฃเธเธดเธ”(Chain-of-thought) เนเธ”เน เธ—เธฑเนเธเธชเธดเนเธ เธ•เธญเธเธกเธฒเนเธเนเธเธฅเธฅเธฑเธเธเนเน€เธเธตเธขเธงเน เน€เธ—เนเธฒเธเธฑเนเธ';
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
