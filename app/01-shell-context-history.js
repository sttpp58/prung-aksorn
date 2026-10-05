  var STORAGE_KEY = 'prungAksornData';
  var DB_NAME = 'PrungAksornDB';
  var STORE_NAME = 'app_store';

  /* ---------------- IndexedDB V2 Storage Adapter ---------------- */
  var storageV2 = window.PrungAksornStorageV2;
  if(!storageV2) throw new Error('IndexedDB V2 storage layer failed to load.');

  var state = { source: 'translate', level: 'edit', genre: 'เธ—เธฑเนเธงเนเธ', style: 'เธชเธณเธเธงเธเธเธฑเธเธเธธเธเธฑเธ' };
  var appData = { projects: [], currentProjectId: null };
  var storageReady = false;
  var expandedProjects = {};
  var viewingHistoryId = null;
  var activeController = null;
  var draftSaveTimer = null;
  var draftSaveContext = null;
  var draftSaveGeneration = 0;
  var outputFontSize = 15.5;

  var defaultSettings = { provider:'openai', model:'gpt-4o-mini', chunkLen:'3000', source:'translate', level:'edit', genre:'เธ—เธฑเนเธงเนเธ', style:'เธชเธณเธเธงเธเธเธฑเธเธเธธเธเธฑเธ', outputFontSize:15.5, darkMode: false, ttsRate:'1', ttsVoiceURI:'' };

  // API Pricing (USD per 1,000,000 tokens)
  var API_RATES = {
    'gpt-4o-mini': { in: 0.15, out: 0.60 },
    'gpt-4o':      { in: 2.50, out: 10.00 },
    'gpt-5-mini':  { in: 0.25, out: 2.00 },
    'gpt-5':       { in: 1.25, out: 10.00 },
    'gpt-5.5':     { in: 5.00, out: 30.00 },
    'gemini-2.5-flash': { in: 0.30, out: 2.50 },
    'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
    'gemini-2.5-pro':   { in: 1.25, out: 10.00 },
    'gemini-3.1-pro':   { in: 2.00, out: 12.00 },
    'gemini-3.1-flash-lite': { in: 0.25, out: 1.50 },
    'gemini-3.5-flash': { in: 1.50, out: 9.00 },
    'gemini-3.5-flash-lite': { in: 0.30, out: 2.50 },
    'gemini-3.6-flash': { in: 1.50, out: 7.50 },
    'gemma-4-26b-a4b-it': { in: 0.00, out: 0.00 },
    'gemma-4-31b-it': { in: 0.00, out: 0.00 },
    'gemini-flash-latest': { in: 1.50, out: 7.50 },
    'gemini-pro-latest':   { in: 2.00, out: 12.00 },
    'default': { in: 0.25, out: 2.00 }
  };
  var currentActionCost = 0;
  var currentActionTokens = 0;

  var tabSourceBtn = document.getElementById('tabSourceBtn');
  var tabOutputBtn = document.getElementById('tabOutputBtn');
  var mobileTabToggleBtn = document.getElementById('mobileTabToggleBtn');
  var spread = document.getElementById('spread');

  function switchMobileTab(tab){
    if(tab === 'source'){
      spread.classList.add('show-source');
      spread.classList.remove('show-output');
      tabSourceBtn.classList.add('active');
      tabOutputBtn.classList.remove('active');
      if(mobileTabToggleBtn) mobileTabToggleBtn.textContent = 'โก เธ”เธนเธเธฅเธฅเธฑเธเธเน';
    }else{
      spread.classList.remove('show-source');
      spread.classList.add('show-output');
      tabSourceBtn.classList.remove('active');
      tabOutputBtn.classList.add('active');
      if(mobileTabToggleBtn) mobileTabToggleBtn.textContent = 'โ–  เธ”เธนเธ•เนเธเธเธเธฑเธ';
    }
  }
  tabSourceBtn.addEventListener('click', function(){ switchMobileTab('source'); });
  tabOutputBtn.addEventListener('click', function(){ switchMobileTab('output'); });
  if(mobileTabToggleBtn){
    mobileTabToggleBtn.addEventListener('click', function(){
      if(spread.classList.contains('show-source')) switchMobileTab('output');
      else switchMobileTab('source');
    });
  }

  var touchStartX = 0;
  spread.addEventListener('touchstart', function(e){ touchStartX = e.changedTouches[0].screenX; }, {passive:true});
  spread.addEventListener('touchend', function(e){
    if(window.innerWidth <= 900){
      var touchEndX = e.changedTouches[0].screenX;
      if(touchStartX - touchEndX > 70) switchMobileTab('output');
      else if(touchEndX - touchStartX > 70) switchMobileTab('source');
    }
  }, {passive:true});

  var zenToggleBtn = document.getElementById('zenToggleBtn');
  var exitZenBtn = document.getElementById('exitZenBtn');

  function toggleZenMode(enable){
    var isZen = (typeof enable === 'boolean') ? enable : !document.body.classList.contains('zen-mode');
    document.body.classList.toggle('zen-mode', isZen);
    zenToggleBtn.textContent = isZen ? 'โ– เธญเธญเธเธเธฒเธเนเธซเธกเธ”เธชเธกเธฒเธเธด' : 'โถ เนเธซเธกเธ”เธชเธกเธฒเธเธด';
  }
  zenToggleBtn.addEventListener('click', function(){ toggleZenMode(); });
  exitZenBtn.addEventListener('click', function(){ toggleZenMode(false); });

  var themeToggleBtn = document.getElementById('themeToggleBtn');
  var readerThemeToggleBtn = document.getElementById('readerThemeToggleBtn');
  var readerThemeIconWrapper = document.getElementById('readerThemeIconWrapper');

  function updateThemeButtons(isDark) {
    themeToggleBtn.textContent = isDark ? 'โผ เนเธซเธกเธ”เธชเธงเนเธฒเธ' : 'โพ เนเธซเธกเธ”เธกเธทเธ”';
    if (readerThemeToggleBtn) {
      readerThemeIconWrapper.textContent = isDark ? 'โผ' : 'โพ';
      readerThemeToggleBtn.querySelector('.text-label').textContent = isDark ? 'เนเธซเธกเธ”เธชเธงเนเธฒเธ' : 'เนเธซเธกเธ”เธกเธทเธ”';
    }
  }

  function handleThemeToggle() {
    var isDark = document.documentElement.classList.toggle('dark-mode');
    updateThemeButtons(isDark);
    appData.settings.darkMode = isDark;
    saveData();
  }

  themeToggleBtn.addEventListener('click', handleThemeToggle);
  if(readerThemeToggleBtn) {
    readerThemeToggleBtn.addEventListener('click', handleThemeToggle);
  }

  function updateKeyStatusBadge(){
    var key = document.getElementById('apiKey').value.trim();
    var dot = document.getElementById('keyStatusDot');
    if(dot){
      if(key) dot.classList.add('ready');
      else dot.classList.remove('ready');
    }
  }
  document.getElementById('apiKey').addEventListener('input', updateKeyStatusBadge);

  var mainInput = document.getElementById('inputText');
  var outputBox = document.getElementById('output');
  var isSyncingScroll = false;

  function syncScroll(source, target){
    if(window.innerWidth > 900 && source.scrollHeight > source.clientHeight){
      if(isSyncingScroll) return;
      isSyncingScroll = true;
      var percentage = source.scrollTop / (source.scrollHeight - source.clientHeight || 1);
      target.scrollTop = percentage * (target.scrollHeight - target.clientHeight);
      setTimeout(function(){ isSyncingScroll = false; }, 40);
    }
  }
  mainInput.addEventListener('scroll', function(){ syncScroll(mainInput, outputBox); });
  outputBox.addEventListener('scroll', function(){ syncScroll(outputBox, mainInput); });

  var mobileSidebarToggle = document.getElementById('mobileSidebarToggle');
  var sidebar = document.getElementById('sidebar');
  var sidebarToggleIcon = document.getElementById('sidebarToggleIcon');
  mobileSidebarToggle.addEventListener('click', function(){
    var isOpen = sidebar.classList.toggle('open');
    sidebarToggleIcon.textContent = isOpen ? 'โ–ฒ' : 'โ–ผ';
  });

  var toggleBottomHistoryBtn = document.getElementById('toggleBottomHistoryBtn');
  var bottomHistoryList = document.getElementById('bottomHistoryList');
  toggleBottomHistoryBtn.addEventListener('click', function(){
    bottomHistoryList.classList.toggle('collapsed');
  });

  function scrollToTopTarget(){
    setTimeout(function(){
      var target = document.getElementById('mobileTabs') || document.getElementById('spread');
      if (target && window.innerWidth <= 900) {
        var topPos = target.getBoundingClientRect().top + window.pageYOffset - 12;
        window.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 60);
  }

  function getActiveBook(proj){
    if(!proj) return null;
    if(!proj.currentBookId && proj.books && proj.books.length > 0){
      proj.currentBookId = proj.books[0].id;
    }
    return (proj.books || []).find(function(b){ return b.id === proj.currentBookId; }) || null;
  }

  var appContextGeneration = 0;

  function captureAppContext(proj, book){
    return {
      generation: appContextGeneration,
      projectId: proj ? proj.id : null,
      bookId: book ? book.id : null
    };
  }

  function isAppContextCurrent(context){
    if(!context) return false;
    var proj = getCurrentProject();
    var book = proj ? getActiveBook(proj) : null;
    return context.generation === appContextGeneration &&
      context.projectId === (proj ? proj.id : null) &&
      context.bookId === (book ? book.id : null);
  }

  function advanceAppContextGeneration(){
    appContextGeneration += 1;
    return appContextGeneration;
  }

  function captureTranslationSettingsSnapshot(provider, model, chunkLen){
    return {
      source: state.source,
      level: state.level,
      genre: state.genre,
      style: state.style,
      provider: String(provider || ''),
      model: String(model || ''),
      chunkLen: Number(chunkLen) || 3000
    };
  }

  function normalizeTranslationSettingsSnapshot(snapshot, fallbackProvider, fallbackModel, fallbackChunkLen){
    var base = snapshot && typeof snapshot === 'object' ? snapshot : {};
    return {
      source: typeof base.source === 'string' ? base.source : state.source,
      level: typeof base.level === 'string' ? base.level : state.level,
      genre: typeof base.genre === 'string' ? base.genre : state.genre,
      style: typeof base.style === 'string' ? base.style : state.style,
      provider: typeof base.provider === 'string' && base.provider ? base.provider : String(fallbackProvider || ''),
      model: typeof base.model === 'string' && base.model ? base.model : String(fallbackModel || ''),
      chunkLen: Number(base.chunkLen) || Number(fallbackChunkLen) || 3000
    };
  }

  function buildTranslatePromptWithSettings(proj, previousTail, currentChunk, settingsSnapshot){
    var previous = {
      source: state.source,
      level: state.level,
      genre: state.genre,
      style: state.style
    };
    if(settingsSnapshot){
      state.source = settingsSnapshot.source;
      state.level = settingsSnapshot.level;
      state.genre = settingsSnapshot.genre;
      state.style = settingsSnapshot.style;
    }
    try{
      return buildTranslatePrompt(proj, previousTail, currentChunk);
    }finally{
      state.source = previous.source;
      state.level = previous.level;
      state.genre = previous.genre;
      state.style = previous.style;
    }
  }

  function getActiveHistoryList(proj){
    var book = getActiveBook(proj);
    return book ? (book.history || []) : (proj.history || []);
  }

  function renderBottomHistory(){
    var container = document.getElementById('bottomHistoryList');
    var box = document.getElementById('projectHistoryBottom');
    var titleEl = document.getElementById('bottomHistoryProjectTitle');
    if(!container || !box) return;

    var proj = getCurrentProject();
    if(!proj){
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';

    var activeBook = getActiveBook(proj);
    var bookSuffix = activeBook ? (' [' + activeBook.title + ']') : '';
    titleEl.textContent = 'เธเธฃเธฐเธงเธฑเธ•เธดเน€เธฃเธทเนเธญเธ "' + proj.name + '"' + bookSuffix;
    container.innerHTML = '';

    var historyList = getActiveHistoryList(proj);

    if(!historyList || historyList.length === 0){
      var empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'เธขเธฑเธเนเธกเนเธกเธตเธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเนเธเธฅเธชเธณเธซเธฃเธฑเธเน€เธฅเนเธกเธเธตเน';
      container.appendChild(empty);
      return;
    }

    historyList.forEach(function(entry, idx){
      var item = document.createElement('div');
      item.className = 'bottom-history-item' + (viewingHistoryId === entry.id ? ' active' : '');

      var title = document.createElement('div');
      title.className = 'bottom-history-title';
      title.textContent = (entry.label || ('เนเธเธฅ' + (idx + 1))) + ' ยท ' + fmtTime(entry.ts);
      title.addEventListener('click', function(){
        viewHistoryEntry(proj, entry, idx);
      });
      item.appendChild(title);

      var actions = document.createElement('div');
      actions.className = 'bottom-history-actions';

      var renameBtn = document.createElement('button');
      renameBtn.className = 'icon-btn';
      renameBtn.title = 'เน€เธเธฅเธตเนเธขเธเธเธทเนเธญ';
      renameBtn.textContent = 'โ';
      renameBtn.addEventListener('click', async function(e){
        e.stopPropagation();
        var currentLabel = entry.label || ('เนเธเธฅ' + (idx + 1));
        var newLabel = await showPromptDialog('เธ•เธฑเนเธเธเธทเนเธญเธ•เธญเธเนเธเธฅเธเธตเน', currentLabel);
        if(newLabel && newLabel.trim()){
          entry.label = newLabel.trim();
          commitChange();
          if(viewingHistoryId === entry.id){
            historyViewLabel.textContent = 'เธ”เธนเธเธฃเธฐเธงเธฑเธ•เธด: ' + entry.label;
            historyViewLabelBottom.textContent = 'เธเธฃเธฐเธงเธฑเธ•เธด: ' + entry.label;
          }
        }
      });
      actions.appendChild(renameBtn);

      var delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.title = 'เธฅเธเธเธฃเธฐเธงเธฑเธ•เธด';
      delBtn.textContent = 'โ•';
      delBtn.addEventListener('click', async function(e){
        e.stopPropagation();
        var itemLabel = entry.label || ('เนเธเธฅ' + (idx + 1));
        var ok = await showConfirmDialog('เธฅเธเธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเนเธเธฅ', 'เธ•เนเธญเธเธเธฒเธฃเธฅเธ "' + itemLabel + '" เธซเธฃเธทเธญเนเธกเน? เธเธฒเธฃเธฅเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเนเธญเธเธเธฅเธฑเธเนเธ”เน', true);
        if(ok){
          var currentHistory = getActiveHistoryList(proj);
          var filtered = currentHistory.filter(function(h){ return h.id !== entry.id; });
          if(activeBook) activeBook.history = filtered;
          else proj.history = filtered;

          if(viewingHistoryId === entry.id){
            viewingHistoryId = null;
            historyViewBanner.classList.remove('show');
            historyViewBannerBottom.classList.remove('show');
            loadProjectDraft(proj);
          }
          commitChange();
        }
      });
      actions.appendChild(delBtn);

      if(entry.parentId){
        var diffBtnEl = document.createElement('button');
        diffBtnEl.className = 'icon-btn diff-btn';
        diffBtnEl.title = 'เน€เธ—เธตเธขเธเธเธงเธฒเธกเธ•เนเธฒเธเธเธฑเธเธ•เนเธเธเธเธฑเธเธ—เธตเนเนเธเนเธกเธฒเธเธฒเธ';
        diffBtnEl.textContent = 'ฮ”';
        diffBtnEl.addEventListener('click', async function(e){
          e.stopPropagation();
          var parentEntry = findEntryById(proj, entry.parentId);
          if(!parentEntry){ await showAlertDialog('เนเธกเนเธเธเธ•เนเธเธ—เธฒเธ', 'เนเธกเนเธเธเธเธเธฑเธเธ•เนเธเธ—เธฒเธเธ—เธตเนเนเธเนเน€เธ—เธตเธขเธ (เธญเธฒเธเธ–เธนเธเธฅเธเนเธเนเธฅเนเธง)'); return; }
          openDiff(parentEntry.output, entry.output, 'เน€เธ—เธตเธขเธ "' + (parentEntry.label || 'เธ•เนเธเธ—เธฒเธ') + '" เธเธฑเธ "' + (entry.label || 'เธเธเธฑเธเนเธเนเนเธ') + '"');
        });
        actions.appendChild(diffBtnEl);
      }

      item.appendChild(actions);
      container.appendChild(item);
    });

    applyBottomHistorySearchFilter();
  }

  var bottomHistorySearchInput = document.getElementById('bottomHistorySearchInput');
  function applyBottomHistorySearchFilter(){
    var term = (bottomHistorySearchInput.value || '').trim().toLowerCase();
    document.querySelectorAll('#bottomHistoryList .bottom-history-item').forEach(function(item){
      var txt = item.textContent.toLowerCase();
      item.style.display = (!term || txt.indexOf(term) !== -1) ? '' : 'none';
    });
  }
  bottomHistorySearchInput.addEventListener('input', applyBottomHistorySearchFilter);
