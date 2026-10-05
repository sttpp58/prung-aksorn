#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(import.meta.url);

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function pass(message) {
  console.log('PASS  ' + message);
}

function check(condition, message) {
  assert.ok(condition, message);
  pass(message);
}

const uiSource = read('tqg-ui.js');
const indexSource = read('index.html');
const swSource = read('sw.js');

new vm.Script(uiSource, { filename: 'tqg-ui.js' });
check(/TQG-07-2026-09-30/.test(uiSource), 'UI module version is TQG-07');
check(!/[\u{1F000}-\u{1FAFF}]/u.test(uiSource), 'TQG UI source contains no emoji');
check(/createElementNS\(['"]http:\/\/www\.w3\.org\/2000\/svg['"]/.test(uiSource), 'UI icons use SVG vector primitives');

const TQGQualityUI = requireFromRoot(path.join(ROOT, 'tqg-ui.js'));
check(TQGQualityUI && typeof TQGQualityUI.render === 'function', 'render API exists');
check(typeof TQGQualityUI.buildViewModel === 'function', 'view-model API exists');
check(typeof TQGQualityUI.bindToggle === 'function', 'toggle API exists');

const clean = TQGQualityUI.buildViewModel({
  analysis: { status: 'PASS', findings: [], exceptionsApplied: [], suppressedFindings: [] }
});
check(clean.status === 'PASS', 'PASS analysis maps to PASS UI state');
check(clean.findings.length === 0, 'clean analysis has no UI findings');

const suspicious = TQGQualityUI.buildViewModel({
  analysis: {
    status: 'HIGH_SUSPICION',
    findings: [{
      code: 'SOURCE_LANGUAGE_RESIDUE', severity: 'high', text: 'walked inside',
      start: 10, end: 23, evidence: { matchType: 'exact-normalized-token-overlap' }
    }],
    exceptionsApplied: [],
    suppressedFindings: []
  },
  inspection: {
    status: 'COMPLETED',
    verdict: 'TRUE_ANOMALY',
    repairable: true,
    reason: 'Localized source residue.',
    replacementHint: 'localized repair'
  },
  repair: {
    status: 'ACCEPTED',
    accepted: true,
    replacementText: 'เดินเข้าไปข้างใน',
    validation: { valid: true, reason: 'repair-passed-revalidation' }
  }
});
check(suspicious.status === 'HIGH_SUSPICION', 'HIGH_SUSPICION maps to high-risk UI state');
check(suspicious.findings.length === 1, 'finding data is preserved for UI');
check(suspicious.inspection.verdict === 'TRUE_ANOMALY', 'AI verdict is exposed to UI');
check(suspicious.repair.validation.valid === true, 're-validation result is exposed to UI');

const exceptionCase = TQGQualityUI.buildViewModel({
  analysis: {
    status: 'PASS',
    findings: [],
    exceptionsApplied: [{
      type: 'known_term', text: 'Wi-Fi', findingCode: 'FOREIGN_SCRIPT_SPAN',
      start: 16, end: 21, reason: 'recognized-technical-token'
    }],
    suppressedFindings: [{
      code: 'FOREIGN_SCRIPT_SPAN', text: 'Wi-Fi', start: 16, end: 21,
      exception: { type: 'known_term' }
    }]
  }
});
check(exceptionCase.exceptionsApplied.length === 1, 'applicable exception metadata is available');
check(exceptionCase.suppressedFindings.length === 1, 'suppressed finding metadata is available');

check(indexSource.includes('id="tqgQualityPanel"'), 'dedicated TQG quality panel is present');
check(indexSource.includes('id="tqgQualityToggleBtn"'), 'dedicated TQG toggle is present');
const toggleMatch = indexSource.match(/<button[^>]*id="tqgQualityToggleBtn"[^>]*>[\s\S]*?<\/button>/i);
check(toggleMatch && /<svg\b/.test(toggleMatch[0]), 'TQG toggle uses inline SVG icon');
check(toggleMatch && !/[\u{1F000}-\u{1FAFF}]/u.test(toggleMatch[0]), 'TQG toggle introduces no emoji control');

const uiForbidden = [
  'localStorage', 'indexedDB', 'fetch(', 'XMLHttpRequest',
  'callOpenAI(', 'callGemini(', 'runTranslation(',
  'checkpointTranslationJob(', 'updateTranslationJob('
];
for (const token of uiForbidden) {
  check(!uiSource.includes(token), 'TQG UI has no forbidden coupling: ' + token);
}

check(/tqg-ui\.js/.test(indexSource), 'index.html loads tqg-ui.js');
check(/\.\/tqg-ui\.js/.test(swSource), 'Service Worker app shell includes tqg-ui.js');
check(/APP_RELEASE_VERSION\s*=\s*['"]v\d+['"]/.test(swSource), 'Service Worker declares a versioned release marker for TQG runtime assets');

console.log('');
console.log('TQG-07 Quality UI Regression: PASS');
