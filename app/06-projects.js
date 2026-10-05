  var projectList = document.getElementById('projectList');
  var activeProjectBanner = document.getElementById('activeProjectBanner');
  var activeProjectName = document.getElementById('activeProjectName');

  function renderProjects(){
    projectList.innerHTML = '';
    if(appData.projects.length === 0){
      var empty = document.createElement('p');
      empty.className = 'sidebar-empty';
      empty.textContent = 'เธขเธฑเธเนเธกเนเธกเธตเน€เธฃเธทเนเธญเธเธเธดเธขเธฒเธข เธเธ” "+ เน€เธฃเธทเนเธญเธเนเธซเธกเน" เน€เธเธทเนเธญเน€เธฃเธดเนเธกเธ•เนเธ';
      projectList.appendChild(empty);
    }
    appData.projects.forEach(function(proj){
      var item = document.createElement('div');
      item.className = 'project-item';

      var row = document.createElement('div');
      row.className = 'project-row' + (proj.id === appData.currentProjectId ? ' active' : '');

      var name = document.createElement('span');
      name.className = 'project-name';
      name.textContent = proj.name;
      row.appendChild(name);

      var renameProjBtn = document.createElement('button');
      renameProjBtn.className = 'icon-btn';
      renameProjBtn.title = 'เน€เธเธฅเธตเนเธขเธเธเธทเนเธญเน€เธฃเธทเนเธญเธ';
      renameProjBtn.textContent = 'โ';
      renameProjBtn.addEventListener('click', async function(e){
        e.stopPropagation();
        var newName = await showPromptDialog('เน€เธเธฅเธตเนเธขเธเธเธทเนเธญเน€เธฃเธทเนเธญเธเธเธดเธขเธฒเธข', proj.name);
        if(newName && newName.trim()){
          proj.name = newName.trim();
          commitChange();
          updateActiveBanner();
        }
      });
      row.appendChild(renameProjBtn);

      var glossBtn = document.createElement('button');
      glossBtn.className = 'icon-btn';
      glossBtn.title = 'เธเธฅเธฑเธเธเธณ & เธเธฃเธดเธเธ—';
      glossBtn.textContent = 'โ';
      glossBtn.addEventListener('click', function(e){
        e.stopPropagation();
        gp.classList.toggle('open');
      });
      row.appendChild(glossBtn);

      var delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.title = 'เธฅเธเน€เธฃเธทเนเธญเธเธเธตเน';
      delBtn.textContent = 'โ•';
      delBtn.addEventListener('click', async function(e){
        e.stopPropagation();
        var ok = await showConfirmDialog('เธฅเธเน€เธฃเธทเนเธญเธเธเธดเธขเธฒเธข', 'เธฅเธเน€เธฃเธทเนเธญเธ "' + proj.name + '" เธเธฃเนเธญเธกเธเธฃเธฐเธงเธฑเธ•เธดเธ—เธฑเนเธเธซเธกเธ”? เธเธฒเธฃเธฅเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเนเธญเธเธเธฅเธฑเธเนเธ”เน', true);
        if(ok){
          var wasCurrentProject = appData.currentProjectId === proj.id;
          if(wasCurrentProject) advanceAppContextGeneration();
          appData.projects = appData.projects.filter(function(p){ return p !== proj; });
          if(wasCurrentProject) appData.currentProjectId = null;
          commitChange();
          updateActiveBanner();
        }
      });
      row.appendChild(delBtn);

      row.addEventListener('click', function(){
        flushPendingDraftSave();
        appData.currentProjectId = proj.id;
        expandedProjects[proj.id] = !expandedProjects[proj.id];
        saveData();
        renderProjects();
        updateActiveBanner();
        loadProjectDraft(proj);
        advanceAppContextGeneration();
      });

      item.appendChild(row);

      var gp = document.createElement('div');
      gp.className = 'glossary-panel';
      var gpTextarea = document.createElement('textarea');
      gpTextarea.rows = 3;
      gpTextarea.placeholder = 'เธ•เนเธเธเธเธฑเธ = เธเธณเนเธเธฅ';
      gpTextarea.value = proj.glossary || '';
      gpTextarea.addEventListener('input', function(){
        proj.glossary = gpTextarea.value;
        saveData();
      });
      gp.appendChild(gpTextarea);

      var aiGlossBtn = document.createElement('button');
      aiGlossBtn.className = 'ai-glossary-btn';
      aiGlossBtn.type = 'button';
      aiGlossBtn.innerHTML = '<svg class="ic" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M10 2.2l1.5 5.3L17 9l-5.5 1.5L10 15.8l-1.5-5.3L3 9l5.5-1.5L10 2.2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> เนเธซเน AI เนเธเธฐเธเธณเธเธฅเธฑเธเธเธณเธเธฒเธเธเนเธญเธเธงเธฒเธก';
      aiGlossBtn.addEventListener('click', function(e){
        e.stopPropagation();
        runAiGlossaryExtract(proj, gpTextarea);
      });
      gp.appendChild(aiGlossBtn);

      var contextTextarea = document.createElement('textarea');
      contextTextarea.rows = 3;
      contextTextarea.placeholder = 'เธเธฃเธดเธเธ—เธเธญเธเน€เธฃเธทเนเธญเธ';
      contextTextarea.style.marginTop = '8px';
      contextTextarea.value = proj.context || '';
      contextTextarea.addEventListener('input', function(){
        proj.context = contextTextarea.value;
        saveData();
      });
      gp.appendChild(contextTextarea);
      item.appendChild(gp);

      var bookContainer = document.createElement('div');
      bookContainer.className = 'book-list' + (expandedProjects[proj.id] ? ' open' : '');
      if(expandedProjects[proj.id]){
        (proj.books || []).forEach(function(book){
          var brow = document.createElement('div');
          brow.className = 'book-item-row' + (proj.currentBookId === book.id ? ' active' : '');

          var btitle = document.createElement('span');
          btitle.className = 'book-title-text';
          btitle.innerHTML = '<svg class="ic" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M2.5 4.2c2.2-1 5-1 7 .2v11.4c-2-1.2-4.8-1.2-7-.2V4.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M17.5 4.2c-2.2-1-5-1-7 .2v11.4c2-1.2 4.8-1.2 7-.2V4.2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg> ' + escapeHtml(book.title);
          btitle.addEventListener('click', function(e){
            e.stopPropagation();
            flushPendingDraftSave();
            proj.currentBookId = book.id;
            commitChange();
            loadProjectDraft(proj);
            advanceAppContextGeneration();
          });
          brow.appendChild(btitle);

          var breadBtn = document.createElement('button');
          breadBtn.className = 'icon-btn';
          breadBtn.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';
          breadBtn.title = 'เธญเนเธฒเธเน€เธฅเนเธกเธเธตเนเธ•เนเธญเน€เธเธทเนเธญเธ (เนเธซเธกเธ”เธเธฑเธเธญเนเธฒเธ)';
          breadBtn.addEventListener('click', function(e){
            e.stopPropagation();
            openReaderMode(proj, book.id);
          });
          brow.appendChild(breadBtn);

          var brename = document.createElement('button');
          brename.className = 'icon-btn';
          brename.textContent = 'โ';
          brename.title = 'เน€เธเธฅเธตเนเธขเธเธเธทเนเธญเน€เธฅเนเธก';
          brename.addEventListener('click', async function(e){
            e.stopPropagation();
            var newTitle = await showPromptDialog('เน€เธเธฅเธตเนเธขเธเธเธทเนเธญเน€เธฅเนเธก/เนเธเธฅเน€เธ”เธญเธฃเน', book.title);
            if(newTitle && newTitle.trim()){
              book.title = newTitle.trim();
              commitChange();
            }
          });
          brow.appendChild(brename);

          var bdel = document.createElement('button');
          bdel.className = 'icon-btn';
          bdel.textContent = 'โ•';
          bdel.title = 'เธฅเธเน€เธฅเนเธกเธเธตเน';
          bdel.addEventListener('click', async function(e){
            e.stopPropagation();
            if(proj.books.length <= 1){ await showAlertDialog('เธ—เธณเนเธกเนเนเธ”เน', 'เธ•เนเธญเธเธกเธตเธญเธขเนเธฒเธเธเนเธญเธข 1 เน€เธฅเนเธกเนเธเน€เธฃเธทเนเธญเธเธเธตเน'); return; }
            var ok = await showConfirmDialog('เธฅเธเน€เธฅเนเธก', 'เธ•เนเธญเธเธเธฒเธฃเธฅเธเน€เธฅเนเธก "' + book.title + '" เธเธฃเนเธญเธกเธเธฃเธฐเธงเธฑเธ•เธดเนเธเน€เธฅเนเธกเธซเธฃเธทเธญเนเธกเน? เธเธฒเธฃเธฅเธเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธขเนเธญเธเธเธฅเธฑเธเนเธ”เน', true);
            if(ok){
              var wasActiveBook = proj.currentBookId === book.id;
              flushPendingDraftSave();
              if(wasActiveBook) advanceAppContextGeneration();
              proj.books = proj.books.filter(function(b){ return b.id !== book.id; });
              if(wasActiveBook) proj.currentBookId = proj.books[0].id;
              commitChange();
              if(wasActiveBook) loadProjectDraft(proj);
            }
          });
          brow.appendChild(bdel);

          bookContainer.appendChild(brow);

          if(proj.currentBookId === book.id){
            var hist = document.createElement('div');
            hist.className = 'history-list open';
            var histLabel = document.createElement('div');
            histLabel.className = 'history-list-label';
            histLabel.textContent = 'เธ•เธญเธเธ—เธตเนเนเธเธฅเนเธฅเนเธง';
            hist.appendChild(histLabel);

            var bookHistory = book.history || [];
            var SIDEBAR_HISTORY_LIMIT = 8;
            if(bookHistory.length === 0){
              var hEmpty = document.createElement('div');
              hEmpty.className = 'history-empty';
              hEmpty.textContent = 'เธขเธฑเธเนเธกเนเธกเธตเธ•เธญเธเธ—เธตเนเนเธเธฅเนเธเน€เธฅเนเธกเธเธตเน';
              hist.appendChild(hEmpty);
            } else {
              var startIdx = Math.max(0, bookHistory.length - SIDEBAR_HISTORY_LIMIT);
              var visibleHistory = bookHistory.slice(startIdx);
              visibleHistory.forEach(function(entry, visIdx){
                var idx = startIdx + visIdx;
                var erow = document.createElement('div');
                erow.className = 'history-entry-row';

                var eb = document.createElement('button');
                eb.className = 'history-entry';
                eb.textContent = (entry.label || ('เนเธเธฅ' + (idx + 1))) + ' ยท ' + fmtTime(entry.ts);
                eb.addEventListener('click', function(ev){
                  ev.stopPropagation();
                  viewHistoryEntry(proj, entry, idx);
                });
                erow.appendChild(eb);

                var erename = document.createElement('button');
                erename.className = 'icon-btn';
                erename.title = 'เน€เธเธฅเธตเนเธขเธเธเธทเนเธญเธ•เธญเธเธเธตเน';
                erename.textContent = 'โ';
                erename.addEventListener('click', async function(ev){
                  ev.stopPropagation();
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
                erow.appendChild(erename);

                if(entry.parentId){
                  var ediff = document.createElement('button');
                  ediff.className = 'icon-btn diff-btn';
                  ediff.title = 'เน€เธ—เธตเธขเธเธเธงเธฒเธกเธ•เนเธฒเธเธเธฑเธเธ•เนเธเธเธเธฑเธเธ—เธตเนเนเธเนเธกเธฒเธเธฒเธ';
                  ediff.textContent = 'ฮ”';
                  ediff.addEventListener('click', async function(ev){
                    ev.stopPropagation();
                    var parentEntry = findEntryById(proj, entry.parentId);
                    if(!parentEntry){ await showAlertDialog('เนเธกเนเธเธเธ•เนเธเธ—เธฒเธ', 'เนเธกเนเธเธเธเธเธฑเธเธ•เนเธเธ—เธฒเธเธ—เธตเนเนเธเนเน€เธ—เธตเธขเธ (เธญเธฒเธเธ–เธนเธเธฅเธเนเธเนเธฅเนเธง)'); return; }
                    openDiff(parentEntry.output, entry.output, 'เน€เธ—เธตเธขเธ "' + (parentEntry.label || 'เธ•เนเธเธ—เธฒเธ') + '" เธเธฑเธ "' + (entry.label || 'เธเธเธฑเธเนเธเนเนเธ') + '"');
                  });
                  erow.appendChild(ediff);
                }

                hist.appendChild(erow);
              });

              if(bookHistory.length > SIDEBAR_HISTORY_LIMIT){
                var viewAllLink = document.createElement('button');
                viewAllLink.className = 'textbtn history-view-all-link';
                viewAllLink.style.display = 'block';
                viewAllLink.style.marginTop = '6px';
                viewAllLink.type = 'button';
                viewAllLink.textContent = 'เธ”เธนเธ—เธฑเนเธเธซเธกเธ” (' + bookHistory.length + ' เธ•เธญเธ) เธ—เธตเนเนเธเธเธ”เนเธฒเธเธฅเนเธฒเธ โ“';
                viewAllLink.addEventListener('click', function(ev){
                  ev.stopPropagation();
                  var panel = document.getElementById('projectHistoryBottom');
                  if(panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
                hist.appendChild(viewAllLink);
              }
            }
            bookContainer.appendChild(hist);
          }
        });

        var addBookBtn = document.createElement('button');
        addBookBtn.className = 'utility-btn';
        addBookBtn.style.marginTop = '4px';
        addBookBtn.style.fontSize = '11px';
        addBookBtn.textContent = '+ เน€เธเธดเนเธกเน€เธฅเนเธก/เนเธเธฅเน€เธ”เธญเธฃเน';
        addBookBtn.addEventListener('click', async function(e){
          e.stopPropagation();
          var bname = await showPromptDialog('เธ•เธฑเนเธเธเธทเนเธญเน€เธฅเนเธก/เนเธเธฅเน€เธ”เธญเธฃเนเนเธซเธกเน', 'เน€เธฅเนเธกเธ—เธตเน ' + (proj.books.length + 1));
          if(bname && bname.trim()){
            var newBook = { id: makeId('b'), title: bname.trim(), history: [], draft: '', chapterTitle: '' };
            flushPendingDraftSave();
            advanceAppContextGeneration();
            proj.books.push(newBook);
            proj.currentBookId = newBook.id;
            commitChange();
            loadProjectDraft(proj);
          }
        });
        bookContainer.appendChild(addBookBtn);
      }
      item.appendChild(bookContainer);

      projectList.appendChild(item);
    });
  }

  function updateActiveBanner(){
    var proj = getCurrentProject();
    if(proj){
      activeProjectBanner.style.display = 'flex';
      var activeBook = getActiveBook(proj);
      var bookInfo = activeBook ? (' (' + activeBook.title + ')') : '';
      activeProjectName.textContent = proj.name + bookInfo;
    } else {
      activeProjectBanner.style.display = 'none';
    }
  }

  document.getElementById('addProjBtn').addEventListener('click', async function(){
    var name = await showPromptDialog('เธ•เธฑเนเธเธเธทเนเธญเน€เธฃเธทเนเธญเธเธเธดเธขเธฒเธข', '');
    if(!name || !name.trim()) return;
    var proj = { id: makeId('p'), name: name.trim(), glossary: '', context: '', books: [] };
    var defaultBook = { id: makeId('b'), title: 'เน€เธฅเนเธก 1', history: [], draft: '', chapterTitle: '' };
    advanceAppContextGeneration();
    proj.books.push(defaultBook);
    proj.currentBookId = defaultBook.id;
    appData.projects.push(proj);
    appData.currentProjectId = proj.id;
    expandedProjects[proj.id] = true;
    commitChange();
    updateActiveBanner();
    loadProjectDraft(proj);
  });
