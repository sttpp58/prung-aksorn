import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const providerSource = fs.readFileSync(path.join(root, 'app/05-dialog-ai-core.js'), 'utf8');
const chunkSource = fs.readFileSync(path.join(root, 'app/10-ocr-chunking.js'), 'utf8');
const translationSource = fs.readFileSync(path.join(root, 'app/12-translation-core.js'), 'utf8');

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, 'source section exists: ' + startMarker);
  return source.slice(start, end);
}

const metadataCode = section(
  providerSource,
  '  async function buildTranslationChunkMetadata(',
  '  function findTranslationChunkSplit('
);
const splitterCode = section(
  chunkSource,
  '  function splitIntoChunksV1(',
  '  function showError('
);
const editMagnitudeCode = section(
  translationSource,
  '  function assessSurgicalEditMagnitude(',
  '  function hideSurgicalGlossaryUndo()'
);
const editMagnitudeSandbox = {};
vm.runInNewContext(editMagnitudeCode, editMagnitudeSandbox, {
  filename: 'fix-then-ship-edit-magnitude-extract.js'
});

const sandbox = {
  Intl,
  TextEncoder,
  Uint8Array,
  window: { crypto: webcrypto }
};
vm.runInNewContext(metadataCode + '\n' + splitterCode, sandbox, {
  filename: 'fix-then-ship-contract-extract.js'
});

let assertions = 0;
function check(condition, message) {
  assert.ok(condition, message);
  assertions += 1;
  console.log('PASS', message);
}

