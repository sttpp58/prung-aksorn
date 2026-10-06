#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function check(condition, message) {
  assert.ok(condition, message);
  console.log('PASS  ' + message);
}

const index = read('index.html');
const styles = read('styles.css');
const storageSettings = read('app/03-storage-settings.js');
const modelUi = read('app/09-editor-draft.js');
const aiRuntime = read('app/11-ai-providers-recovery-state.js');
const e2e = read('tests/e2e/browser-real-user-scenario.mjs');

try {
  new vm.Script(modelUi, { filename: 'app/09-editor-draft.js' });
  new vm.Script(storageSettings, { filename: 'app/03-storage-settings.js' });
  new vm.Script(aiRuntime, { filename: 'app/11-ai-providers-recovery-state.js' });
  check(true, 'Model Catalog runtime modules remain syntactically valid');

  check(/id="modelPicker"/.test(index), 'Model picker host is present');
  check(/id="modelPickerTrigger"/.test(index), 'Model picker trigger is present');
  check(/id="modelPickerList"[^>]*role="listbox"/.test(index), 'Model picker exposes an accessible listbox');
  check(/id="modelPickerAddBtn"/.test(index), 'Custom model add action is present');
  check(/id="modelPickerAddInput"[^>]*maxlength="160"/.test(index), 'Custom model input has a bounded length');
  check(/type="hidden" id="model"/.test(index), 'Legacy #model field remains as a hidden runtime contract');
  check(!/<input\s+type="text"\s+id="model"/.test(index), 'Visible model free-text input is removed');

  check(/\.model-picker-menu/.test(styles), 'Model picker menu styling is present');
  check(/\.model-picker-list\{max-height:/.test(styles), 'Model picker list has a bounded scroll region');
  check(/\.model-field,\.model-picker\{width:100%;min-width:0;\}/.test(styles), 'Model picker has responsive mobile width');
  check(/\.model-picker-trigger:disabled/.test(styles), 'Model picker has a disabled visual state');
  check(/\.model-picker-add-form\[hidden\]/.test(styles), 'Add-model form supports hidden state');

  check(/var AI_MODEL_OPTIONS = \{[\s\S]*openai:[\s\S]*gemini:/.test(modelUi), 'Built-in model catalog is provider-aware');
  check(/AI_MODEL_DEFAULTS = \{ openai:'gpt-4o-mini', gemini:'gemini-flash-latest' \}/.test(modelUi), 'Provider defaults are explicitly defined');
  check(/function normalizeCustomModelList\(/.test(modelUi), 'Custom model storage normalizes legacy/custom entries');
  check(/function getCustomModelStore\(/.test(modelUi), 'Custom model store is isolated by provider');
  check(/function getSelectedModelStore\(/.test(modelUi), 'Selected model memory is isolated by provider');
  check(/selected\[previousProvider\] = currentModel/.test(modelUi), 'Provider switching remembers the previous model');
  check(/selected\[nextProvider\] \|\| AI_MODEL_DEFAULTS\[nextProvider\]/.test(modelUi), 'Provider switching restores the saved model or default');
  check(/function addCustomModel\(/.test(modelUi), 'Custom model add workflow exists');
  check(/getCustomModelStore\(\)\[provider\]\.push\(\{ id: next \}\)/.test(modelUi), 'Custom models are persisted as provider-scoped entries');
  check(/Model ID ต้องไม่มีช่องว่างหรืออักขระควบคุม/.test(modelUi), 'Custom model input rejects whitespace/control characters');
  check(/function renderModelPicker\(/.test(modelUi), 'Model picker rendering is centralized');
  check(/function setModelPickerDisabled\(/.test(modelUi), 'Model picker has explicit busy-state locking');
  check(/showConfirmDialog\([\s\S]*ลบโมเดลที่เพิ่มเอง/.test(modelUi), 'Custom model deletion is protected by confirmation');

  check(/customModels: customModels/.test(storageSettings), 'Settings persistence retains custom models');
  check(/selectedModels: selectedModels/.test(storageSettings), 'Settings persistence retains per-provider model selection');
  check(/ensureModelCatalogSettings\(s\.model\)/.test(storageSettings), 'Settings application preserves legacy/current model selection');
  check(/activeModelProvider = provider/.test(storageSettings), 'Settings restore synchronizes provider/model picker state');
  check(/renderModelPicker\(\)/.test(storageSettings), 'Settings restore refreshes the visible model picker');

  check(/setModelPickerDisabled\(busy\)/.test(aiRuntime), 'AI busy state locks the visible model picker');
  check(/modelInput\.disabled = busy/.test(aiRuntime), 'AI busy state preserves the legacy model runtime lock');

  const runtimeConsumerFiles = [
    'app/02-translation-recovery.js',
    'app/07-glossary.js',
    'app/08-tqg-controller.js',
    'app/12-translation-core.js',
    'app/13-batch.js',
    'app/14-export.js',
    'app/16-book-tools.js',
    'app/18-ingestion.js'
  ];
  for (const file of runtimeConsumerFiles) {
    const source = read(file);
    check(source.includes('modelInput.value'), file + ' continues to consume the stable model runtime value');
  }

  check(/modelPickerTrigger/.test(e2e), 'Browser E2E covers the Model Catalog UI');
  check(/modelPickerAddInput/.test(e2e), 'Browser E2E covers adding a custom model');
  check(/selectedModels/.test(e2e), 'Browser E2E covers provider-scoped model persistence');

  console.log('');
  console.log('Model Catalog Regression: PASS');
} catch (error) {
  console.error('');
  console.error('Model Catalog Regression: FAIL — ' + (error.stack || error.message || error));
  process.exitCode = 1;
}
