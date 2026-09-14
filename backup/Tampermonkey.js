// ==UserScript==
// @name         ปรุงอักษร x HostedNovel (Zero-Config)
// @namespace    prung-aksorn
// @version      2.0
// @description  ส่งนิยายจาก HostedNovel เข้า https://sttpp58.github.io/prung-aksorn/ อัตโนมัติใน 1 คลิก
// @author       Prung Aksorn
// @match        https://hostednovel.com/novel/*
// @match        https://sttpp58.github.io/prung-aksorn/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_openInTab
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const APP_URL = 'https://sttpp58.github.io/prung-aksorn/';
    const IS_HOSTED_NOVEL = window.location.hostname.includes('hostednovel.com');

    /* ==========================================================
       ฝั่งที่ 1: ทำงานบน HostedNovel.com
       ========================================================== */
    if (IS_HOSTED_NOVEL) {
        if (!window.location.pathname.includes('/chapter-')) return;

        // สร้างปุ่มลอย
        const btn = document.createElement('button');
        btn.id = 'prung-aksorn-btn';
        btn.innerHTML = '✒️ ส่งไปปรุงอักษร';
        btn.style.cssText = `
            position: fixed;
            bottom: 25px;
            right: 25px;
            z-index: 999999;
            background: #9F3A38;
            color: #FFFFFF;
            border: 2px solid #DDBD85;
            border-radius: 30px;
            padding: 12px 24px;
            font-size: 15px;
            font-weight: bold;
            font-family: 'Sarabun', system-ui, sans-serif;
            cursor: pointer;
            box-shadow: 0 6px 20px rgba(0,0,0,0.35);
            transition: all 0.25s ease;
        `;
        btn.onmouseover = () => { btn.style.transform = 'scale(1.06) translateY(-2px)'; btn.style.background = '#832F2D'; };
        btn.onmouseout = () => { btn.style.transform = 'scale(1) translateY(0)'; btn.style.background = '#9F3A38'; };

        btn.onclick = function() {
            // ดึงชื่อตอน
            let title = '';
            const h1 = document.querySelector('h1');
            if (h1) title = h1.innerText.trim();
            else title = document.title.split('|')[0].trim();

            // ดึงเนื้อหาตอน
            const contentContainer = document.querySelector('#chapter-content') ||
                                     document.querySelector('.chapter-content') ||
                                     document.querySelector('.prose') ||
                                     document.querySelector('article');

            if (!contentContainer) {
                alert('ไม่พบกล่องเนื้อหานิยายในหน้านี้');
                return;
            }

            const paragraphs = contentContainer.querySelectorAll('p');
            let contentList = [];

            paragraphs.forEach(p => {
                let text = p.innerText.trim();
                if (!text) return;
                if (/hostednovel\.com/i.test(text)) return;
                if (/^(previous chapter|next chapter|table of contents)$/i.test(text)) return;
                if (/support us on patreon/i.test(text)) return;
                contentList.push(text);
            });

            const fullContent = contentList.join('\n\n');
            if (!fullContent) {
                alert('เนื้อหาว่างเปล่า หรือดึงเนื้อหาไม่สำเร็จ');
                return;
            }

            // ส่งข้อมูลเข้า Storage ของ Tampermonkey
            GM_setValue('incoming_payload', {
                title: title,
                content: fullContent,
                autoTranslate: true,
                timestamp: Date.now()
            });

            btn.innerHTML = '🚀 กำลังส่งข้อมูล...';
            btn.style.background = '#8C6F2E';

            // เปิด/สลับไปแท็บ GitHub Pages
            GM_openInTab(APP_URL, { active: true });

            setTimeout(() => {
                btn.innerHTML = '✒️ ส่งไปปรุงอักษร';
                btn.style.background = '#9F3A38';
            }, 3000);
        };

        document.body.appendChild(btn);
    }

    /* ==========================================================
       ฝั่งที่ 2: ทำงานบน GitHub Pages (sttpp58.github.io)
       ========================================================== */
    else {
        function processPayload(payload) {
            if (!payload) return;
            if (Date.now() - payload.timestamp < 45000) {
                window.postMessage({
                    type: 'PRUNG_INGEST',
                    title: payload.title,
                    content: payload.content,
                    autoStart: payload.autoTranslate
                }, '*');
                GM_setValue('incoming_payload', null);
            }
        }

        // กรณีเปิดแท็บใหม่
        setTimeout(() => {
            const initialPayload = GM_getValue('incoming_payload', null);
            if (initialPayload) processPayload(initialPayload);
        }, 700);

        // กรณีเปิดแท็บค้างไว้อยู่แล้ว (Real-time Transfer)
        GM_addValueChangeListener('incoming_payload', function(key, oldValue, newValue, remote) {
            if (newValue) {
                setTimeout(() => processPayload(newValue), 300);
            }
        });
    }
})();