function sameJson(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

async function main() {
  for (const fixture of [
    { text: 'First sentence. Second sentence. Third sentence.', size: 12 },
    { text: 'alpha beta gamma delta epsilon', size: 10 },
    { text: 'ภาษาไทย ไม่มีวรรคตอนต่อท้ายแล้วทดสอบ', size: 9 },
    { text: 'paragraph one\n\nparagraph two\n\nparagraph three', size: 18 }
  ]) {
    check(
      sameJson(sandbox.splitIntoChunks(fixture.text, fixture.size),
        sandbox.splitIntoChunksV1(fixture.text, fixture.size)),
      'the default splitter remains a V1 compatibility wrapper (' + fixture.size + ')'
    );
  }

  const thai = 'ภาษาไทยไม่มีช่องว่างระหว่างคำสำหรับทดสอบ'.repeat(45);
  const thaiChunks = sandbox.splitIntoChunksForVersion(thai, 180, 'v2');
  check(thaiChunks.length > 1, 'V2 splits an oversized Thai paragraph');
  check(thaiChunks.every(chunk => chunk.length <= 180), 'V2 respects the configured limit for this Thai corpus');
  check(thaiChunks.join('') === thai, 'V2 preserves every character in an oversized no-space Thai paragraph');
  const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
  const validThaiBoundaries = new Set([0, thai.length]);
  for (const segment of segmenter.segment(thai)) {
    validThaiBoundaries.add(segment.index);
    validThaiBoundaries.add(segment.index + segment.segment.length);
  }
  let offset = 0;
  let allBoundariesAreThaiSegments = true;
  for (let index = 0; index < thaiChunks.length - 1; index += 1) {
    offset += thaiChunks[index].length;
    if (!validThaiBoundaries.has(offset)) allBoundariesAreThaiSegments = false;
  }
  check(allBoundariesAreThaiSegments, 'V2 no-space Thai cuts fall on Intl.Segmenter boundaries');

  const sentences = 'First sentence. Second sentence. Third sentence follows.';
  const sentenceChunks = sandbox.splitIntoChunksForVersion(sentences, 22, 'v2');
  check(sentenceChunks[0].startsWith('First sentence.'), 'V2 preserves the first sentence when splitting at sentence punctuation');
  check(sentenceChunks.join('') === sentences, 'V2 preserves text when splitting around sentence boundaries');

  const whitespaceText = 'alpha beta gamma delta epsilon zeta';
  const whitespaceChunks = sandbox.splitIntoChunksForVersion(whitespaceText, 12, 'v2');
  check(whitespaceChunks.join('') === whitespaceText, 'V2 preserves spaces around whitespace-based boundaries');
  check(whitespaceChunks.every(chunk => chunk.length <= 12), 'V2 whitespace-boundary chunks stay within the limit');

  const paragraphs = 'A long first paragraph with several words.\n\nA second oversized paragraph follows.\n\nEnd.';
  const paragraphChunks = sandbox.splitIntoChunksForVersion(paragraphs, 14, 'v2');
  check(paragraphChunks.join('') === paragraphs, 'V2 preserves paragraph separators across multiple oversized paragraphs');

  const emoji = '😀'.repeat(101);
  const noSegmenterSandbox = {
    Intl: {},
    TextEncoder,
    Uint8Array,
    window: { crypto: webcrypto }
  };
  vm.runInNewContext(splitterCode, noSegmenterSandbox, { filename: 'v2-fallback-extract.js' });
  const emojiChunks = noSegmenterSandbox.splitIntoChunksForVersion(emoji, 101, 'v2');
  check(emojiChunks.join('') === emoji, 'V2 Unicode fallback preserves all surrogate pairs');
  check(
    emojiChunks.every(chunk => !/[\uD800-\uDBFF]$/.test(chunk) && !/^[\uDC00-\uDFFF]/.test(chunk)),
    'V2 fallback never splits an emoji surrogate pair at chunk boundaries'
  );
  check(emojiChunks.every(chunk => chunk.length <= 101), 'V2 fallback respects a length that can fit full emoji code points');
  const tinyEmojiChunks = noSegmenterSandbox.splitIntoChunksForVersion('😀😀x', 1, 'v2');
  check(tinyEmojiChunks.join('') === '😀😀x', 'V2 fallback retains emoji when maxLen is one code unit');
  check(tinyEmojiChunks.every(chunk => chunk.length <= 1 || /^😀$/.test(chunk)),
    'V2 only exceeds a one-code-unit limit for one indivisible surrogate pair');

  const original = ['aa', 'bb', 'cc'];
  const metadata = await sandbox.buildTranslationChunkMetadata(original, 'v2');
  const metadataAgain = await sandbox.buildTranslationChunkMetadata(original, 'v2');
  check(metadata.chunkerVersion === 'v2', 'new chunk metadata records its chunker version');
  check(metadata.chunkLengths.join(',') === '2,2,2', 'chunk metadata records each exact UTF-16 chunk length');
  check(/^[0-9a-f]{64}$/.test(metadata.chunkDigest), 'chunk metadata records a SHA-256 hex digest');
  check(metadata.chunkDigest === metadataAgain.chunkDigest, 'chunk digest is deterministic for an identical ordered sequence');

  const validJob = { ...metadata, totalChunks: original.length };
  const valid = await sandbox.verifyTranslationChunkMetadata(validJob, original);
  check(valid.legacy === false, 'matching metadata validates for recovery');
  await assert.rejects(
    () => sandbox.verifyTranslationChunkMetadata(validJob, ['cc', 'bb', 'aa']),
    /digest mismatch/,
    'same-count, same-length reordered chunks fail digest validation'
  );
  assertions += 1;
  console.log('PASS same-count, same-length reordered chunks fail digest validation');
  await assert.rejects(
    () => sandbox.verifyTranslationChunkMetadata(validJob, ['a1', 'bb', 'cc']),
    /lengths|digest mismatch/,
    'same-count modified chunk content fails integrity validation'
  );
  assertions += 1;
  console.log('PASS same-count modified chunk content fails integrity validation');
  await assert.rejects(
    () => sandbox.verifyTranslationChunkMetadata({ ...metadata, chunkLengths: [2, 1, 3] }, original),
    /lengths/,
    'corrupt chunk lengths fail integrity validation'
  );
  assertions += 1;
  console.log('PASS corrupt chunk lengths fail integrity validation');
  const legacy = await sandbox.verifyTranslationChunkMetadata({ jobId: 'legacy-no-digest' }, original);
  check(legacy.legacy === true && legacy.chunkerVersion === 'v1', 'old jobs without metadata remain explicitly legacy V1');
  await assert.rejects(
    () => sandbox.verifyTranslationChunkMetadata({ jobId: 'partial-metadata', chunkerVersion: 'v2' }, original),
    /incomplete chunk integrity metadata/,
    'partial modern metadata fails closed instead of silently downgrading'
  );
  assertions += 1;
  console.log('PASS partial modern metadata fails closed instead of silently downgrading');
  assert.throws(
    () => sandbox.splitIntoChunksForVersion('x'.repeat(5), 2, 'v99'),
    /Unsupported Translation Job chunker version/,
    'unsupported chunker versions are rejected'
  );
  assertions += 1;
  console.log('PASS unsupported chunker versions are rejected');

  const beforeSmallEdit = 'นี่คือบทแปลภาษาไทยที่มีเนื้อหาครบถ้วนและมีความยาวเพียงพอสำหรับทดสอบ guard';
  const afterSmallEdit = beforeSmallEdit.replace('ครบถ้วน', 'สมบูรณ์');
  const smallAssessment = editMagnitudeSandbox.assessSurgicalEditMagnitude(beforeSmallEdit, afterSmallEdit);
  check(!smallAssessment.requiresConfirmation, 'small targeted glossary correction does not prompt for confirmation');
  const unchangedAssessment = editMagnitudeSandbox.assessSurgicalEditMagnitude(beforeSmallEdit, beforeSmallEdit);
  check(!unchangedAssessment.requiresConfirmation && unchangedAssessment.changedRatio === 0,
    'identical source and proposed output are classified as unchanged');
  const truncatedAssessment = editMagnitudeSandbox.assessSurgicalEditMagnitude(
    beforeSmallEdit, beforeSmallEdit.slice(0, Math.floor(beforeSmallEdit.length * 0.4))
  );
  check(truncatedAssessment.requiresConfirmation && truncatedAssessment.lengthRatio < 0.65,
    'unexpectedly short AI output requires confirmation');
  const rewrittenAssessment = editMagnitudeSandbox.assessSurgicalEditMagnitude(
    beforeSmallEdit, 'ข้อความเขียนใหม่ทั้งหมดซึ่งแตกต่างจากฉบับเดิมอย่างมาก'
  );
  check(rewrittenAssessment.requiresConfirmation && rewrittenAssessment.changedRatio >= 0.30,
    'large replacement requires confirmation');
  const expandedAssessment = editMagnitudeSandbox.assessSurgicalEditMagnitude(
    beforeSmallEdit, beforeSmallEdit + ' เนื้อหาเพิ่มเติม'.repeat(8)
  );
  check(expandedAssessment.requiresConfirmation && expandedAssessment.lengthRatio > 1.5,
    'unexpectedly expanded AI output requires confirmation');
  check(editMagnitudeSandbox.assessSurgicalEditMagnitude('', 'ผลลัพธ์ใหม่').requiresConfirmation,
    'empty original output plus non-empty AI replacement requires confirmation');

  console.log('\nFix-Then-Ship Chunker / Integrity Contract: PASS (' + assertions + ' assertions)');
}

main().catch(error => {
  console.error('\nFix-Then-Ship Chunker / Integrity Contract: FAIL');
  console.error(error);
  process.exitCode = 1;
});
