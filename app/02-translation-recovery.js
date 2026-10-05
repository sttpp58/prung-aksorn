  /* ---------------- STEP 4.3 Translation Job Recovery ---------------- */
  function clearTranslationRecoveryUI(){
    var box = document.getElementById('translationRecoveryBox');
    if(box) box.remove();
  }

  function renderTranslationRecovery(jobs){
    clearTranslationRecoveryUI();
    if(!jobs || !jobs.length) return;
    var box=document.createElement('div');
    box.id='translationRecoveryBox';
    box.style.margin='12px 0';
    box.style.padding='12px';
    box.style.border='1px solid var(--border-color, #d9d9d9)';
    box.style.borderRadius='10px';
    box.style.background='var(--panel-bg, transparent)';
    var title=document.createElement('div');
    title.textContent='เธเธเธเธฒเธเนเธเธฅเธ—เธตเนเธ•เนเธญเธเธ•เธฃเธงเธเธชเธญเธ';
    title.style.fontWeight='600';
    title.style.marginBottom='8px';
    box.appendChild(title);
    jobs.forEach(function(job){
      var row=document.createElement('div');
      row.style.display='flex';
      row.style.alignItems='center';
      row.style.justifyContent='space-between';
      row.style.gap='8px';
      row.style.marginTop='6px';

      var label=document.createElement('span');
      label.style.flex='1';
      label.style.minWidth='0';
      label.style.overflow='hidden';
      label.style.textOverflow='ellipsis';
      label.style.whiteSpace='nowrap';
      label.textContent=(job.label||('Job '+job.jobId))+' โ€” '+job.completedChunks+'/'+job.totalChunks+' ('+job.status+')'+(job.reason?' โ€” '+job.reason:'');
      row.appendChild(label);

      var actions=document.createElement('div');
      actions.style.display='flex';
      actions.style.alignItems='center';
      actions.style.gap='6px';
      actions.style.flexShrink='0';

      if(job.recoverable){
        var btn=document.createElement('button');
        btn.type='button';
        btn.className='secondary-btn';
        if(job.jobType==='batch' && job.status==='failed'){
          btn.textContent='Retry';
          btn.addEventListener('click',function(){retryBatchTranslationJob(job.jobId);});
        }else if(job.jobType==='batch'){
          btn.textContent='เธเธนเนเธเธทเธ';
          btn.addEventListener('click',function(){prepareBatchTranslationRecovery(job.jobId);});
        }else{
          btn.textContent='เธเธนเนเธเธทเธ';
          btn.addEventListener('click',function(){prepareTranslationRecovery(job.jobId);});
        }
        actions.appendChild(btn);
      }

      var dismissBtn=document.createElement('button');
      dismissBtn.type='button';
      dismissBtn.className='secondary-btn';
      dismissBtn.textContent='เธเนเธญเธ';
      dismissBtn.title='เธเนเธญเธเธฃเธฒเธขเธเธฒเธฃเธเธตเนเธเธฒเธเธซเธเนเธฒเธเธญ เนเธ”เธขเนเธกเนเธฅเธ Translation Job';
      dismissBtn.addEventListener('click',function(){dismissTranslationRecoveryJob(job);});
      actions.appendChild(dismissBtn);

      row.appendChild(actions);
      box.appendChild(row);
    });

    var note=document.createElement('div');
    note.textContent='เธฃเธฐเธเธเธเธฐเนเธกเนเน€เธฃเธดเนเธก API เธญเธฑเธ•เนเธเธกเธฑเธ•เธด เธ•เนเธญเธเธเธ”เธเธนเนเธเธทเธเนเธฅเธฐเน€เธฃเธดเนเธกเธเธฒเธเธ”เนเธงเธขเธ•เธเน€เธญเธ โ€ข เธฃเธฒเธขเธเธฒเธฃเธ—เธตเนเธเนเธญเธเธเธฐเธเธฅเธฑเธเธกเธฒเน€เธกเธทเนเธญเธชเธ–เธฒเธเธฐ Job เน€เธเธฅเธตเนเธขเธ';
    note.style.marginTop='8px';
    note.style.fontSize='0.9em';
    note.style.opacity='0.75';
    box.appendChild(note);

    var anchor=resumeBtn&&resumeBtn.parentNode?resumeBtn.parentNode:null;
    if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(box,anchor);
  }

  async function scanTranslationJobs(){
    try{
      var jobs=await PrungAksornStorageV2.listTranslationJobs();
      var candidates=[];
      jobs.forEach(function(job){
        if(!job||['pending','running','paused','failed'].indexOf(job.status)<0)return;
        var base={
          jobId:job.jobId,
          projectId:job.projectId||null,
          bookId:job.bookId||null,
          chapterId:job.chapterId||null,
          jobType:job.jobType||'single',
          batchId:job.batchId||null,
          batchIndex:Number.isInteger(job.batchIndex)?job.batchIndex:null,
          status:job.status,
          completedChunks:Number(job.completedChunks||0),
          totalChunks:Number(job.totalChunks||0),
          revision:Number.isInteger(job.revision)?job.revision:0,
          updatedAt:Number(job.updatedAt||0),
          label:job.sourceSnapshot&&job.sourceSnapshot.title||('เธเธฒเธเนเธเธฅ '+job.jobId),
          recoverable:false,
          reason:''
        };
        try{
          PrungAksornStorageV2.validateTranslationJob(job);
          var proj=appData.projects.find(function(p){return p.id===job.projectId;});
          var book=proj&&(proj.books||[]).find(function(b){return b.id===job.bookId;});
          if(!proj){base.reason='เนเธกเนเธเธ Project เธ•เนเธเธ—เธฒเธ';candidates.push(base);return;}
          if(!book){base.reason='เนเธกเนเธเธ Book เธ•เนเธเธ—เธฒเธ';candidates.push(base);return;}
          if(hasCompletedTranslationHistory(job)) return;
          if(job.jobType==='batch'){
            if(typeof job.batchId!=='string'||!job.batchId){base.reason='Batch Job เนเธกเนเธกเธต batchId';candidates.push(base);return;}
            if(!Number.isInteger(job.batchIndex)||job.batchIndex<0){base.reason='Batch Job เธกเธต batchIndex เนเธกเนเธ–เธนเธเธ•เนเธญเธ';candidates.push(base);return;}
          }
          if(!job.sourceSnapshot||typeof job.sourceSnapshot.text!=='string'||!job.sourceSnapshot.text||job.sourceSnapshot.normalized!==true){base.reason='เนเธกเนเธกเธต Recovery Source Snapshot เธ—เธตเนเธชเธกเธเธนเธฃเธ“เน';candidates.push(base);return;}
          if(!Number.isInteger(job.chunkSize)||job.chunkSize<=0){base.reason='Job เธกเธต chunkSize เนเธกเนเธ–เธนเธเธ•เนเธญเธ';candidates.push(base);return;}
          if(!Number.isInteger(job.totalChunks)||job.totalChunks<0){base.reason='Job เธกเธต totalChunks เนเธกเนเธ–เธนเธเธ•เนเธญเธ';candidates.push(base);return;}
          base.recoverable=true;
          candidates.push(base);
        }catch(e){
          base.reason='Job validation เนเธกเนเธเนเธฒเธ';
          candidates.push(base);
          console.warn('Translation recovery candidate rejected:',job.jobId,e);
        }
      });
      var activeCandidates=candidates.filter(function(job){ return !isTranslationRecoveryDismissed(job); });
      var dedupedCandidates=dedupeTranslationRecoveryCandidates(activeCandidates);
      translationRecoveryJobs=dedupedCandidates;
      pruneTranslationRecoveryUIState();
      renderTranslationRecovery(dedupedCandidates);
    }catch(e){
      console.warn('Translation recovery scan failed:',e);
    }
  }

  function refreshTranslationRecoveryUI(){
    scanTranslationJobs().catch(function(e){
      console.warn('Translation recovery UI refresh failed:',e);
    });
  }

  async function prepareBatchTranslationRecovery(jobId){
    if(warnIfAiBusy())return;
    hideError();
    try{
      var job=await PrungAksornStorageV2.getTranslationJob(jobId);
      if(!job)throw new Error('เนเธกเนเธเธ Translation Job เธเธตเนเนเธฅเนเธง');
      PrungAksornStorageV2.validateTranslationJob(job);
      if(job.jobType!=='batch')throw new Error('Job เธเธตเนเนเธกเนเนเธเน Batch Job');
      if(['pending','running','paused'].indexOf(job.status)<0){
        if(job.status==='failed')throw new Error('Job เธเธตเนเธญเธขเธนเนเนเธเธชเธ–เธฒเธเธฐ failed เนเธซเนเนเธเน โ€Retryโ€ เนเธ—เธเธเธฒเธฃเธเธนเนเธเธทเธ');
        throw new Error('Job เธเธตเนเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธนเนเธเธทเธเธเธฒเธเธชเธ–เธฒเธเธฐ '+job.status+' เนเธ”เน');
      }
      if(typeof job.batchId!=='string'||!job.batchId)throw new Error('Batch Job เนเธกเนเธกเธต batchId');
      if(!Number.isInteger(job.batchIndex)||job.batchIndex<0)throw new Error('Batch Job เธกเธต batchIndex เนเธกเนเธ–เธนเธเธ•เนเธญเธ');

      var proj=appData.projects.find(function(p){return p.id===job.projectId;});
      if(!proj)throw new Error('เนเธกเนเธเธ Project เธ•เนเธเธ—เธฒเธเธเธญเธ Job');
      var book=(proj.books||[]).find(function(b){return b.id===job.bookId;});
      if(!book)throw new Error('เนเธกเนเธเธ Book เธ•เนเธเธ—เธฒเธเธเธญเธ Job');

      var snapshot=job.sourceSnapshot;
      if(!snapshot||typeof snapshot.text!=='string'||!snapshot.text||snapshot.normalized!==true)throw new Error('เนเธกเนเธเธ Recovery Source Snapshot เธ—เธตเนเธชเธกเธเธนเธฃเธ“เน');
      if(typeof snapshot.originalText!=='string')throw new Error('Original Source Snapshot เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(!Number.isInteger(job.chunkSize)||job.chunkSize<=0)throw new Error('Job เธกเธต chunkSize เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(!Number.isInteger(job.totalChunks)||job.totalChunks<0)throw new Error('Job เธกเธต totalChunks เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(!Number.isInteger(job.completedChunks)||job.completedChunks<0||job.completedChunks>job.totalChunks)throw new Error('Checkpoint เธเธญเธ Job เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(!Array.isArray(job.partialResults)||job.partialResults.length!==job.completedChunks)throw new Error('Checkpoint/partialResults เนเธกเนเธชเธญเธ”เธเธฅเนเธญเธเธเธฑเธ');
      if(job.partialResults.some(function(x,idx){return !x||x.chunkIndex!==idx||typeof x.text!=='string';}))throw new Error('partialResults เธเธญเธ Job เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(job.completedChunks>0){
        var expectedTail=getTail(job.partialResults[job.completedChunks-1].text,300);
        if(expectedTail!==String(job.previousTail||''))throw new Error('previousTail เนเธกเนเธ•เธฃเธเธเธฑเธ Checkpoint เธฅเนเธฒเธชเธธเธ”');
      }else if(String(job.previousTail||'')){
        throw new Error('previousTail เธ•เนเธญเธเธงเนเธฒเธเน€เธกเธทเนเธญเธขเธฑเธเนเธกเนเธกเธต Chunk เธ—เธตเน checkpoint');
      }

      if(providerSel.value!==job.provider)throw new Error('Provider เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ '+job.provider+' เธเนเธญเธเธเธนเนเธเธทเธ');
      if(modelInput.value!==job.model)throw new Error('Model เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ '+job.model+' เธเนเธญเธเธเธนเนเธเธทเธ');
      if(!document.getElementById('apiKey').value.trim())throw new Error('เธเธฃเธธเธ“เธฒเนเธชเน API Key เธเนเธญเธเธเธนเนเธเธทเธเธเธฒเธ');

      var chunks=splitIntoChunks(snapshot.text,job.chunkSize);
      if(chunks.length!==job.totalChunks)throw new Error('เธเธณเธเธงเธ Chunk เธ—เธตเนเธชเธฃเนเธฒเธเนเธซเธกเนเนเธกเนเธ•เธฃเธเธเธฑเธ Job: '+chunks.length+' != '+job.totalChunks);

      advanceAppContextGeneration();
      appData.currentProjectId=proj.id;
      proj.currentBookId=book.id;
      chapterTitle.value=snapshot.title||chapterTitle.value||'';
      inputText.value=snapshot.originalText;
      inCount.textContent=countWords(inputText.value)+' เธเธณ';
      updateChunkInfo();
      setOutput(job.partialResults.map(function(x){return x.text;}).join('\n\n'));

      pendingResume=null;
      pendingBatchResume={
        jobId:job.jobId,
        batchId:job.batchId,
        batchIndex:job.batchIndex,
        projectId:job.projectId,
        bookId:job.bookId,
        chapterId:job.chapterId,
        model:job.model,
        provider:job.provider,
        retryCount:Number(job.retryCount||0),
        completedChunks:job.completedChunks,
        totalChunks:job.totalChunks,
        sourceSnapshotText:snapshot.text,
        originalText:snapshot.originalText,
        title:snapshot.title||'',
        proj:proj,
        book:book,
        chunks:chunks,
        results:job.partialResults.map(function(x){return x.text;}),
        previousTail:String(job.previousTail||'')
      };
      activeTranslationJobId=null;
      if(resumeBtn){
        resumeBtn.textContent='เธ”เธณเน€เธเธดเธเธเธฒเธฃเธ•เนเธญเธเธฒเธเธเธธเธ”เธเธนเนเธเธทเธ';
        resumeBtn.classList.add('show');
      }
      renderProjects();
      renderBottomHistory();
      clearTranslationRecoveryUI();
      showError('เน€เธ•เธฃเธตเธขเธกเธเธนเนเธเธทเธ Batch Item '+(job.batchIndex+1)+' เนเธฅเนเธง เธเธ” โ€เธ”เธณเน€เธเธดเธเธเธฒเธฃเธ•เนเธญเธเธฒเธเธเธธเธ”เธเธนเนเธเธทเธโ€ เน€เธเธทเนเธญเน€เธฃเธดเนเธก API');
    }catch(e){
      showError('เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธ•เธฃเธตเธขเธก Batch Recovery Job เนเธ”เน: '+(e.message||e));
    }
  }

  async function runBatchTranslationRecovery(state){
    if(!state||!state.jobId)return;
    if(warnIfAiBusy())return;
    var job=null;
    var recoveryStarted=false;
    var recoveryCompleted=false;
    var recoveryContext=null;
    var activeRetryCount=Number(state.retryCount||0);
    try{
      job=await PrungAksornStorageV2.getTranslationJob(state.jobId);
      if(!job)throw new Error('เนเธกเนเธเธ Translation Job เธเธตเนเนเธฅเนเธง');
      PrungAksornStorageV2.validateTranslationJob(job);
      if(job.jobType!=='batch')throw new Error('Job เธเธตเนเนเธกเนเนเธเน Batch Job');
      if(['pending','running','paused'].indexOf(job.status)<0)throw new Error('Job เธเธตเนเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธนเนเธเธทเธเธเธฒเธเธชเธ–เธฒเธเธฐ '+job.status+' เนเธ”เน');
      if(job.batchId!==state.batchId||job.batchIndex!==state.batchIndex)throw new Error('Batch identity เธเธญเธ Job เน€เธเธฅเธตเนเธขเธเนเธเธฅเธเนเธ');
      if(job.projectId!==state.projectId||job.bookId!==state.bookId||job.chapterId!==state.chapterId)throw new Error('Source reference เธเธญเธ Job เน€เธเธฅเธตเนเธขเธเนเธเธฅเธเนเธ');
      if(providerSel.value!==job.provider)throw new Error('Provider เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ '+job.provider+' เธเนเธญเธเธเธนเนเธเธทเธ');
      if(modelInput.value!==job.model)throw new Error('Model เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ '+job.model+' เธเนเธญเธเธเธนเนเธเธทเธ');
      var key=document.getElementById('apiKey').value.trim();
      if(!key)throw new Error('เธเธฃเธธเธ“เธฒเนเธชเน API Key เธเนเธญเธเธเธนเนเธเธทเธเธเธฒเธ');

      recoveryContext=captureAppContext(state.proj,state.book);
      var snapshot=job.sourceSnapshot;
      if(!snapshot||snapshot.text!==state.sourceSnapshotText||snapshot.normalized!==true)throw new Error('Recovery Source Snapshot เธเธญเธ Job เน€เธเธฅเธตเนเธขเธเนเธเธฅเธเนเธ');
      if(typeof snapshot.originalText!=='string')throw new Error('Original Source Snapshot เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      var chunks=splitIntoChunks(snapshot.text,job.chunkSize);
      if(chunks.length!==job.totalChunks)throw new Error('เธเธณเธเธงเธ Chunk เธ—เธตเนเธชเธฃเนเธฒเธเนเธซเธกเนเนเธกเนเธ•เธฃเธเธเธฑเธ Job: '+chunks.length+' != '+job.totalChunks);
      if(job.completedChunks!==state.completedChunks)throw new Error('Checkpoint เธเธญเธ Job เน€เธเธฅเธตเนเธขเธเนเธเธฅเธเนเธ เธเธฃเธธเธ“เธฒเน€เธ•เธฃเธตเธขเธก Recovery เนเธซเธกเน');
      if(job.partialResults.length!==job.completedChunks)throw new Error('Checkpoint/partialResults เนเธกเนเธชเธญเธ”เธเธฅเนเธญเธเธเธฑเธ');
      if(job.completedChunks>0){
        var expectedTail=getTail(job.partialResults[job.completedChunks-1].text,300);
        if(expectedTail!==String(job.previousTail||''))throw new Error('previousTail เนเธกเนเธ•เธฃเธเธเธฑเธ Checkpoint เธฅเนเธฒเธชเธธเธ”');
      }
      activeRetryCount=Number(job.retryCount||0);
      var recoverySettingsSnapshot=normalizeTranslationSettingsSnapshot(job.settingsSnapshot,job.provider,job.model,job.chunkSize);

      var results=job.partialResults.map(function(x){return x.text;});
      var previousTail=String(job.previousTail||'');

      if(job.completedChunks===job.totalChunks){
        recoveryStarted=true;
        await PrungAksornStorageV2.completeTranslationJob(job.jobId,job.revision);
        activeTranslationJobRevision=null;
        recoveryCompleted=true;
      }else{
        job=await PrungAksornStorageV2.updateTranslationJob({jobId:job.jobId,status:'running',retryCount:activeRetryCount,error:null,settingsSnapshot:recoverySettingsSnapshot,expectedRevision:job.revision});
        activeTranslationJobRevision=job.revision;
        recoveryStarted=true;
        activeController=new AbortController();
        activeTranslationJobId=job.jobId;
        batchCancelled=false;
        setAiBusy(true);
        setTranslationSettingsLocked(true);
        resetActionStats();
        cancelBtn.classList.add('show');
        if(isAppContextCurrent(recoveryContext)){
          progressText.textContent='เธเธณเธฅเธฑเธเธเธนเนเธเธทเธ Batch Item '+(job.batchIndex+1)+' เธเธฒเธเธเธธเธ” '+job.completedChunks+'/'+job.totalChunks;
          setOutput(results.join('\n\n'));
        }

        for(var i=job.completedChunks;i<chunks.length;i++){
          if(batchCancelled){
            var cancelError=new Error('Batch recovery cancelled');
            cancelError.name='AbortError';
            throw cancelError;
          }
          if(isAppContextCurrent(recoveryContext)) progressText.textContent='เธเธณเธฅเธฑเธเธเธนเนเธเธทเธ Batch Item โ€” เธชเนเธงเธเธ—เธตเน '+(i+1)+'/'+chunks.length;
          var sys=buildTranslatePromptWithSettings(state.proj,previousTail,chunks[i],recoverySettingsSnapshot);
          var part=await callAIWithRetry(sys,chunks[i],key,job.model,activeController.signal,2,job.provider);
          var partTrim=part.trim();
          previousTail=getTail(partTrim,300);
          job=await PrungAksornStorageV2.checkpointTranslationJob({jobId:job.jobId,retryCount:activeRetryCount,expectedRevision:job.revision},i,partTrim,previousTail);
          activeTranslationJobRevision=job.revision;
          results.push(partTrim);
          if(isAppContextCurrent(recoveryContext)) setOutput(results.join('\n\n'));
        }

        await PrungAksornStorageV2.completeTranslationJob(job.jobId,job.revision);
        recoveryCompleted=true;
      }

      if(isAppContextCurrent(recoveryContext)){
        analyzeTQGCompletedOutput(snapshot.text, results.join('\n\n'), state.proj);
      }
      activeTranslationJobId=null;
      var existingEntry=findEntryById(state.proj,job.chapterId);
      if(!existingEntry){
        var newEntry={
          id:job.chapterId,
          ts:Date.now(),
          label:snapshot.title||('Batch Item '+(job.batchIndex+1)),
          input:snapshot.originalText,
          output:results.join('\n\n')
        };
        if(state.book)state.book.history.push(newEntry);
        else(state.proj.history=state.proj.history||[]).push(newEntry);
      }
      await restoreBatchHistoryOrder(state.proj,state.book,job.batchId);
      commitChange();
      pendingBatchResume=null;
      if(isAppContextCurrent(recoveryContext)){
        refreshTranslationRecoveryUI();
        if(resumeBtn){
          resumeBtn.classList.remove('show');
          resumeBtn.textContent='เธ”เธณเน€เธเธดเธเธเธฒเธฃเธ•เนเธญ';
        }
      }
      if(isAppContextCurrent(recoveryContext)){
        progressText.textContent='Batch Recovery เธชเธณเน€เธฃเนเธ';
        setTimeout(function(){
          if(progressText.textContent==='Batch Recovery เธชเธณเน€เธฃเนเธ')progressText.textContent='';
        },4000);
      }
    }catch(err){
      if(recoveryStarted&&!recoveryCompleted){
        try{
          if(err.name==='AbortError'){
            await PrungAksornStorageV2.cancelTranslationJob(job.jobId,job.revision);
          }else{
            await PrungAksornStorageV2.failTranslationJob(job.jobId,{
              code:'BATCH_RECOVERY_FAILED',
              message:String(err.message||'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”'),
              chunkIndex:typeof i==='number'?i:null,
              retryCount:activeRetryCount,
              timestamp:Date.now()
            },job.revision);
          }
        }catch(jobErr){
          console.warn('Batch recovery job state checkpoint failed:',jobErr);
        }
      }
      activeTranslationJobId=null;
      pendingBatchResume=null;
      if(err.name!=='AbortError' && (!recoveryContext || isAppContextCurrent(recoveryContext))){
        showError('Batch Recovery เนเธกเนเธชเธณเน€เธฃเนเธ: '+(err.message||err));
      }
    }finally{
      setTranslationSettingsLocked(false);
      setAiBusy(false);
      if(!recoveryContext || isAppContextCurrent(recoveryContext)){
        cancelBtn.classList.remove('show');
        if(progressText.textContent!=='Batch Recovery เธชเธณเน€เธฃเนเธ')progressText.textContent='';
      }
    }
  }

  async function retryBatchTranslationJob(jobId){
    if(warnIfAiBusy()) return;
    hideError();
    var job=null;
    var retryStarted=false;
    var retryCompleted=false;
    var retryContext=null;
    var retryCount=0;
    try{
      job=await PrungAksornStorageV2.getTranslationJob(jobId);
      if(!job) throw new Error('เนเธกเนเธเธ Translation Job เธเธตเนเนเธฅเนเธง');
      PrungAksornStorageV2.validateTranslationJob(job);
      if(job.jobType!=='batch') throw new Error('Job เธเธตเนเนเธกเนเนเธเน Batch Job');
      if(job.status!=='failed') throw new Error('Retry เนเธ”เนเน€เธเธเธฒเธฐ Job เธ—เธตเนเธญเธขเธนเนเนเธเธชเธ–เธฒเธเธฐ failed');
      if(typeof job.batchId!=='string'||!job.batchId) throw new Error('Batch Job เนเธกเนเธกเธต batchId');
      if(!Number.isInteger(job.batchIndex)||job.batchIndex<0) throw new Error('Batch Job เธกเธต batchIndex เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      var proj=appData.projects.find(function(p){return p.id===job.projectId;});
      if(!proj) throw new Error('เนเธกเนเธเธ Project เธ•เนเธเธ—เธฒเธเธเธญเธ Job');
      var book=(proj.books||[]).find(function(b){return b.id===job.bookId;});
      if(!book) throw new Error('เนเธกเนเธเธ Book เธ•เนเธเธ—เธฒเธเธเธญเธ Job');
      retryContext=captureAppContext(proj,book);
      var snapshot=job.sourceSnapshot;
      if(!snapshot||typeof snapshot.text!=='string'||!snapshot.text||snapshot.normalized!==true) throw new Error('เนเธกเนเธเธ Recovery Source Snapshot เธ—เธตเนเธชเธกเธเธนเธฃเธ“เน');
      if(!Number.isInteger(job.chunkSize)||job.chunkSize<=0) throw new Error('Job เธกเธต chunkSize เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(!Number.isInteger(job.totalChunks)||job.totalChunks<0) throw new Error('Job เธกเธต totalChunks เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(!Number.isInteger(job.completedChunks)||job.completedChunks<0||job.completedChunks>job.totalChunks) throw new Error('Checkpoint เธเธญเธ Job เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(!Array.isArray(job.partialResults)||job.partialResults.length!==job.completedChunks) throw new Error('Checkpoint/partialResults เนเธกเนเธชเธญเธ”เธเธฅเนเธญเธเธเธฑเธ');
      if(job.partialResults.some(function(x,idx){return !x||x.chunkIndex!==idx||typeof x.text!=='string';})) throw new Error('partialResults เธเธญเธ Job เนเธกเนเธ–เธนเธเธ•เนเธญเธ');
      if(job.completedChunks>0){
        var expectedTail=getTail(job.partialResults[job.completedChunks-1].text,300);
        if(expectedTail!==String(job.previousTail||'')) throw new Error('previousTail เนเธกเนเธ•เธฃเธเธเธฑเธ Checkpoint เธฅเนเธฒเธชเธธเธ”');
      }else if(String(job.previousTail||'')) {
        throw new Error('previousTail เธ•เนเธญเธเธงเนเธฒเธเน€เธกเธทเนเธญเธขเธฑเธเนเธกเนเธกเธต Chunk เธ—เธตเน checkpoint');
      }
      if(providerSel.value!==job.provider) throw new Error('Provider เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ '+job.provider+' เธเนเธญเธ Retry');
      if(modelInput.value!==job.model) throw new Error('Model เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ '+job.model+' เธเนเธญเธ Retry');
      var key=document.getElementById('apiKey').value.trim();
      if(!key) throw new Error('เธเธฃเธธเธ“เธฒเนเธชเน API Key เธเนเธญเธ Retry');

      var chunks=splitIntoChunks(snapshot.text,job.chunkSize);
      if(chunks.length!==job.totalChunks) throw new Error('เธเธณเธเธงเธ Chunk เธ—เธตเนเธชเธฃเนเธฒเธเนเธซเธกเนเนเธกเนเธ•เธฃเธเธเธฑเธ Job: '+chunks.length+' != '+job.totalChunks);

      retryCount=Number(job.retryCount||0)+1;
      var retrySettingsSnapshot=normalizeTranslationSettingsSnapshot(job.settingsSnapshot,job.provider,job.model,job.chunkSize);
      job=await PrungAksornStorageV2.updateTranslationJob({jobId:job.jobId,status:'running',retryCount:retryCount,error:null,settingsSnapshot:retrySettingsSnapshot,expectedRevision:job.revision});
      retryStarted=true;
      activeController=new AbortController();
      activeTranslationJobId=job.jobId;
      activeTranslationJobRevision=job.revision;
      batchCancelled=false;
      setAiBusy(true);
      setTranslationSettingsLocked(true);
      resetActionStats();
      cancelBtn.classList.add('show');
      if(isAppContextCurrent(retryContext)) progressText.textContent='เธเธณเธฅเธฑเธ Retry Batch Item '+(job.batchIndex+1)+' เธเธฒเธเธเธธเธ” '+job.completedChunks+'/'+job.totalChunks;

      var results=job.partialResults.map(function(x){return x.text;});
      var previousTail=String(job.previousTail||'');
      if(isAppContextCurrent(retryContext)) setOutput(results.join('\n\n'));

      for(var i=job.completedChunks;i<chunks.length;i++){
        if(batchCancelled){
          var cancelError=new Error('Batch retry cancelled');
          cancelError.name='AbortError';
          throw cancelError;
        }
        if(isAppContextCurrent(retryContext)) progressText.textContent='เธเธณเธฅเธฑเธ Retry Batch Item โ€” เธชเนเธงเธเธ—เธตเน '+(i+1)+'/'+chunks.length;
        var sys=buildTranslatePromptWithSettings(proj,previousTail,chunks[i],retrySettingsSnapshot);
        var part=await callAIWithRetry(sys,chunks[i],key,job.model,activeController.signal,2,job.provider);
        var partTrim=part.trim();
        previousTail=getTail(partTrim,300);
        job=await PrungAksornStorageV2.checkpointTranslationJob({jobId:job.jobId,retryCount:retryCount,expectedRevision:job.revision},i,partTrim,previousTail);
        activeTranslationJobRevision=job.revision;
        results.push(partTrim);
        if(isAppContextCurrent(retryContext)) setOutput(results.join('\n\n'));
      }

      await PrungAksornStorageV2.completeTranslationJob(job.jobId,job.revision);
      if(isAppContextCurrent(retryContext)){
        analyzeTQGCompletedOutput(snapshot.text, results.join('\n\n'), proj);
      }
      activeTranslationJobRevision=null;
      retryCompleted=true;
      activeTranslationJobId=null;

      var existingEntry=findEntryById(proj,job.chapterId);
      if(!existingEntry){
        var newEntry={
          id:job.chapterId,
          ts:Date.now(),
          label:snapshot.title||('Batch Item '+(job.batchIndex+1)),
          input:snapshot.originalText,
          output:results.join('\n\n')
        };
        if(book) book.history.push(newEntry);
        else (proj.history=proj.history||[]).push(newEntry);
      }
      await restoreBatchHistoryOrder(proj,book,job.batchId);
      commitChange();
      if(isAppContextCurrent(retryContext)) refreshTranslationRecoveryUI();
      if(isAppContextCurrent(retryContext)){
        progressText.textContent='Retry Batch Item เธชเธณเน€เธฃเนเธ';
        setTimeout(function(){
          if(progressText.textContent==='Retry Batch Item เธชเธณเน€เธฃเนเธ') progressText.textContent='';
        },4000);
      }
    }catch(err){
      if(retryStarted&&!retryCompleted){
        try{
          if(err.name==='AbortError'){
            await PrungAksornStorageV2.cancelTranslationJob(job.jobId,job.revision);
          }else{
            await PrungAksornStorageV2.failTranslationJob(job.jobId,{
              code:'BATCH_RETRY_FAILED',
              message:String(err.message||'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”'),
              chunkIndex:typeof i==='number'?i:null,
              retryCount:retryCount,
              timestamp:Date.now()
            },job.revision);
          }
        }catch(jobErr){
          console.warn('Batch retry job state checkpoint failed:',jobErr);
        }
      }
      activeTranslationJobId=null;
      if(err.name!=='AbortError' && (!retryContext || isAppContextCurrent(retryContext))) showError('Retry เนเธกเนเธชเธณเน€เธฃเนเธ: '+(err.message||err));
    }finally{
      setTranslationSettingsLocked(false);
      setAiBusy(false);
      if(!retryContext || isAppContextCurrent(retryContext)){
        cancelBtn.classList.remove('show');
        if(progressText.textContent!=='Retry Batch Item เธชเธณเน€เธฃเนเธ') progressText.textContent='';
      }
    }
  }

  async function prepareTranslationRecovery(jobId){
    if(warnIfAiBusy())return;
    hideError();
    try{
      var job=await PrungAksornStorageV2.getTranslationJob(jobId);
      if(!job)throw new Error('เนเธกเนเธเธ Translation Job เธเธตเนเนเธฅเนเธง');
      PrungAksornStorageV2.validateTranslationJob(job);
      if(job.jobType==='batch')throw new Error('Batch Job เธ•เนเธญเธเนเธเน Batch Recovery เนเธ”เธขเน€เธเธเธฒเธฐ');
      pendingBatchResume=null;
      if(['pending','running','paused','failed'].indexOf(job.status)<0)throw new Error('Job เธเธตเนเนเธกเนเธชเธฒเธกเธฒเธฃเธ–เธเธนเนเธเธทเธเธเธฒเธเธชเธ–เธฒเธเธฐ '+job.status+' เนเธ”เน');
      var proj=appData.projects.find(function(p){return p.id===job.projectId;});
      if(!proj)throw new Error('เนเธกเนเธเธ Project เธ•เนเธเธ—เธฒเธเธเธญเธ Job');
      var book=(proj.books||[]).find(function(b){return b.id===job.bookId;});
      if(!book)throw new Error('เนเธกเนเธเธ Book เธ•เนเธเธ—เธฒเธเธเธญเธ Job');
      var snapshot=job.sourceSnapshot;
      if(!snapshot||typeof snapshot.text!=='string'||!snapshot.text||snapshot.normalized!==true)throw new Error('เนเธกเนเธเธ Recovery Source Snapshot เธ—เธตเนเธชเธกเธเธนเธฃเธ“เน');
      var chunks=splitIntoChunks(snapshot.text,job.chunkSize);
      if(chunks.length!==job.totalChunks)throw new Error('เธเธณเธเธงเธ Chunk เธ—เธตเนเธชเธฃเนเธฒเธเนเธซเธกเนเนเธกเนเธ•เธฃเธเธเธฑเธ Job: '+chunks.length+' != '+job.totalChunks);
      if(job.completedChunks>chunks.length)throw new Error('Checkpoint เธเธญเธ Job เน€เธเธดเธเธเธณเธเธงเธ Chunk เธ—เธตเนเธเธนเนเธเธทเธเนเธ”เน');
      if(job.partialResults.length!==job.completedChunks)throw new Error('Checkpoint/partialResults เนเธกเนเธชเธญเธ”เธเธฅเนเธญเธเธเธฑเธ');
      if(job.completedChunks>0){
        var expectedTail=getTail(job.partialResults[job.completedChunks-1].text,300);
        if(expectedTail!==String(job.previousTail||''))throw new Error('previousTail เนเธกเนเธ•เธฃเธเธเธฑเธ Checkpoint เธฅเนเธฒเธชเธธเธ”');
      }
      if(providerSel.value!==job.provider)throw new Error('Provider เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ '+job.provider+' เธเนเธญเธเธเธนเนเธเธทเธ');
      if(modelInput.value!==job.model)throw new Error('Model เธเธฑเธเธเธธเธเธฑเธเนเธกเนเธ•เธฃเธเธเธฑเธ Job: เธเธฃเธธเธ“เธฒเน€เธฅเธทเธญเธ '+job.model+' เธเนเธญเธเธเธนเนเธเธทเธ');
      if(!document.getElementById('apiKey').value.trim())throw new Error('เธเธฃเธธเธ“เธฒเนเธชเน API Key เธเนเธญเธเธเธนเนเธเธทเธเธเธฒเธ');
      advanceAppContextGeneration();
      appData.currentProjectId=proj.id;
      proj.currentBookId=book.id;
      chapterTitle.value=snapshot.title||chapterTitle.value||'';
      inputText.value=snapshot.originalText;
      inCount.textContent=countWords(inputText.value)+' เธเธณ';
      updateChunkInfo();
      setOutput(job.partialResults.map(function(x){return x.text;}).join('\n\n'));
      pendingResume={
        chunks:chunks,
        proj:proj,
        key:null,
        model:job.model,
        startIndex:job.completedChunks,
        results:job.partialResults.map(function(x){return x.text;}),
        originalText:snapshot.originalText,
        chapterId:job.chapterId,
        jobId:job.jobId,
        provider:job.provider,
        sourceSnapshotText:snapshot.text,
        revision:job.revision,
        settingsSnapshot: normalizeTranslationSettingsSnapshot(job.settingsSnapshot, job.provider, job.model, job.chunkSize)
      };
      activeTranslationJobId=null;
      if(resumeBtn){
        resumeBtn.textContent='เธ”เธณเน€เธเธดเธเธเธฒเธฃเธ•เนเธญเธเธฒเธเธเธธเธ”เธเธนเนเธเธทเธ';
        resumeBtn.classList.add('show');
      }
      renderProjects();
      renderBottomHistory();
      clearTranslationRecoveryUI();
      showError('เน€เธ•เธฃเธตเธขเธกเธเธนเนเธเธทเธ Job '+job.jobId+' เนเธฅเนเธง เธเธ” โ€เธ”เธณเน€เธเธดเธเธเธฒเธฃเธ•เนเธญเธเธฒเธเธเธธเธ”เธเธนเนเธเธทเธโ€ เน€เธเธทเนเธญเน€เธฃเธดเนเธก API');
    }catch(e){
      showError('เนเธกเนเธชเธฒเธกเธฒเธฃเธ–เน€เธ•เธฃเธตเธขเธก Recovery Job เนเธ”เน: '+(e.message||e));
    }
  }

  /* เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเธเธฒเธ IndexedDB V2 เนเธฅเธฐเธ—เธณ migration V1 -> V2 เน€เธกเธทเนเธญเธเธณเน€เธเนเธ */
