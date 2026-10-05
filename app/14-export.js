  downloadBtn.addEventListener('click', function(){
    var blob = new Blob([output.textContent], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    var objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = safeFilename(getCurrentProject() ? getCurrentProject().name : '') + '-ผลลัพธ์.txt';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(objectUrl); }, 0);
  });

  var SCRIPT_LOAD_PROMISES = Object.create(null);

  var SRI_MAP = {
    'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js': 'sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==',
    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js': 'sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==',
    'https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js': 'sha512-Qlv6VSKh1gDKGoJbnyA5RMXYcvnpIqhO++MhIM2fStMcGT9i2T//tSwYFlcyoRRDcDZ+TYHpH8azBBCyhpSeqw==',
    'https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js': 'sha512-Qlv6VSKh1gDKGoJbnyA5RMXYcvnpIqhO++MhIM2fStMcGT9i2T//tSwYFlcyoRRDcDZ+TYHpH8azBBCyhpSeqw==',
    'https://cdn.jsdelivr.net/npm/docx@8.2.3/build/index.umd.js': 'sha512-erFzi4xuyr2QqWOecuCJdsIqdTiv8o6z9kEfX0IM8zw8DfDjSV4bS42S9S7AqDyuORJmV6/VOCc4GRbkmWfKvg==',
    'https://unpkg.com/docx@8.2.3/build/index.umd.js': 'sha512-erFzi4xuyr2QqWOecuCJdsIqdTiv8o6z9kEfX0IM8zw8DfDjSV4bS42S9S7AqDyuORJmV6/VOCc4GRbkmWfKvg==',
    'https://unpkg.com/docx@8.2.3/build/index.iife.js': 'sha512-2mTPer9hvSxXSdLrNwaASIey5V9Tnb0D39T2wRHsNyt3PAsDUTEZK3PMNqqyFHzHkPK5z7X/yCieCEFMj9Cd3Q=='
  };

  function loadScript(src, integrity){
    if(SCRIPT_LOAD_PROMISES[src]) return SCRIPT_LOAD_PROMISES[src];
    var existing = document.querySelector('script[src="' + src + '"]');
    if(existing && existing.dataset.prungLoaded === 'true') return Promise.resolve();

    var promise = new Promise(function(resolve, reject){
      var s = existing || document.createElement('script');
      var timer = null;
      var settled = false;
      var hash = integrity || (typeof SRI_MAP !== 'undefined' ? SRI_MAP[src] : null);

      function cleanup(){
        if(timer) clearTimeout(timer);
        s.removeEventListener('load', onLoad);
        s.removeEventListener('error', onError);
      }
      function onLoad(){
        if(settled) return;
        settled = true;
        cleanup();
        s.dataset.prungLoaded = 'true';
        resolve();
      }
      function onError(){
        if(settled) return;
        settled = true;
        cleanup();
        if(!existing && s.parentNode) s.parentNode.removeChild(s);
        delete SCRIPT_LOAD_PROMISES[src];
        reject(new Error('โหลดไฟล์ ' + src + ' ไม่สำเร็จ'));
      }

      s.addEventListener('load', onLoad, { once: true });
      s.addEventListener('error', onError, { once: true });
      timer = setTimeout(onError, 15000);

      if(!existing){
        s.src = src;
        if(hash){
          s.integrity = hash;
          s.crossOrigin = 'anonymous';
          s.referrerPolicy = 'no-referrer';
        }
        document.head.appendChild(s);
      }
    });

    SCRIPT_LOAD_PROMISES[src] = promise;
    return promise;
  }

  document.getElementById('exportDocxBtn').addEventListener('click', async function(){
    var proj = getCurrentProject();
    var historyList = getActiveHistoryList(proj);
    if(!proj || !historyList || historyList.length === 0){
      await showAlertDialog('ไม่พบข้อมูล', 'ไม่พบประวัติการแปลในเล่มนี้สำหรับสร้างไฟล์ Word');
      return;
    }
    if(navigator.onLine === false){
      await showAlertDialog('ต้องใช้อินเทอร์เน็ต', 'การส่งออกไฟล์ Word ต้องโหลดระบบแปลงไฟล์จากอินเทอร์เน็ตก่อนใช้งานครั้งแรก แต่ตอนนี้ดูเหมือนอุปกรณ์ของคุณออฟไลน์อยู่ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่');
      return;
    }

    progressText.textContent = 'กำลังเตรียมระบบแปลงไฟล์ Word (.docx)...';
    try {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/docx@8.2.3/build/index.umd.js');
      } catch(e1) {
        try {
          await loadScript('https://unpkg.com/docx@8.2.3/build/index.umd.js');
        } catch(e2) {
          await loadScript('https://unpkg.com/docx@8.2.3/build/index.iife.js');
        }
      }

      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js');
      } catch(e1) {
        await loadScript('https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js');
      }

      var docxLib = window.docx;
      if(!docxLib){ await showAlertDialog('ไม่พร้อมใช้งาน', 'ระบบแปลงไฟล์ Word ไม่พร้อมใช้งาน'); return; }

      progressText.textContent = 'กำลังสร้างเอกสาร Word...';
      var activeBook = getActiveBook(proj);
      var bookTitle = activeBook ? activeBook.title : 'นิยาย';

      var children = [];
      children.push(new docxLib.Paragraph({
        children: [new docxLib.TextRun({ text: proj.name + ' — ' + bookTitle, bold: true, size: 36, font: 'Sarabun' })],
        space: { after: 400 }
      }));

      historyList.forEach(function(entry, idx){
        var titleText = entry.label || ('ตอนที่ ' + (idx + 1));
        children.push(new docxLib.Paragraph({
          children: [new docxLib.TextRun({ text: titleText, bold: true, size: 28, font: 'Sarabun' })],
          heading: docxLib.HeadingLevel.HEADING_1,
          space: { before: 300, after: 200 },
          pageBreakBefore: idx > 0
        }));

        var lines = (entry.output || '').split('\n');
        lines.forEach(function(line){
          if(line.trim()){
            children.push(new docxLib.Paragraph({
              children: [new docxLib.TextRun({ text: line, size: 24, font: 'Sarabun' })],
              space: { after: 120 },
              lineSpacing: { line: 360 }
            }));
          }
        });
      });

      var doc = new docxLib.Document({
        sections: [{ properties: {}, children: children }]
      });

      var blob = await docxLib.Packer.toBlob(doc);
      saveAs(blob, safeFilename(proj.name + '-' + bookTitle) + '.docx');
      progressText.textContent = 'ส่งออกไฟล์ Word สำเร็จ!';
    } catch(err){
      var msg = 'เกิดข้อผิดพลาดในการสร้างไฟล์ Word: ' + (err.message || '');
      if(navigator.onLine === false || /โหลดไฟล์/.test(err.message || '')){
        msg += '\n\n(อาจเกิดจากไม่มีการเชื่อมต่ออินเทอร์เน็ต การส่งออกไฟล์ Word ต้องใช้อินเทอร์เน็ตเพื่อโหลดระบบแปลงไฟล์)';
      }
      await showAlertDialog('เกิดข้อผิดพลาด', msg);
    } finally {
      setTimeout(function(){ progressText.textContent = ''; }, 2000);
    }
  });

  document.getElementById('exportEpubBtn').addEventListener('click', async function(){
    var proj = getCurrentProject();
    var historyList = getActiveHistoryList(proj);
    if(!proj || !historyList || historyList.length === 0){
      await showAlertDialog('ไม่พบข้อมูล', 'ไม่พบประวัติการแปลในเล่มนี้สำหรับสร้าง E-Book');
      return;
    }
    if(navigator.onLine === false){
      await showAlertDialog('ต้องใช้อินเทอร์เน็ต', 'การส่งออกไฟล์ E-Book ต้องโหลดระบบบีบอัดไฟล์จากอินเทอร์เน็ตก่อนใช้งานครั้งแรก แต่ตอนนี้ดูเหมือนอุปกรณ์ของคุณออฟไลน์อยู่ กรุณาเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่');
      return;
    }

    progressText.textContent = 'กำลังเตรียมระบบสร้างไฟล์ E-Book (.epub)...';
    try {
      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      } catch(e1) {
        await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
      }

      try {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js');
      } catch(e1) {
        await loadScript('https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js');
      }

      if(!window.JSZip){ await showAlertDialog('ไม่พร้อมใช้งาน', 'ระบบบีบอัดไฟล์ไม่พร้อมใช้งาน'); return; }

      progressText.textContent = 'กำลังสร้างไฟล์ E-Book...';
      var activeBook = getActiveBook(proj);
      var bookTitle = activeBook ? activeBook.title : 'นิยาย';
      var zip = new JSZip();

      zip.file('mimetype', 'application/epub+zip', { compression: "STORE" });
      var containerXml = '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';
      zip.file('META-INF/container.xml', containerXml);

      var manifestItems = '';
      var spineItems = '';
      var tocNav = '';

      historyList.forEach(function(entry, idx){
        var chId = 'chap_' + (idx + 1);
        var chFileName = chId + '.xhtml';
        var chTitle = entry.label || ('ตอนที่ ' + (idx + 1));

        var paras = (entry.output || '').split('\n').map(function(p){
          return p.trim() ? ('<p>' + escapeHtml(p) + '</p>') : '';
        }).join('\n');

        var xhtmlContent = '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml"><head><title>' + escapeHtml(chTitle) + '</title><style>body{font-family:serif;line-height:1.8;padding:5%;} h1{text-align:center;margin-bottom:1.5em;}</style></head><body><h1>' + escapeHtml(chTitle) + '</h1>' + paras + '</body></html>';

        zip.file('OEBPS/' + chFileName, xhtmlContent);
        manifestItems += '<item id="' + chId + '" href="' + chFileName + '" media-type="application/xhtml+xml"/>\n';
        spineItems += '<itemref idref="' + chId + '"/>\n';
        tocNav += '<li><a href="' + chFileName + '">' + escapeHtml(chTitle) + '</a></li>\n';
      });

      var opfContent = '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>' + escapeHtml(proj.name) + ' - ' + escapeHtml(bookTitle) + '</dc:title><dc:language>th</dc:language><dc:identifier id="BookId">urn:prung-aksorn:book:' + escapeHtml((activeBook && activeBook.id) ? activeBook.id : (proj.id || 'default')) + '</dc:identifier></metadata><manifest>' + manifestItems + '</manifest><spine>' + spineItems + '</spine></package>';
      zip.file('OEBPS/content.opf', opfContent);

      var blob = await zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
      saveAs(blob, safeFilename(proj.name + '-' + bookTitle) + '.epub');
      progressText.textContent = 'ส่งออกไฟล์ E-Book (.epub) สำเร็จ!';
    } catch(err){
      var msg = 'เกิดข้อผิดพลาดในการสร้างไฟล์ EPUB: ' + (err.message || '');
      if(navigator.onLine === false || /โหลดไฟล์/.test(err.message || '')){
        msg += '\n\n(อาจเกิดจากไม่มีการเชื่อมต่ออินเทอร์เน็ต การส่งออกไฟล์ E-Book ต้องใช้อินเทอร์เน็ตเพื่อโหลดระบบบีบอัดไฟล์)';
      }
      await showAlertDialog('เกิดข้อผิดพลาด', msg);
    } finally {
      setTimeout(function(){ progressText.textContent = ''; }, 2000);
    }
  });

  var checkConsistencyBtn = document.getElementById('checkConsistencyBtn');
  checkConsistencyBtn.addEventListener('click', async function(){
    var proj = getCurrentProject();
    var activeBook = getActiveBook(proj);
    var historyList = getActiveHistoryList(proj);
    var key = document.getElementById('apiKey').value.trim();

    if(!proj || !historyList || historyList.length < 2){
      await showAlertDialog('ยังตรวจสอบไม่ได้', 'ต้องมีอย่างน้อย 2 ตอนที่แปลแล้วในเล่มนี้ก่อน จึงจะเทียบความสม่ำเสมอข้ามตอนได้');
      return;
    }
    if(!proj.glossary || !proj.glossary.trim()){
      await showAlertDialog('ยังไม่มีคลังคำ', 'กรุณาใส่คลังคำเฉพาะเรื่อง (ชื่อตัวละคร/สถานที่) ไว้ก่อน จึงจะมีสิ่งให้เทียบความสม่ำเสมอได้');
      return;
    }
    if(!key){
      await showAlertDialog('ยังไม่ได้ใส่ API Key', 'กรุณาใส่ API Key ในหน้าตั้งค่าก่อน');
      return;
    }

    var taggedText = historyList.map(function(entry, idx){
      var label = entry.label || ('ตอนที่ ' + (idx + 1));
      return '=== ' + label + ' ===\n' + (entry.output || '');
    }).join('\n\n');

    var maxLen = parseInt(document.getElementById('chunkLen').value, 10) || 3000;
    var batches = splitIntoChunks(taggedText, Math.max(maxLen, 4000));

    var sys = 'คุณเป็นบรรณาธิการตรวจทานความสม่ำเสมอของคำศัพท์เฉพาะในนิยายแปล ' +
      'นี่คือคลังคำที่กำหนดไว้ล่วงหน้า (รูปแบบ "ต้นฉบับ = คำแปลไทย"):\n' + proj.glossary.trim() + '\n\n' +
      'เนื้อหาที่ให้มาจะมีป้ายชื่อกำกับแต่ละตอนไว้ในรูปแบบ "=== ชื่อตอน ===" ให้ตรวจสอบว่ามีการแปล/สะกด ' +
      'ชื่อตัวละคร สถานที่ หรือคำศัพท์เฉพาะ ที่ไม่ตรงกับคลังคำ หรือสะกด/แปลไม่ตรงกันระหว่างตอนหรือไม่ ' +
      'ถ้าพบให้รายงานเป็นข้อๆ ระบุชื่อตอนที่พบ คำที่ใช้ไม่ตรงกัน และคำที่ควรจะเป็นตามคลังคำ (ถ้ามี) ' +
      'ถ้าไม่พบปัญหาเลยในส่วนที่ตรวจ ให้ตอบว่า "ไม่พบความไม่สอดคล้องกัน" เท่านั้น ' +
      'ตอบเป็นภาษาไทย กระชับ เป็นข้อๆ ห้ามมีคำนำหรือคำลงท้าย';

    var reportParts = [];
    checkConsistencyBtn.disabled = true;
    resetActionStats();
    try{
      for(var i = 0; i < batches.length; i++){
        progressText.textContent = batches.length > 1
          ? ('กำลังตรวจสอบความสม่ำเสมอ ส่วนที่ ' + (i + 1) + '/' + batches.length + '...')
          : 'กำลังตรวจสอบความสม่ำเสมอของคลังคำทั้งเล่ม...';
        var result = await callAIWithRetry(sys, batches[i], key, modelInput.value, activeController ? activeController.signal : null, 2);
        if(result && result.trim()){
          reportParts.push(batches.length > 1 ? ('— ส่วนที่ ' + (i + 1) + ' —\n' + result.trim()) : result.trim());
        }
      }
      var fullReport = reportParts.join('\n\n').trim();
      if(!fullReport) fullReport = 'ไม่พบความไม่สอดคล้องกัน';

      if(currentActionTokens > 0) {
        fullReport += '\n\n---\n(ใช้ไปทั้งหมด ' + currentActionTokens.toLocaleString() + ' tokens, ประมาณ $' + currentActionCost.toFixed(4) + ')';
      }

      diffTitleEl.textContent = 'รายงานความสม่ำเสมอของคลังคำ — ' + (activeBook ? activeBook.title : proj.name);
      diffBody.textContent = fullReport;
      diffOverlay.classList.add('show');
    }catch(err){
      await showAlertDialog('ตรวจสอบไม่สำเร็จ', 'เกิดข้อผิดพลาด: ' + (err.message || ''));
    }finally{
      checkConsistencyBtn.disabled = false;
      progressText.textContent = '';
    }
  });
