  /* ---------------- Reader Mode Logic ---------------- */
  var readerOverlay = document.getElementById('readerOverlay');
  var readerContent = document.getElementById('readerContent');
  var readerTocList = document.getElementById('readerTocList');
  var readerTocDrawer = document.getElementById('readerTocDrawer');
  var readerBackdrop = document.getElementById('readerBackdrop');
  var readerBookTitle = document.getElementById('readerBookTitle');
  var readerFontValue = document.getElementById('readerFontValue');

  var readerFontSize = 18;
  var readerCurrentBook = null;
  var readerScrollTimer = null;

function setReaderFontSize(size, persist) {
    readerFontSize = Math.max(14, Math.min(32, size));
    readerContent.style.fontSize = readerFontSize + 'px';
    readerFontValue.textContent = readerFontSize;

    // บันทึกลง IndexedDB เมื่อมีการปรับขนาดฟอนต์
    if (persist && appData.settings) {
      appData.settings.readerFontSize = readerFontSize;
      saveData();
    }
  }

  document.getElementById('readerFontDown').addEventListener('click', function(){ setReaderFontSize(readerFontSize - 1, true); });
  document.getElementById('readerFontUp').addEventListener('click', function(){ setReaderFontSize(readerFontSize + 1, true); });

  /* ---------------- Text-to-Speech (TTS) ---------------- */
  var readerTtsBtn = document.getElementById('readerTtsBtn');
  var readerTtsBar = document.getElementById('readerTtsBar');
  var ttsPlayPauseBtn = document.getElementById('ttsPlayPauseBtn');
  var ttsStopBtn = document.getElementById('ttsStopBtn');
  var ttsPrevBtn = document.getElementById('ttsPrevBtn');
  var ttsNextBtn = document.getElementById('ttsNextBtn');
  var ttsRateSlider = document.getElementById('ttsRateSlider');
  var ttsRateValue = document.getElementById('ttsRateValue');
  var ttsVoiceSelect = document.getElementById('ttsVoiceSelect');
  var ttsStatusText = document.getElementById('ttsStatusText');
  var ttsCloseBarBtn = document.getElementById('ttsCloseBarBtn');

  var ttsSupported = ('speechSynthesis' in window);
  var ttsQueue = [];
  var ttsIndex = -1;
  var ttsState = 'stopped';
  var ttsVoicesLoaded = false;

  var ttsPlayIconSvg = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none;"><polygon points="6,4 20,12 6,20"/></svg>';
  var ttsPauseIconSvg = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';

  if(!ttsSupported && readerTtsBtn){
    readerTtsBtn.disabled = true;
    readerTtsBtn.title = 'เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง';
  }

  function populateTtsVoices(){
    if(!ttsSupported) return;
    var voices = window.speechSynthesis.getVoices();
    if(!voices.length) return;
    ttsVoicesLoaded = true;
    var thVoices = voices.filter(function(v){ return /^th/i.test(v.lang); });
    var otherVoices = voices.filter(function(v){ return !/^th/i.test(v.lang); });
    ttsVoiceSelect.innerHTML = '';
    function addOptGroup(label, list){
      if(!list.length) return;
      var group = document.createElement('optgroup');
      group.label = label;
      list.forEach(function(v){
        var opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = v.name + ' (' + v.lang + ')';
        group.appendChild(opt);
      });
      ttsVoiceSelect.appendChild(group);
    }
    addOptGroup('เสียงไทย', thVoices);
    addOptGroup('เสียงอื่นๆ', otherVoices);

    var savedURI = appData.settings && appData.settings.ttsVoiceURI;
    if(savedURI && voices.some(function(v){ return v.voiceURI === savedURI; })){
      ttsVoiceSelect.value = savedURI;
    } else if(thVoices.length){
      ttsVoiceSelect.value = thVoices[0].voiceURI;
    }
  }
  if(ttsSupported){
    populateTtsVoices();
    window.speechSynthesis.onvoiceschanged = populateTtsVoices;
    var savedRate = (appData.settings && appData.settings.ttsRate) || '1';
    ttsRateSlider.value = savedRate;
    ttsRateValue.textContent = parseFloat(savedRate).toFixed(1) + 'x';
  }

  function getSelectedTtsVoice(){
    if(!ttsSupported) return null;
    var voices = window.speechSynthesis.getVoices();
    var uri = ttsVoiceSelect.value;
    return voices.find(function(v){ return v.voiceURI === uri; }) || null;
  }

  function buildTtsQueue(startEl){
    var nodes = readerContent.querySelectorAll('h2, p');
    ttsQueue = [];
    var startIdx = 0;
    var foundStart = false;
    nodes.forEach(function(el){
      var text = (el.textContent || '').trim();
      if(!text) return;
      ttsQueue.push({ el: el, text: text });
      if(!foundStart && startEl && el === startEl){
        startIdx = ttsQueue.length - 1;
        foundStart = true;
      }
    });
    return startIdx;
  }

  function findStartElementFromScroll(){
    var nodes = readerContent.querySelectorAll('h2, p');
    var scrollTop = readerOverlay.scrollTop + 80;
    var candidate = null;
    for(var i = 0; i < nodes.length; i++){
      if(nodes[i].offsetTop >= scrollTop){ candidate = nodes[i]; break; }
    }
    return candidate || nodes[0] || null;
  }

  function clearTtsHighlight(){
    var prev = readerContent.querySelector('p.tts-active');
    if(prev) prev.classList.remove('tts-active');
  }

  function updatePlayPauseIcon(){
    ttsPlayPauseBtn.innerHTML = (ttsState === 'playing') ? ttsPauseIconSvg : ttsPlayIconSvg;
    ttsPlayPauseBtn.title = (ttsState === 'playing') ? 'หยุดชั่วคราว' : 'เล่น';
  }

  function speakIndex(idx){
    if(!ttsSupported) return;
    if(idx < 0 || idx >= ttsQueue.length){
      stopTts();
      return;
    }
    ttsIndex = idx;
    clearTtsHighlight();
    var item = ttsQueue[idx];
    if(item.el.tagName === 'P'){
      item.el.classList.add('tts-active');
      item.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      item.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    var utt = new SpeechSynthesisUtterance(item.text);
    var voice = getSelectedTtsVoice();
    if(voice) utt.voice = voice;
    utt.rate = parseFloat(ttsRateSlider.value) || 1;
    utt.lang = voice ? voice.lang : 'th-TH';

    utt.onend = function(){
      if(ttsState === 'playing') speakIndex(ttsIndex + 1);
    };
    utt.onerror = function(e){
      if(e.error === 'interrupted' || e.error === 'canceled') return;
      ttsStatusText.textContent = 'เกิดข้อผิดพลาดในการอ่านออกเสียง';
      stopTts();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utt);
    ttsStatusText.textContent = 'กำลังอ่าน ' + (idx + 1) + '/' + ttsQueue.length;
    updatePlayPauseIcon();
  }

  function playTts(){
    if(!ttsSupported){
      showAlertDialog('ไม่รองรับ', 'เบราว์เซอร์นี้ไม่รองรับการอ่านออกเสียง (Web Speech API)');
      return;
    }
    readerTtsBar.classList.add('show');
    if(ttsState === 'paused' && ttsIndex >= 0){
      ttsState = 'playing';
      window.speechSynthesis.resume();
      ttsStatusText.textContent = 'กำลังอ่าน ' + (ttsIndex + 1) + '/' + ttsQueue.length;
      updatePlayPauseIcon();
    } else {
      var startEl = findStartElementFromScroll();
      var startIdx = buildTtsQueue(startEl);
      if(!ttsQueue.length){
        ttsStatusText.textContent = 'ไม่มีเนื้อหาให้อ่าน';
        return;
      }
      ttsState = 'playing';
      speakIndex(startIdx);
    }
  }

  function pauseTts(){
    if(!ttsSupported) return;
    ttsState = 'paused';
    window.speechSynthesis.pause();
    ttsStatusText.textContent = 'หยุดชั่วคราว';
    updatePlayPauseIcon();
  }

  function stopTts(){
    if(!ttsSupported) return;
    ttsState = 'stopped';
    ttsIndex = -1;
    ttsQueue = [];
    window.speechSynthesis.cancel();
    clearTtsHighlight();
    ttsStatusText.textContent = '';
    readerTtsBar.classList.remove('show');
    updatePlayPauseIcon();
  }

  readerTtsBtn.addEventListener('click', function(){
    if(readerTtsBar.classList.contains('show') && ttsState === 'stopped'){
      readerTtsBar.classList.remove('show');
    } else {
      readerTtsBar.classList.add('show');
      if(!ttsVoicesLoaded) populateTtsVoices();
    }
  });

  ttsCloseBarBtn.addEventListener('click', function(){ stopTts(); });
  ttsPlayPauseBtn.addEventListener('click', function(){
    if(ttsState === 'playing') pauseTts();
    else playTts();
  });
  ttsStopBtn.addEventListener('click', stopTts);

  ttsPrevBtn.addEventListener('click', function(){
    if(!ttsQueue.length){ playTts(); return; }
    var wasPlaying = (ttsState === 'playing');
    var newIdx = Math.max(0, ttsIndex - 1);
    if(wasPlaying){ speakIndex(newIdx); }
    else {
      ttsIndex = newIdx; clearTtsHighlight();
      ttsQueue[newIdx].el.classList.add('tts-active');
      ttsQueue[newIdx].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  ttsNextBtn.addEventListener('click', function(){
    if(!ttsQueue.length){ playTts(); return; }
    if(ttsIndex >= ttsQueue.length - 1) return;
    var wasPlaying = (ttsState === 'playing');
    var newIdx = ttsIndex + 1;
    if(wasPlaying){ speakIndex(newIdx); }
    else {
      ttsIndex = newIdx; clearTtsHighlight();
      ttsQueue[newIdx].el.classList.add('tts-active');
      ttsQueue[newIdx].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  ttsRateSlider.addEventListener('input', function(){
    ttsRateValue.textContent = parseFloat(ttsRateSlider.value).toFixed(1) + 'x';
  });
  ttsRateSlider.addEventListener('change', function(){
    if(appData.settings) appData.settings.ttsRate = ttsRateSlider.value;
    saveData();
    if(ttsState === 'playing') speakIndex(ttsIndex);
  });

  ttsVoiceSelect.addEventListener('change', function(){
    if(appData.settings) appData.settings.ttsVoiceURI = ttsVoiceSelect.value;
    saveData();
    if(ttsState === 'playing') speakIndex(ttsIndex);
  });

  readerOverlay.addEventListener('scroll', function() {
    if (!readerCurrentBook) return;
    clearTimeout(readerScrollTimer);
    var readerScrollBook = readerCurrentBook;
    readerScrollTimer = setTimeout(function() {
      readerScrollTimer = null;
      if (readerCurrentBook === readerScrollBook && readerOverlay.classList.contains('show')) {
        readerScrollBook.readerScrollPos = readerOverlay.scrollTop;
        saveData();
      }
    }, 500);
  }, { passive: true });

/* =============================================================
     ฟังก์ชันสแกนคลังคำจากทุกตอนในเล่ม (Whole-Book Glossary Mining)
     ใช้เทคนิค Bilingual Alignment: อ่านต้นฉบับคู่กับคำแปลจริง
     ============================================================= */
