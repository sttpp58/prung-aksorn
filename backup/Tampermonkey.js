// ==UserScript==
// @name         ปรุงอักษร x HostedNovel (Full Edition)
// @namespace    prung-aksorn
// @version      2.3
// @description  ส่งนิยายจาก HostedNovel เข้าแอปปรุงอักษร คลีนชื่อตอน คลีนเนื้อหา แปลอัตโนมัติ ไม่เปิดแท็บซ้ำ
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

    // กำหนด URL ของแอปปรุงอักษร (GitHub Pages เป็นหลัก)
    const APP_URL = 'https://sttpp58.github.io/prung-aksorn/';
    const IS_HOSTED_NOVEL = window.location.hostname.includes('hostednovel.com');

    /* ==========================================================
       ฝั่งที่ 1: ทำงานบน HostedNovel.com
       ========================================================== */
    if (IS_HOSTED_NOVEL) {
        // ทำงานเฉพาะหน้าตอนนิยายที่มี /chapter- ใน URL
        if (!window.location.pathname.includes('/chapter-')) return;

        // 1. สร้างปุ่มลอยสีแดงหรูหราที่มุมขวาล่าง
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
            // 2. ดึงชื่อตอนและคลีนชื่อเรื่อง/ลิงก์ breadcrumb ด้านหน้าออก
            let title = '';
            const h1 = document.querySelector('h1');
            if (h1) {
                const cloneH1 = h1.cloneNode(true);
                // ลบแท็ก <a> หรือ breadcrumbs ที่มีชื่อเรื่อง "Chaotic Sword God" ออก
                const removeElements = cloneH1.querySelectorAll('a, .breadcrumb, span.text-gray-500, .text-muted');
                removeElements.forEach(el => el.remove());
                title = cloneH1.innerText.trim();
                if (!title) title = h1.innerText.trim();
            } else {
                title = document.title.split('|')[0].trim();
            }

            // แยกคำกรณีข้อความติดกัน เช่น "GodChapter 3391" -> "God Chapter 3391"
            title = title.replace(/([a-zA-Z])(Chapter\s*\d+)/i, '$1 $2').trim();

            // 3. ดึงเนื้อหาตอนและคัดกรองขยะหน้าเว็บ
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
                // ตัดข้อความนำทาง ลายน้ำ และลิงก์โฆษณา
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

            // 4. ตรวจสอบว่าแอปปรุงอักษรเปิดอยู่แล้วหรือไม่ (Heartbeat Detection)
            const lastHeartbeat = GM_getValue('prung_app_heartbeat', 0);
            const isAppAlreadyOpen = (Date.now() - lastHeartbeat < 4000);

            // 5. บันทึกข้อมูลเข้า Storage กลาง
            GM_setValue('incoming_payload', {
                title: title,
                content: fullContent,
                autoTranslate: true,
                timestamp: Date.now()
            });

            if (isAppAlreadyOpen) {
                // ส่งเข้าแท็บเดิมเงียบๆ ไม่เด้งแท็บใหม่
                btn.innerHTML = '✅ ส่งเข้าแท็บเดิมแล้ว!';
                btn.style.background = '#2E5C34';
                btn.style.borderColor = '#81C784';
            } else {
                // ยังไม่เคยเปิดแท็บแอป ให้เปิดแท็บขึ้นมาใหม่
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
       ฝั่งที่ 2: ทำงานบนแอป ปรุงอักษร (GitHub Pages หรือ Local File)
       ========================================================== */
    else {
        // ส่งสัญญาณบอกเบราว์เซอร์ตลอดเวลาว่า "ฉันเปิดอยู่นะ อย่าเปิดแท็บใหม่" (ทุก 2 วินาที)
        function sendHeartbeat() {
            GM_setValue('prung_app_heartbeat', Date.now());
        }
        sendHeartbeat();
        setInterval(sendHeartbeat, 2000);

        window.addEventListener('beforeunload', () => {
            GM_setValue('prung_app_heartbeat', 0);
        });

        // ฟังก์ชันส่งต่อข้อความเข้าสู่ตัวแอป
        function processPayload(payload) {
            if (!payload) return;
            if (Date.now() - payload.timestamp < 60000) { // ภายใน 60 วินาที
                window.postMessage({
                    type: 'PRUNG_INGEST',
                    title: payload.title,
                    content: payload.content,
                    autoStart: payload.autoTranslate
                }, '*');
                GM_setValue('incoming_payload', null); // ล้างค่าทิ้งเพื่อไม่ให้รันซ้ำ
            }
        }

        // ดักฟังสัญญาณ Real-time ทันทีที่กดส่งมาจาก HostedNovel
        GM_addValueChangeListener('incoming_payload', function(key, oldValue, newValue, remote) {
            if (newValue) {
                setTimeout(() => processPayload(newValue), 150);
            }
        });

        // ตรวจสอบข้อมูลเผื่อกรณีเปิดแท็บใหม่ขึ้นมา
        setTimeout(() => {
            const initialPayload = GM_getValue('incoming_payload', null);
            if (initialPayload) processPayload(initialPayload);
        }, 500);
    }
})();
