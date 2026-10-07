  var projectList = document.getElementById('projectList');
  var activeProjectBanner = document.getElementById('activeProjectBanner');
  var activeProjectName = document.getElementById('activeProjectName');

  function renderProjects(){
    projectList.innerHTML = '';
    if(appData.projects.length === 0){
      var empty = document.createElement('p');
      empty.className = 'sidebar-empty';
      empty.textContent = 'ยังไม่มีเรื่องนิยาย กด "+ เรื่องใหม่" เพื่อเริ่มต้น';
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
      renameProjBtn.title = 'เปลี่ยนชื่อเรื่อง';
      renameProjBtn.textContent = '✎';
      renameProjBtn.addEventListener('click', async function(e){
        e.stopPropagation();
        var newName = await showPromptDialog('เปลี่ยนชื่อเรื่องนิยาย', proj.name);
        if(newName && newName.trim()){
          proj.name = newName.trim();
          commitChange();
          updateActiveBanner();
        }
      });
      row.appendChild(renameProjBtn);

      var glossBtn = document.createElement('button');
      glossBtn.className = 'icon-btn';
      glossBtn.title = 'คลังคำ & บริบท';
      glossBtn.textContent = '⚙';
      glossBtn.addEventListener('click', function(e){
        e.stopPropagation();
        gp.classList.toggle('open');
      });
      row.appendChild(glossBtn);

      var delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.title = 'ลบเรื่องนี้';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', async function(e){
        e.stopPropagation();
        if(warnIfAiBusy()) return;
        var ok = await showConfirmDialog('ลบเรื่องนิยาย', 'ลบเรื่อง "' + proj.name + '" พร้อมประวัติทั้งหมด? การลบไม่สามารถย้อนกลับได้', true);
        if(ok){
          if(warnIfAiBusy()) return;
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
      gpTextarea.placeholder = 'ต้นฉบับ = คำแปล';
      gpTextarea.value = proj.glossary || '';
      gpTextarea.addEventListener('input', function(){
        proj.glossary = gpTextarea.value;
        saveData();
      });
      gp.appendChild(gpTextarea);

      var aiGlossBtn = document.createElement('button');
      aiGlossBtn.className = 'ai-glossary-btn';
      aiGlossBtn.type = 'button';
      aiGlossBtn.innerHTML = '<svg class="ic" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M10 2.2l1.5 5.3L17 9l-5.5 1.5L10 15.8l-1.5-5.3L3 9l5.5-1.5L10 2.2z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg> ให้ AI แนะนำคลังคำจากข้อความ';
      aiGlossBtn.addEventListener('click', function(e){
        e.stopPropagation();
        runAiGlossaryExtract(proj, gpTextarea);
      });
      gp.appendChild(aiGlossBtn);

      var contextTextarea = document.createElement('textarea');
      contextTextarea.rows = 3;
      contextTextarea.placeholder = 'บริบทของเรื่อง';
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
          breadBtn.title = 'อ่านเล่มนี้ต่อเนื่อง (โหมดนักอ่าน)';
          breadBtn.addEventListener('click', function(e){
            e.stopPropagation();
            openReaderMode(proj, book.id);
          });
          brow.appendChild(breadBtn);

          var brename = document.createElement('button');
          brename.className = 'icon-btn';
          brename.textContent = '✎';
          brename.title = 'เปลี่ยนชื่อเล่ม';
          brename.addEventListener('click', async function(e){
            e.stopPropagation();
            var newTitle = await showPromptDialog('เปลี่ยนชื่อเล่ม/โฟลเดอร์', book.title);
            if(newTitle && newTitle.trim()){
              book.title = newTitle.trim();
              commitChange();
            }
          });
          brow.appendChild(brename);

          var bdel = document.createElement('button');
          bdel.className = 'icon-btn';
          bdel.textContent = '✕';
          bdel.title = 'ลบเล่มนี้';
          bdel.addEventListener('click', async function(e){
            e.stopPropagation();
            if(warnIfAiBusy()) return;
            if(proj.books.length <= 1){ await showAlertDialog('ทำไม่ได้', 'ต้องมีอย่างน้อย 1 เล่มในเรื่องนี้'); return; }
            var ok = await showConfirmDialog('ลบเล่ม', 'ต้องการลบเล่ม "' + book.title + '" พร้อมประวัติในเล่มหรือไม่? การลบไม่สามารถย้อนกลับได้', true);
            if(ok){
              if(warnIfAiBusy()) return;
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
            histLabel.textContent = 'ตอนที่แปลแล้ว';
            hist.appendChild(histLabel);

            var bookHistory = book.history || [];
            var SIDEBAR_HISTORY_LIMIT = 8;
            if(bookHistory.length === 0){
              var hEmpty = document.createElement('div');
              hEmpty.className = 'history-empty';
              hEmpty.textContent = 'ยังไม่มีตอนที่แปลในเล่มนี้';
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
                eb.textContent = (entry.label || ('แปล' + (idx + 1))) + ' · ' + fmtTime(entry.ts);
                eb.addEventListener('click', function(ev){
                  ev.stopPropagation();
                  viewHistoryEntry(proj, entry, idx);
                });
                erow.appendChild(eb);

                var erename = document.createElement('button');
                erename.className = 'icon-btn';
                erename.title = 'เปลี่ยนชื่อตอนนี้';
                erename.textContent = '✎';
                erename.addEventListener('click', async function(ev){
                  ev.stopPropagation();
                  var currentLabel = entry.label || ('แปล' + (idx + 1));
                  var newLabel = await showPromptDialog('ตั้งชื่อตอนแปลนี้', currentLabel);
                  if(newLabel && newLabel.trim()){
                    entry.label = newLabel.trim();
                    commitChange();
                    if(viewingHistoryId === entry.id){
                      historyViewLabel.textContent = 'ดูประวัติ: ' + entry.label;
                      historyViewLabelBottom.textContent = 'ประวัติ: ' + entry.label;
                    }
                  }
                });
                erow.appendChild(erename);

                if(entry.parentId){
                  var ediff = document.createElement('button');
                  ediff.className = 'icon-btn diff-btn';
                  ediff.title = 'เทียบความต่างกับต้นฉบับที่แก้มาจาก';
                  ediff.textContent = 'Δ';
                  ediff.addEventListener('click', async function(ev){
                    ev.stopPropagation();
                    var parentEntry = findEntryById(proj, entry.parentId);
                    if(!parentEntry){ await showAlertDialog('ไม่พบต้นทาง', 'ไม่พบฉบับต้นทางที่ใช้เทียบ (อาจถูกลบไปแล้ว)'); return; }
                    openDiff(parentEntry.output, entry.output, 'เทียบ "' + (parentEntry.label || 'ต้นทาง') + '" กับ "' + (entry.label || 'ฉบับแก้ไข') + '"');
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
                viewAllLink.textContent = 'ดูทั้งหมด (' + bookHistory.length + ' ตอน) ที่แผงด้านล่าง ↓';
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
        addBookBtn.textContent = '+ เพิ่มเล่ม/โฟลเดอร์';
        addBookBtn.addEventListener('click', async function(e){
          e.stopPropagation();
          var bname = await showPromptDialog('ตั้งชื่อเล่ม/โฟลเดอร์ใหม่', 'เล่มที่ ' + (proj.books.length + 1));
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
    var name = await showPromptDialog('ตั้งชื่อเรื่องนิยาย', '');
    if(!name || !name.trim()) return;
    var proj = { id: makeId('p'), name: name.trim(), glossary: '', context: '', books: [] };
    var defaultBook = { id: makeId('b'), title: 'เล่ม 1', history: [], draft: '', chapterTitle: '' };
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
