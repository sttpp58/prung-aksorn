(function(){
  if(typeof document === 'undefined') return;
  (async function(){
    var loaded=await loadData();
    if(!loaded) throw new Error('IndexedDB initialization failed.');
    loadTranslationRecoveryUIState();
    applySettingsToUI();
    renderProjects();
    renderBottomHistory();
    updateActiveBanner();
    loadProjectDraft(getCurrentProject());
    await scanTranslationJobs();
  })().catch(function(err){
    storageReady=false;
    console.error('Application initialization failed:',err);
    showError('ไม่สามารถเปิดฐานข้อมูลของแอปได้อย่างปลอดภัย กรุณารีโหลดหน้าเว็บและลองอีกครั้ง');
  });
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(function(){
    console.log('Service Worker Registered');
  }).catch(function(err){
    console.warn('Service Worker registration failed:',err);
  });
})();
