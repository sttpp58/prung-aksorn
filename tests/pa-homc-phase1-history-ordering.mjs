import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const historySource = fs.readFileSync('app/01-shell-context-history.js', 'utf8');
const storageSource = fs.readFileSync('app/03-storage-settings.js', 'utf8');
const storageAdapterSource = fs.readFileSync('storage-v2.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');

function pass(message) {
  console.log(`PASS  ${message}`);
}

const start = historySource.indexOf('function moveHistoryArrayEntry(');
const end = historySource.indexOf('\n  async function moveHistoryEntry(', start);
assert(start >= 0 && end > start, 'pure history-order helper exists');
const helperSource = historySource.slice(start, end);
const sandbox = {};
vm.runInNewContext(helperSource + '\nglobalThis.moveHistoryArrayEntry = moveHistoryArrayEntry;', sandbox);
const move = sandbox.moveHistoryArrayEntry;

const a = { id: 'a', ts: 10, label: 'Chapter 1', input: 'src-a', output: 'out-a' };
const b = { id: 'b', ts: 20, label: 'Chapter 5', input: 'src-b', output: 'out-b', parentId: 'a' };
const c = { id: 'c', ts: 15, label: 'Chapter 3', input: 'src-c', output: 'out-c' };
const entries = [a, b, c];
const previous = move(entries, 'c', 1);
assert.deepEqual(entries.map((entry) => entry.id), ['a', 'c', 'b'], 'move places an entry at the requested reading index');
assert.deepEqual(previous.map((entry) => entry.id), ['a', 'b', 'c'], 'move returns the prior order for rollback');
assert.equal(entries[2], b, 'entry object identity is preserved');
assert.equal(b.ts, 20, 'translation timestamp is unchanged');
assert.equal(b.label, 'Chapter 5', 'stored label is unchanged');
assert.equal(b.input, 'src-b', 'source input is unchanged');
assert.equal(b.output, 'out-b', 'translated output is unchanged');
assert.equal(b.parentId, 'a', 'parent reference is unchanged');
pass('history reorder preserves stable entry objects and fields');

const storageSandbox = { window: {}, console, TextEncoder, Uint8Array };
vm.runInNewContext(storageAdapterSource, storageSandbox);
const normalized = storageSandbox.window.PrungAksornStorageV2.buildNormalized({
  projects: [{ id: 'p', name: 'Project', books: [{ id: 'book-1', title: 'Book', history: [a, c, b] }] }],
  currentProjectId: 'p'
});
assert.deepEqual(JSON.parse(JSON.stringify(normalized.chapters.map((chapter) => [chapter.id, chapter.chapterNumber]))), [['a', 1], ['c', 2], ['b', 3]], 'storage normalization persists array order as chapterNumber');
assert.equal(normalized.chapters.find((chapter) => chapter.id === 'b').parentId, 'a', 'storage normalization retains parent reference');
assert(storageAdapterSource.includes("n.chapters.slice().sort(function(a,b){return String(a.bookId).localeCompare(String(b.bookId))||Number(a.chapterNumber||0)-Number(b.chapterNumber||0);})"), 'hydration reconstructs history from persisted chapterNumber');
pass('existing storage normalization and hydration map custom array order without a schema change');

const unchanged = entries.slice();
assert.equal(move(entries, 'missing', 0), null, 'unknown ID is rejected');
assert.equal(move(entries, 'c', 99), null, 'out-of-range destination is rejected');
assert.equal(move(entries, 'c', 1), null, 'no-op destination is rejected');
assert.deepEqual(entries.map((entry) => entry.id), unchanged.map((entry) => entry.id), 'invalid moves do not mutate the array');
pass('invalid reorder requests are non-mutating');

assert(historySource.includes('item.draggable = !!activeBook && !(bottomHistorySearchInput && bottomHistorySearchInput.value.trim())'), 'drag-and-drop is disabled without an active book or while search is active');
assert(historySource.includes("orderPosition.textContent = (idx + 1) + '/' + historyList.length"), 'history list shows an explicit position for each entry');
assert(historySource.includes('button.disabled = !!term'), 'move buttons are disabled for filtered history');
assert(historySource.includes("['pending','running','paused','failed']"), 'reordering is guarded while Batch recovery may still run');
assert(historySource.includes('saved = await flushSaveData()'), 'reorder awaits the existing persistence flush');
assert(historySource.includes('history.splice.apply(history, [0, history.length].concat(previousOrder))'), 'failed persistence restores the in-memory order');
assert(html.includes('id="bottomHistorySearchInput"'), 'history search control remains present');
assert(css.includes('.history-order-btn:disabled'), 'order controls have disabled-state styling');
assert(storageSource.includes('async function flushSaveData()'), 'existing async save flush remains the persistence mechanism');
pass('history ordering UI, search, Batch recovery and persistence guards are present');

console.log('PA-HOMC Phase 1 History Ordering Regression: PASS');
