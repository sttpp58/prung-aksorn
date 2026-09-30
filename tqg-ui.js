/*
 * TQG V1 — Quality UI (TQG-07)
 *
 * Non-destructive presentation layer for TQG analysis, inspection,
 * targeted-repair, and re-validation results.
 * No translation, storage, provider, or checkpoint behavior lives here.
 */
(function initTQGQualityUI(global) {
  'use strict';

  const STATUS_META = Object.freeze({
    PASS: { label: 'ผ่าน', className: 'pass', icon: 'check', detail: 'ไม่พบ active finding จาก TQG' },
    REVIEW: { label: 'ควรตรวจสอบ', className: 'review', icon: 'search', detail: 'พบสัญญาณที่ควรตรวจสอบเพิ่มเติม' },
    HIGH_SUSPICION: { label: 'น่าสงสัยสูง', className: 'high', icon: 'alert', detail: 'พบหลักฐานที่มีความเสี่ยงสูง' },
    UNKNOWN: { label: 'ยังไม่ได้ตรวจ', className: 'neutral', icon: 'shield', detail: 'ยังไม่มีผลการวิเคราะห์ TQG' }
  });

  const INSPECTION_META = Object.freeze({
    NOT_REQUIRED: { label: 'ยังไม่ต้องใช้ AI Inspector', className: 'neutral' },
    COMPLETED: { label: 'ตรวจด้วย AI แล้ว', className: 'pass' },
    ERROR: { label: 'AI Inspector ผิดพลาด', className: 'high' },
    UNKNOWN: { label: 'ยังไม่ตรวจด้วย AI', className: 'neutral' }
  });

  const REPAIR_META = Object.freeze({
    ACCEPTED: { label: 'ซ่อมผ่านการตรวจซ้ำ', className: 'pass', icon: 'check' },
    REJECTED: { label: 'ปฏิเสธการซ่อม', className: 'review', icon: 'close' },
    ERROR: { label: 'การซ่อมผิดพลาด', className: 'high', icon: 'alert' },
    UNKNOWN: { label: 'ยังไม่ได้ซ่อม', className: 'neutral', icon: 'wrench' }
  });

  function text(value) {
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }

  function clampList(value, max) {
    return (Array.isArray(value) ? value : []).slice(0, max);
  }

  function clip(value, max) {
    const source = text(value);
    if (source.length <= max) return source;
    return source.slice(0, Math.max(0, max - 3)) + '...';
  }

  function statusMeta(status, table) {
    return table[status] || table.UNKNOWN;
  }

  function formatEvidence(evidence) {
    if (!evidence || typeof evidence !== 'object') return '';
    const parts = [];
    if (evidence.reason) parts.push('เหตุผล: ' + text(evidence.reason));
    if (evidence.matchType) parts.push('หลักฐาน: ' + text(evidence.matchType));
    if (evidence.overlapEvidence) parts.push('พบหลักฐาน source overlap');
    if (evidence.sourceSentences != null && evidence.targetSentences != null) {
      parts.push('ประโยคต้นฉบับ/ผลลัพธ์: ' + evidence.sourceSentences + '/' + evidence.targetSentences);
    }
    if (evidence.lengthRatio != null) parts.push('อัตราส่วนความยาว: ' + Number(evidence.lengthRatio).toFixed(2));
    return parts.join(' · ');
  }

  function findExceptions(finding, exceptionsApplied) {
    const start = Number(finding && finding.start);
    const end = Number(finding && finding.end);
    return (Array.isArray(exceptionsApplied) ? exceptionsApplied : []).filter((item) => {
      if (!item || typeof item !== 'object') return false;
      if (text(item.findingCode) !== text(finding.code)) return false;
      const itemStart = Number(item.start);
      const itemEnd = Number(item.end);
      return Number.isFinite(start) && Number.isFinite(end) &&
        itemStart <= start && itemEnd >= end;
    });
  }

  function buildViewModel(input) {
    const analysis = input && input.analysis && typeof input.analysis === 'object'
      ? input.analysis : null;
    const inspection = input && input.inspection && typeof input.inspection === 'object'
      ? input.inspection : null;
    const repair = input && input.repair && typeof input.repair === 'object'
      ? input.repair : null;
    const status = analysis && text(analysis.status) ? text(analysis.status) : 'UNKNOWN';
    return {
      status,
      statusMeta: statusMeta(status, STATUS_META),
      findings: clampList(analysis && analysis.findings, 8),
      exceptionsApplied: clampList(analysis && analysis.exceptionsApplied, 16),
      suppressedFindings: clampList(analysis && analysis.suppressedFindings, 16),
      inspectionStatus: inspection ? text(inspection.status) || 'UNKNOWN' : 'UNKNOWN',
      inspection: inspection || null,
      repairStatus: repair ? text(repair.status) || 'UNKNOWN' : 'UNKNOWN',
      repair: repair || null
    };
  }

  function createElement(documentRef, tag, className, label) {
    const element = documentRef.createElement(tag);
    if (className) element.className = className;
    if (label != null) element.textContent = label;
    return element;
  }

  function createIcon(documentRef, name) {
    const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = documentRef.createElementNS('http://www.w3.org/2000/svg', 'path');
    const paths = {
      check: 'M20 6 9 17l-5-5',
      close: 'm6 6 12 12M18 6 6 18',
      search: 'm21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z',
      alert: 'M12 3 2.8 20h18.4L12 3Zm0 6v5m0 3h.01',
      shield: 'M12 3 5 6v5c0 4.4 2.9 8.3 7 10 4.1-1.7 7-5.6 7-10V6l-7-3Z',
      wrench: 'm14.7 6.3 3-3a6 6 0 0 0-7.6 7.5L4 17l3 3 6.2-6.1a6 6 0 0 0 7.5-7.6l-3 3-3-3Z'
    };
    path.setAttribute('d', paths[name] || paths.shield);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }

  function appendIconLabel(documentRef, parent, iconName, label) {
    const icon = createIcon(documentRef, iconName);
    const wrap = createElement(documentRef, 'span', 'tqg-icon-label');
    wrap.appendChild(icon);
    wrap.appendChild(createElement(documentRef, 'span', '', label));
    parent.appendChild(wrap);
  }

  function renderBadge(documentRef, meta, labelOverride) {
    const badge = createElement(documentRef, 'span', 'tqg-badge ' + meta.className);
    appendIconLabel(documentRef, badge, meta.icon || 'shield', labelOverride || meta.label);
    return badge;
  }

  function renderFinding(documentRef, finding, exceptionsApplied) {
    const item = createElement(documentRef, 'article', 'tqg-finding');
    const head = createElement(documentRef, 'div', 'tqg-finding-head');
    const code = createElement(documentRef, 'span', 'tqg-finding-code', text(finding.code));
    const severity = createElement(documentRef, 'span', 'tqg-severity ' + text(finding.severity), text(finding.severity));
    head.appendChild(code);
    head.appendChild(severity);
    item.appendChild(head);

    const span = createElement(documentRef, 'div', 'tqg-span');
    span.textContent = clip(finding.text, 320);
    item.appendChild(span);

    const evidence = formatEvidence(finding.evidence);
    if (evidence) item.appendChild(createElement(documentRef, 'div', 'tqg-evidence', evidence));

    const exceptions = findExceptions(finding, exceptionsApplied);
    if (exceptions.length) {
      const exceptionBox = createElement(documentRef, 'div', 'tqg-exception');
      const title = createElement(documentRef, 'strong', '', 'ข้อยกเว้นที่ใช้');
      exceptionBox.appendChild(title);
      exceptions.slice(0, 3).forEach((entry) => {
        const line = createElement(documentRef, 'div', '',
          text(entry.type) + ' — ' + text(entry.reason) + ' — ' + text(entry.text));
        exceptionBox.appendChild(line);
      });
      item.appendChild(exceptionBox);
    }
    return item;
  }

  function renderExceptions(documentRef, vm) {
    const section = createElement(documentRef, 'section', 'tqg-section');
    const head = createElement(documentRef, 'div', 'tqg-section-head');
    head.appendChild(createElement(documentRef, 'h4', '', 'Exceptions / Suppressed Findings'));
    section.appendChild(head);

    const entries = vm.suppressedFindings.length
      ? vm.suppressedFindings.slice(0, 8).map((item) => ({
        type: item.exception && item.exception.type,
        text: item.text,
        reason: item.exception && item.exception.reason,
        code: item.code
      }))
      : vm.exceptionsApplied.slice(0, 8).map((item) => ({
        type: item.type, text: item.text, reason: item.reason, code: item.findingCode
      }));
    head.appendChild(createElement(documentRef, 'span', 'tqg-count', String(entries.length)));
    entries.forEach((entry) => {
      const row = createElement(documentRef, 'div', 'tqg-exception');
      row.appendChild(createElement(documentRef, 'strong', '', text(entry.type || 'exception')));
      row.appendChild(createElement(documentRef, 'div', '', text(entry.code || '')));
      row.appendChild(createElement(documentRef, 'div', '', text(entry.reason || '')));
      row.appendChild(createElement(documentRef, 'div', '', clip(entry.text, 240)));
      section.appendChild(row);
    });
    return section;
  }

  function renderInspection(documentRef, vm, options) {
    const section = createElement(documentRef, 'section', 'tqg-section');
    const head = createElement(documentRef, 'div', 'tqg-section-head');
    head.appendChild(createElement(documentRef, 'h4', '', 'AI Inspector'));
    const meta = statusMeta(vm.inspectionStatus, INSPECTION_META);
    head.appendChild(createElement(documentRef, 'span', 'tqg-state ' + meta.className, meta.label));
    section.appendChild(head);
    if (vm.inspection) {
      section.appendChild(createElement(documentRef, 'div', 'tqg-detail',
        'ผล: ' + text(vm.inspection.verdict || 'UNCERTAIN')));
      if (vm.inspection.reason) section.appendChild(createElement(documentRef, 'div', 'tqg-detail', clip(vm.inspection.reason, 500)));
      if (vm.inspection.replacementHint) section.appendChild(createElement(documentRef, 'div', 'tqg-detail',
        'แนวทางซ่อม: ' + clip(vm.inspection.replacementHint, 500)));
    }

    if (options && typeof options.onInspect === 'function' &&
        vm.inspectionStatus === 'UNKNOWN' && vm.findings.length) {
      const button = createElement(documentRef, 'button', 'tqg-action-btn');
      button.type = 'button';
      appendIconLabel(documentRef, button, 'search', 'ตรวจด้วย AI Inspector');
      button.addEventListener('click', () => options.onInspect());
      section.appendChild(button);
    }
    return section;
  }

  function renderRepair(documentRef, vm, options) {
    const section = createElement(documentRef, 'section', 'tqg-section');
    const head = createElement(documentRef, 'div', 'tqg-section-head');
    head.appendChild(createElement(documentRef, 'h4', '', 'Targeted Repair'));
    const meta = statusMeta(vm.repairStatus, REPAIR_META);
    head.appendChild(renderBadge(documentRef, meta));
    section.appendChild(head);

    if (vm.repair) {
      if (vm.repair.reason) section.appendChild(createElement(documentRef, 'div', 'tqg-detail', clip(vm.repair.reason, 500)));
      if (vm.repair.replacementText) section.appendChild(createElement(documentRef, 'div', 'tqg-detail',
        'ข้อความแทนที่: ' + clip(vm.repair.replacementText, 320)));
      if (vm.repair.validation) {
        const validationLabel = vm.repair.validation.valid ? 'ผ่านการตรวจซ้ำ' : 'ไม่ผ่านการตรวจซ้ำ';
        section.appendChild(createElement(documentRef, 'div',
          'tqg-validation ' + (vm.repair.validation.valid ? 'valid' : 'invalid'), validationLabel));
        section.appendChild(createElement(documentRef, 'div', 'tqg-detail',
          'Re-validation: ' + text(vm.repair.validation.reason || 'ไม่ได้ระบุเหตุผล')));
      }
    }

    const confirmed = vm.inspectionStatus === 'COMPLETED' &&
      vm.inspection && vm.inspection.verdict === 'TRUE_ANOMALY' &&
      vm.inspection.repairable === true;
    if (options && typeof options.onRepair === 'function' && confirmed && !vm.repair) {
      const button = createElement(documentRef, 'button', 'tqg-action-btn primary');
      button.type = 'button';
      appendIconLabel(documentRef, button, 'wrench', 'ซ่อมเฉพาะช่วงที่พบ');
      button.addEventListener('click', () => options.onRepair());
      section.appendChild(button);
    } else if (!vm.repair && vm.findings.length) {
      const availability = confirmed
        ? 'พร้อมให้ผู้ใช้สั่งซ่อมเฉพาะช่วงที่พบ'
        : 'ยังไม่พร้อมซ่อม: ต้องมีผล Inspector = TRUE_ANOMALY และ repairable = true';
      section.appendChild(createElement(documentRef, 'div', 'tqg-detail', availability));
    }
    return section;
  }

  function render(root, input, options) {
    if (!root || !root.ownerDocument) throw new TypeError('TQG Quality UI requires a DOM root.');
    const documentRef = root.ownerDocument;
    const vm = buildViewModel(input || {});
    root.textContent = '';

    const panel = createElement(documentRef, 'div', 'tqg-quality-card');
    const header = createElement(documentRef, 'div', 'tqg-quality-head');
    const titleWrap = createElement(documentRef, 'div', 'tqg-quality-title');
    const title = createElement(documentRef, 'div', 'tqg-quality-title-text', 'TQG Quality Guard');
    const subtitle = createElement(documentRef, 'div', 'tqg-quality-subtitle', 'ตรวจผลลัพธ์แบบไม่แก้ไขโดยอัตโนมัติ');
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);
    header.appendChild(renderBadge(documentRef, vm.statusMeta));
    panel.appendChild(header);

    panel.appendChild(createElement(documentRef, 'div', 'tqg-quality-summary', vm.statusMeta.detail));

    if (vm.findings.length) {
      const section = createElement(documentRef, 'section', 'tqg-section');
      const head = createElement(documentRef, 'div', 'tqg-section-head');
      head.appendChild(createElement(documentRef, 'h4', '', 'Findings'));
      head.appendChild(createElement(documentRef, 'span', 'tqg-count', String(vm.findings.length)));
      section.appendChild(head);
      vm.findings.forEach((finding) => section.appendChild(renderFinding(documentRef, finding, vm.exceptionsApplied)));
      panel.appendChild(section);
    } else {
      panel.appendChild(createElement(documentRef, 'div', 'tqg-empty',
        vm.status === 'PASS' ? 'ไม่พบ active findings' : 'ยังไม่มีรายการ finding สำหรับแสดง'));
    }

    if (vm.suppressedFindings.length || vm.exceptionsApplied.length) {
      panel.appendChild(renderExceptions(documentRef, vm));
    }

    if (vm.findings.length) {
      panel.appendChild(renderInspection(documentRef, vm, options));
      panel.appendChild(renderRepair(documentRef, vm, options));
    }

    root.appendChild(panel);
    return vm;
  }

  function clear(root) {
    if (!root) return;
    root.textContent = '';
  }

  function mount(rootOrId, input, options) {
    const root = typeof rootOrId === 'string'
      ? global.document && global.document.getElementById(rootOrId)
      : rootOrId;
    if (!root) throw new Error('TQG Quality UI root not found.');
    return render(root, input || {}, options || {});
  }

  function bindToggle(button, panel) {
    if (!button || !panel) throw new TypeError('TQG Quality UI toggle requires button and panel.');
    button.addEventListener('click', () => {
      const nextOpen = panel.hasAttribute('hidden');
      if (nextOpen) panel.removeAttribute('hidden');
      else panel.setAttribute('hidden', '');
      button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    });
    button.setAttribute('aria-expanded', panel.hasAttribute('hidden') ? 'false' : 'true');
  }

  const TQGQualityUI = Object.freeze({
    version: 'TQG-07-2026-09-30',
    STATUS_META,
    INSPECTION_META,
    REPAIR_META,
    buildViewModel,
    render,
    clear,
    mount,
    bindToggle
  });

  global.TQGQualityUI = TQGQualityUI;
  if (typeof module === 'object' && module.exports) module.exports = TQGQualityUI;
})(typeof globalThis !== 'undefined' ? globalThis : this);
