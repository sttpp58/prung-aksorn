(function(){
  if(typeof document === 'undefined') return;

  // The application must not accept user input until its persisted state has
  // been loaded and all startup recovery checks have completed.
  document.body.inert = true;
  document.body.setAttribute('aria-busy', 'true');
  document.body.dataset.storageState = 'loading';
  window.PrungAksornAppReady = false;

  window.PrungAksornAppReadyPromise = (async function(){
    var loaded=await loadData();
    if(!loaded) throw new Error('IndexedDB initialization failed.');
    if(!storageReady) throw new Error('Storage readiness contract failed.');

    loadTranslationRecoveryUIState();
    applySettingsToUI();
    renderProjects();
    renderBottomHistory();
    updateActiveBanner();
    loadProjectDraft(getCurrentProject());
    await scanTranslationJobs();

    if(!storageReady) throw new Error('Storage became unavailable during application startup.');

    document.body.dataset.storageState = 'ready';
    document.body.removeAttribute('aria-busy');
    document.body.inert = false;
    window.PrungAksornAppReady = true;
    return true;
  })().catch(function(err){
    storageReady = false;
    window.PrungAksornAppReady = false;
    document.body.dataset.storageState = 'error';
    document.body.removeAttribute('aria-busy');
    console.error('Application initialization failed:', err);
    showError('ไม่สามารถเปิดฐานข้อมูลของแอปได้อย่างปลอดภัย กรุณารีโหลดหน้าเว็บและลองอีกครั้ง');
    // Keep the app inert on failure: writes must not run against an
    // uninitialized or unavailable storage layer.
    document.body.inert = true;
    return false;
  });

  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(function(){
    console.log('Service Worker Registered');
  }).catch(function(err){
    console.warn('Service Worker registration failed:', err);
  });
})();
