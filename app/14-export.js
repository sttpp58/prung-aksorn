  downloadBtn.addEventListener('click', function(){
    var blob = new Blob([output.textContent], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    var objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = safeFilename(getCurrentProject() ? getCurrentProject().name : '') + '-เธเธฅเธฅเธฑเธเธเน.txt';
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
        reject(new Error('เนเธซเธฅเธ”เนเธเธฅเน ' + src + ' เนเธกเนเธชเธณเน€เธฃเนเธ'));
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
      await showAlertDialog('เนเธกเนเธเธเธเนเธญเธกเธนเธฅ', 'เนเธกเนเธเธเธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเนเธเธฅเนเธเน€เธฅเนเธกเธเธตเนเธชเธณเธซเธฃเธฑเธเธชเธฃเนเธฒเธเนเธเธฅเน Word');
      return;
    }
    if(navigator.onLine === false){
      await showAlertDialog('เธ•เนเธญเธเนเธเนเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•', 'เธเธฒเธฃเธชเนเธเธญเธญเธเนเธเธฅเน Word เธ•เนเธญเธเนเธซเธฅเธ”เธฃเธฐเธเธเนเธเธฅเธเนเธเธฅเนเธเธฒเธเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•เธเนเธญเธเนเธเนเธเธฒเธเธเธฃเธฑเนเธเนเธฃเธ เนเธ•เนเธ•เธญเธเธเธตเนเธ”เธนเน€เธซเธกเธทเธญเธเธญเธธเธเธเธฃเธ“เนเธเธญเธเธเธธเธ“เธญเธญเธเนเธฅเธเนเธญเธขเธนเน เธเธฃเธธเธ“เธฒเน€เธเธทเนเธญเธกเธ•เนเธญเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•เนเธฅเนเธงเธฅเธญเธเนเธซเธกเน');
      return;
    }

    progressText.textContent = 'เธเธณเธฅเธฑเธเน€เธ•เธฃเธตเธขเธกเธฃเธฐเธเธเนเธเธฅเธเนเธเธฅเน Word (.docx)...';
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
      if(!docxLib){ await showAlertDialog('เนเธกเนเธเธฃเนเธญเธกเนเธเนเธเธฒเธ', 'เธฃเธฐเธเธเนเธเธฅเธเนเธเธฅเน Word เนเธกเนเธเธฃเนเธญเธกเนเธเนเธเธฒเธ'); return; }

      progressText.textContent = 'เธเธณเธฅเธฑเธเธชเธฃเนเธฒเธเน€เธญเธเธชเธฒเธฃ Word...';
      var activeBook = getActiveBook(proj);
      var bookTitle = activeBook ? activeBook.title : 'เธเธดเธขเธฒเธข';

      var children = [];
      children.push(new docxLib.Paragraph({
        children: [new docxLib.TextRun({ text: proj.name + ' โ€” ' + bookTitle, bold: true, size: 36, font: 'Sarabun' })],
        space: { after: 400 }
      }));

      historyList.forEach(function(entry, idx){
        var titleText = entry.label || ('เธ•เธญเธเธ—เธตเน ' + (idx + 1));
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
      progressText.textContent = 'เธชเนเธเธญเธญเธเนเธเธฅเน Word เธชเธณเน€เธฃเนเธ!';
    } catch(err){
      var msg = 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เนเธเธเธฒเธฃเธชเธฃเนเธฒเธเนเธเธฅเน Word: ' + (err.message || '');
      if(navigator.onLine === false || /เนเธซเธฅเธ”เนเธเธฅเน/.test(err.message || '')){
        msg += '\n\n(เธญเธฒเธเน€เธเธดเธ”เธเธฒเธเนเธกเนเธกเธตเธเธฒเธฃเน€เธเธทเนเธญเธกเธ•เนเธญเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ• เธเธฒเธฃเธชเนเธเธญเธญเธเนเธเธฅเน Word เธ•เนเธญเธเนเธเนเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•เน€เธเธทเนเธญเนเธซเธฅเธ”เธฃเธฐเธเธเนเธเธฅเธเนเธเธฅเน)';
      }
      await showAlertDialog('เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”', msg);
    } finally {
      setTimeout(function(){ progressText.textContent = ''; }, 2000);
    }
  });

  document.getElementById('exportEpubBtn').addEventListener('click', async function(){
    var proj = getCurrentProject();
    var historyList = getActiveHistoryList(proj);
    if(!proj || !historyList || historyList.length === 0){
      await showAlertDialog('เนเธกเนเธเธเธเนเธญเธกเธนเธฅ', 'เนเธกเนเธเธเธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเนเธเธฅเนเธเน€เธฅเนเธกเธเธตเนเธชเธณเธซเธฃเธฑเธเธชเธฃเนเธฒเธ E-Book');
      return;
    }
    if(navigator.onLine === false){
      await showAlertDialog('เธ•เนเธญเธเนเธเนเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•', 'เธเธฒเธฃเธชเนเธเธญเธญเธเนเธเธฅเน E-Book เธ•เนเธญเธเนเธซเธฅเธ”เธฃเธฐเธเธเธเธตเธเธญเธฑเธ”เนเธเธฅเนเธเธฒเธเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•เธเนเธญเธเนเธเนเธเธฒเธเธเธฃเธฑเนเธเนเธฃเธ เนเธ•เนเธ•เธญเธเธเธตเนเธ”เธนเน€เธซเธกเธทเธญเธเธญเธธเธเธเธฃเธ“เนเธเธญเธเธเธธเธ“เธญเธญเธเนเธฅเธเนเธญเธขเธนเน เธเธฃเธธเธ“เธฒเน€เธเธทเนเธญเธกเธ•เนเธญเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•เนเธฅเนเธงเธฅเธญเธเนเธซเธกเน');
      return;
    }

    progressText.textContent = 'เธเธณเธฅเธฑเธเน€เธ•เธฃเธตเธขเธกเธฃเธฐเธเธเธชเธฃเนเธฒเธเนเธเธฅเน E-Book (.epub)...';
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

      if(!window.JSZip){ await showAlertDialog('เนเธกเนเธเธฃเนเธญเธกเนเธเนเธเธฒเธ', 'เธฃเธฐเธเธเธเธตเธเธญเธฑเธ”เนเธเธฅเนเนเธกเนเธเธฃเนเธญเธกเนเธเนเธเธฒเธ'); return; }

      progressText.textContent = 'เธเธณเธฅเธฑเธเธชเธฃเนเธฒเธเนเธเธฅเน E-Book...';
      var activeBook = getActiveBook(proj);
      var bookTitle = activeBook ? activeBook.title : 'เธเธดเธขเธฒเธข';
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
        var chTitle = entry.label || ('เธ•เธญเธเธ—เธตเน ' + (idx + 1));

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
      progressText.textContent = 'เธชเนเธเธญเธญเธเนเธเธฅเน E-Book (.epub) เธชเธณเน€เธฃเนเธ!';
    } catch(err){
      var msg = 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”เนเธเธเธฒเธฃเธชเธฃเนเธฒเธเนเธเธฅเน EPUB: ' + (err.message || '');
      if(navigator.onLine === false || /เนเธซเธฅเธ”เนเธเธฅเน/.test(err.message || '')){
        msg += '\n\n(เธญเธฒเธเน€เธเธดเธ”เธเธฒเธเนเธกเนเธกเธตเธเธฒเธฃเน€เธเธทเนเธญเธกเธ•เนเธญเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ• เธเธฒเธฃเธชเนเธเธญเธญเธเนเธเธฅเน E-Book เธ•เนเธญเธเนเธเนเธญเธดเธเน€เธ—เธญเธฃเนเน€เธเนเธ•เน€เธเธทเนเธญเนเธซเธฅเธ”เธฃเธฐเธเธเธเธตเธเธญเธฑเธ”เนเธเธฅเน)';
      }
      await showAlertDialog('เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”', msg);
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
      await showAlertDialog('เธขเธฑเธเธ•เธฃเธงเธเธชเธญเธเนเธกเนเนเธ”เน', 'เธ•เนเธญเธเธกเธตเธญเธขเนเธฒเธเธเนเธญเธข 2 เธ•เธญเธเธ—เธตเนเนเธเธฅเนเธฅเนเธงเนเธเน€เธฅเนเธกเธเธตเนเธเนเธญเธ เธเธถเธเธเธฐเน€เธ—เธตเธขเธเธเธงเธฒเธกเธชเธกเนเธณเน€เธชเธกเธญเธเนเธฒเธกเธ•เธญเธเนเธ”เน');
      return;
    }
    if(!proj.glossary || !proj.glossary.trim()){
      await showAlertDialog('เธขเธฑเธเนเธกเนเธกเธตเธเธฅเธฑเธเธเธณ', 'เธเธฃเธธเธ“เธฒเนเธชเนเธเธฅเธฑเธเธเธณเน€เธเธเธฒเธฐเน€เธฃเธทเนเธญเธ (เธเธทเนเธญเธ•เธฑเธงเธฅเธฐเธเธฃ/เธชเธ–เธฒเธเธ—เธตเน) เนเธงเนเธเนเธญเธ เธเธถเธเธเธฐเธกเธตเธชเธดเนเธเนเธซเนเน€เธ—เธตเธขเธเธเธงเธฒเธกเธชเธกเนเธณเน€เธชเธกเธญเนเธ”เน');
      return;
    }
    if(!key){
      await showAlertDialog('เธขเธฑเธเนเธกเนเนเธ”เนเนเธชเน API Key', 'เธเธฃเธธเธ“เธฒเนเธชเน API Key เนเธเธซเธเนเธฒเธ•เธฑเนเธเธเนเธฒเธเนเธญเธ');
      return;
    }

    var taggedText = historyList.map(function(entry, idx){
      var label = entry.label || ('เธ•เธญเธเธ—เธตเน ' + (idx + 1));
      return '=== ' + label + ' ===\n' + (entry.output || '');
    }).join('\n\n');

    var maxLen = parseInt(document.getElementById('chunkLen').value, 10) || 3000;
    var batches = splitIntoChunks(taggedText, Math.max(maxLen, 4000));

    var sys = 'เธเธธเธ“เน€เธเนเธเธเธฃเธฃเธ“เธฒเธเธดเธเธฒเธฃเธ•เธฃเธงเธเธ—เธฒเธเธเธงเธฒเธกเธชเธกเนเธณเน€เธชเธกเธญเธเธญเธเธเธณเธจเธฑเธเธ—เนเน€เธเธเธฒเธฐเนเธเธเธดเธขเธฒเธขเนเธเธฅ ' +
      'เธเธตเนเธเธทเธญเธเธฅเธฑเธเธเธณเธ—เธตเนเธเธณเธซเธเธ”เนเธงเนเธฅเนเธงเธเธซเธเนเธฒ (เธฃเธนเธเนเธเธ "เธ•เนเธเธเธเธฑเธ = เธเธณเนเธเธฅเนเธ—เธข"):\n' + proj.glossary.trim() + '\n\n' +
      'เน€เธเธทเนเธญเธซเธฒเธ—เธตเนเนเธซเนเธกเธฒเธเธฐเธกเธตเธเนเธฒเธขเธเธทเนเธญเธเธณเธเธฑเธเนเธ•เนเธฅเธฐเธ•เธญเธเนเธงเนเนเธเธฃเธนเธเนเธเธ "=== เธเธทเนเธญเธ•เธญเธ ===" เนเธซเนเธ•เธฃเธงเธเธชเธญเธเธงเนเธฒเธกเธตเธเธฒเธฃเนเธเธฅ/เธชเธฐเธเธ” ' +
      'เธเธทเนเธญเธ•เธฑเธงเธฅเธฐเธเธฃ เธชเธ–เธฒเธเธ—เธตเน เธซเธฃเธทเธญเธเธณเธจเธฑเธเธ—เนเน€เธเธเธฒเธฐ เธ—เธตเนเนเธกเนเธ•เธฃเธเธเธฑเธเธเธฅเธฑเธเธเธณ เธซเธฃเธทเธญเธชเธฐเธเธ”/เนเธเธฅเนเธกเนเธ•เธฃเธเธเธฑเธเธฃเธฐเธซเธงเนเธฒเธเธ•เธญเธเธซเธฃเธทเธญเนเธกเน ' +
      'เธ–เนเธฒเธเธเนเธซเนเธฃเธฒเธขเธเธฒเธเน€เธเนเธเธเนเธญเน เธฃเธฐเธเธธเธเธทเนเธญเธ•เธญเธเธ—เธตเนเธเธ เธเธณเธ—เธตเนเนเธเนเนเธกเนเธ•เธฃเธเธเธฑเธ เนเธฅเธฐเธเธณเธ—เธตเนเธเธงเธฃเธเธฐเน€เธเนเธเธ•เธฒเธกเธเธฅเธฑเธเธเธณ (เธ–เนเธฒเธกเธต) ' +
      'เธ–เนเธฒเนเธกเนเธเธเธเธฑเธเธซเธฒเน€เธฅเธขเนเธเธชเนเธงเธเธ—เธตเนเธ•เธฃเธงเธ เนเธซเนเธ•เธญเธเธงเนเธฒ "เนเธกเนเธเธเธเธงเธฒเธกเนเธกเนเธชเธญเธ”เธเธฅเนเธญเธเธเธฑเธ" เน€เธ—เนเธฒเธเธฑเนเธ ' +
      'เธ•เธญเธเน€เธเนเธเธ เธฒเธฉเธฒเนเธ—เธข เธเธฃเธฐเธเธฑเธ เน€เธเนเธเธเนเธญเน เธซเนเธฒเธกเธกเธตเธเธณเธเธณเธซเธฃเธทเธญเธเธณเธฅเธเธ—เนเธฒเธข';

    var reportParts = [];
    checkConsistencyBtn.disabled = true;
    resetActionStats();
    try{
      for(var i = 0; i < batches.length; i++){
        progressText.textContent = batches.length > 1
          ? ('เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธเธงเธฒเธกเธชเธกเนเธณเน€เธชเธกเธญ เธชเนเธงเธเธ—เธตเน ' + (i + 1) + '/' + batches.length + '...')
          : 'เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธเธงเธฒเธกเธชเธกเนเธณเน€เธชเธกเธญเธเธญเธเธเธฅเธฑเธเธเธณเธ—เธฑเนเธเน€เธฅเนเธก...';
        var result = await callAIWithRetry(sys, batches[i], key, modelInput.value, activeController ? activeController.signal : null, 2);
        if(result && result.trim()){
          reportParts.push(batches.length > 1 ? ('โ€” เธชเนเธงเธเธ—เธตเน ' + (i + 1) + ' โ€”\n' + result.trim()) : result.trim());
        }
      }
      var fullReport = reportParts.join('\n\n').trim();
      if(!fullReport) fullReport = 'เนเธกเนเธเธเธเธงเธฒเธกเนเธกเนเธชเธญเธ”เธเธฅเนเธญเธเธเธฑเธ';

      if(currentActionTokens > 0) {
        fullReport += '\n\n---\n(เนเธเนเนเธเธ—เธฑเนเธเธซเธกเธ” ' + currentActionTokens.toLocaleString() + ' tokens, เธเธฃเธฐเธกเธฒเธ“ $' + currentActionCost.toFixed(4) + ')';
      }

      diffTitleEl.textContent = 'เธฃเธฒเธขเธเธฒเธเธเธงเธฒเธกเธชเธกเนเธณเน€เธชเธกเธญเธเธญเธเธเธฅเธฑเธเธเธณ โ€” ' + (activeBook ? activeBook.title : proj.name);
      diffBody.textContent = fullReport;
      diffOverlay.classList.add('show');
    }catch(err){
      await showAlertDialog('เธ•เธฃเธงเธเธชเธญเธเนเธกเนเธชเธณเน€เธฃเนเธ', 'เน€เธเธดเธ”เธเนเธญเธเธดเธ”เธเธฅเธฒเธ”: ' + (err.message || ''));
    }finally{
      checkConsistencyBtn.disabled = false;
      progressText.textContent = '';
    }
  });
