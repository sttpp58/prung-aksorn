// ==UserScript==
// @name         ปรุงอักษร x HostedNovel (Smart No-Duplicate Tab)
// @namespace    prung-aksorn
// @version      2.2
// @description  ส่งนิยายเข้าแท็บปรุงอักษรที่เปิดอยู่แล้วทันที ไม่เด้งแท็บใหม่ซ้ำซ้อน
// @author       Prung Aksorn
// @match        https://hostednovel.com/novel/*
// @match        https://sttpp58.github.io/prung-aksorn/*
// @match        file:///*index_appDB_V2.html*
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
        btn.onmouseover = () => { btn.style.transform = 'scale(1.06) translateY(-2px)'; };
        btn.onmouseout = () => { btn.style.transform = 'scale(1) translateY(0)'; };

        btn.onclick = function() {
            let title = '';
            const h1 = document.querySelector('h1');
            if (h1) title = h1.innerText.trim();
            else title = document.title.split('|')[0].trim();

            const contentContainer = document.querySelector('#chapter-content') ||
                                     document.querySelector('.chapter-content') ||
                                     document.querySelector('.prose') ||
                                     document.querySelector('article');

            if (!contentContainer) {
                alert('ไม่พบเนื้อหาในหน้านี้');
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
                alert('เนื้อหาว่างเปล่า');
                return;
            }

            // ตรวจสอบสัญญาณว่ามีแท็บแอปปรุงอักษรเปิดค้างอยู่หรือไม่ (Heartbeat Check)
            const lastHeartbeat = GM_getValue('prung_app_heartbeat', 0);
            const isAppAlreadyOpen = (Date.now() - lastHeartbeat < 4000); // ส่งสัญญาณมาไม่เกิน 4 วินาที

            // ส่งข้อมูลเข้า Storage กลาง
            GM_setValue('incoming_payload', {
                title: title,
                content: fullContent,
                autoTranslate: true,
                timestamp: Date.now()
            });

            if (isAppAlreadyOpen) {
                // กรณีมีแท็บเดิมเปิดอยู่: ส่งเข้าแท็บเดิม ไม่เปิดแท็บใหม่เด็ดขาด
                btn.innerHTML = '✅ ส่งไปแปลในแท็บเดิมแล้ว!';
                btn.style.background = '#2E5C34'; // สีเขียว
                btn.style.borderColor = '#81C784';
            } else {
                // กรณีไม่มีแท็บเปิดอยู่เลย: จึงเปิดแท็บให้
                btn.innerHTML = '🚀 กำลังเปิดแอปปรุงอักษร...';
                btn.style.background = '#8C6F2E';
                GM_openInTab(APP_URL, { active: true });
            }

            setTimeout(() => {
                btn.innerHTML = '✒️ ส่งไปปรุงอักษร';
                btn.style.background = '#9F3A38';
                btn.style.borderColor = '#DDBD85';
            }, 3000);
        };

        document.body.appendChild(btn);
    }

    /* ==========================================================
       ฝั่งที่ 2: ทำงานบนหน้าแอป ปรุงอักษร (GitHub Pages หรือ Local)
       ========================================================== */
    else {
        // ส่งสัญญาณบอกเบราว์เซอร์ตลอดเวลาว่า "ฉันเปิดอยู่นะ อย่าเปิดแท็บใหม่" (Heartbeat ทุก 2 วินาที)
        function sendHeartbeat() {
            GM_setValue('prung_app_heartbeat', Date.now());
        }
        sendHeartbeat();
        setInterval(sendHeartbeat, 2000);

        // เมื่อปิดแท็บ ให้รีเซ็ตค่าทันที
        window.addEventListener('beforeunload', () => {
            GM_setValue('prung_app_heartbeat', 0);
        });

        // ฟังก์ชันประมวลผลข้อมูลที่ส่งเข้ามา
        function processPayload(payload) {
            if (!payload) return;
            if (Date.now() - payload.timestamp < 60000) {
                window.postMessage({
                    type: 'PRUNG_INGEST',
                    title: payload.title,
                    content: payload.content,
                    autoStart: payload.autoTranslate
                }, '*');
                GM_setValue('incoming_payload', null); // เคลียร์เพื่อไม่ให้รับซ้ำ
            }
        }

        // ดักฟังสัญญาณ Real-time เมื่อกดส่งจาก HostedNovel
        GM_addValueChangeListener('incoming_payload', function(key, oldValue, newValue, remote) {
            if (newValue) {
                setTimeout(() => processPayload(newValue), 150);
            }
        });

        // ตรวจสอบข้อมูลเผื่อกรณีเพิ่งเปิดหน้าเว็บขึ้นมา
        setTimeout(() => {
            const initialPayload = GM_getValue('incoming_payload', null);
            if (initialPayload) processPayload(initialPayload);
        }, 500);
    }
})();
