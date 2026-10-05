  function openReaderMode(proj, bookId) {
    var book = (proj.books || []).find(function(b) { return b.id === bookId; });
    if (!book) return;
    var historyList = book.history || [];
    if (historyList.length === 0) {
      showAlertDialog('ไม่มีข้อมูล', 'ยังไม่มีตอนที่แปลในเล่มนี้');
      return;
    }

    clearTimeout(readerScrollTimer);
    readerScrollTimer = null;
    readerCurrentBook = book;
    readerBookTitle.textContent = proj.name + ' - ' + book.title;
    readerContent.innerHTML = '';
    readerTocList.innerHTML = '';

    var savedReaderFont = (appData.settings && Number(appData.settings.readerFontSize)) || 18;
    setReaderFontSize(savedReaderFont, false);


    var contentFrag = document.createDocumentFragment();
    var tocFrag = document.createDocumentFragment();

    historyList.forEach(function(entry, idx) {
      var titleText = entry.label || ('ตอนที่ ' + (idx + 1));
      var chId = 'rm-chap-' + entry.id;

      var chContainer = document.createElement('div');
      chContainer.style.marginBottom = '40px';

      var h2 = document.createElement('h2');
      h2.id = chId;
      h2.textContent = titleText;
      chContainer.appendChild(h2);

      var paras = (entry.output || '').split('\n');
      paras.forEach(function(p) {
        if (p.trim()) {
          var pEl = document.createElement('p');
          pEl.textContent = p.trim();
          chContainer.appendChild(pEl);
        }
      });
      contentFrag.appendChild(chContainer);

      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + chId;
      a.textContent = titleText;
      a.addEventListener('click', function(e) {
        e.preventDefault();
        var target = document.getElementById(chId);
        if(target) {
          target.scrollIntoView({ behavior: 'smooth' });
          clearTimeout(readerScrollTimer);
          var readerScrollBook = book;
          readerScrollTimer = setTimeout(function() {
            readerScrollTimer = null;
            if (readerCurrentBook === readerScrollBook && readerOverlay.classList.contains('show')) {
              readerScrollBook.readerScrollPos = readerOverlay.scrollTop;
              saveData();
            }
          }, 600);
        }
        closeReaderToc();
      });
      li.appendChild(a);
      tocFrag.appendChild(li);
    });

    readerContent.appendChild(contentFrag);
    readerTocList.appendChild(tocFrag);

    readerOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';

    requestAnimationFrame(function() {
      if (book.readerScrollPos) {
        readerOverlay.scrollTop = book.readerScrollPos;
      } else {
        readerOverlay.scrollTop = 0;
      }
    });
  }

  async function closeReaderMode() {
    stopTts();
    clearTimeout(readerScrollTimer);
    readerScrollTimer = null;
    if(readerCurrentBook){
      readerCurrentBook.readerScrollPos = readerOverlay.scrollTop;
      await saveDataImmediate();
    }
    readerOverlay.classList.remove('show');
    document.body.style.overflow = '';
    readerContent.innerHTML = '';
    readerCurrentBook = null;
    closeReaderToc();
  }

  function openReaderToc() {
    readerTocDrawer.classList.add('open');
    readerBackdrop.classList.add('show');
  }

  function closeReaderToc() {
    readerTocDrawer.classList.remove('open');
    readerBackdrop.classList.remove('show');
  }

  document.getElementById('readerCloseBtn').addEventListener('click', closeReaderMode);
  document.getElementById('readerTocBtn').addEventListener('click', openReaderToc);
  document.getElementById('readerTocCloseBtn').addEventListener('click', closeReaderToc);
  readerBackdrop.addEventListener('click', closeReaderToc);

  var openReaderBtnBottom = document.getElementById('openReaderBtnBottom');
  if(openReaderBtnBottom) {
    openReaderBtnBottom.addEventListener('click', function(){
      var proj = getCurrentProject();
      if(proj) {
        var activeBook = getActiveBook(proj);
        if(activeBook) openReaderMode(proj, activeBook.id);
      }
    });
  }
