import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync('index.html', 'utf8');

function extractFunction(sourceText, functionName) {
  const pattern = new RegExp('(?:async\\s+)?function\\s+' + functionName + '\\s*\\(');
  const match = pattern.exec(sourceText);
  if (!match) throw new Error('Function not found: ' + functionName);

  const start = match.index;
  const braceStart = sourceText.indexOf('{', start);
  if (braceStart < 0) throw new Error('Function body not found: ' + functionName);

  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = braceStart; index < sourceText.length; index += 1) {
    const ch = sourceText[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === String.fromCharCode(96)) {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return sourceText.slice(start, index + 1);
    }
  }
  throw new Error('Unclosed function: ' + functionName);
}

const callOpenAI = extractFunction(source, 'callOpenAI');
const callGemini = extractFunction(source, 'callGemini');
const callAIWithRetry = extractFunction(source, 'callAIWithRetry');
const createTQGAITransport = extractFunction(source, 'createTQGAITransport');

let requests = [];
const context = vm.createContext({
  fetch: async (url, options) => {
    requests.push({ url, options: { ...options } });
    if (String(url).includes('openai.com')) {
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"replacementText":"และยิ้ม"}' } }]
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        candidates: [{
          content: { parts: [{ text: '{"replacementText":"และยิ้ม"}' }] }
        }]
      })
    };
  },
  updateApiStats() {},
  showError() {},
  describeGeminiBlockReason(reason) { return reason || 'unknown'; },
  describeGeminiFinishReason(reason) { return reason || 'unknown'; }
});

vm.runInContext(callOpenAI, context);
vm.runInContext(callGemini, context);
vm.runInContext(callAIWithRetry, context);

requests = [];
await context.callOpenAI('system', 'target', 'key', 'gpt-4o-mini', null);
assert.equal(requests.length, 1);
let body = JSON.parse(requests[0].options.body);
assert.equal(body.response_format, undefined, 'normal OpenAI calls remain text-mode');

requests = [];
const openAiJson = await context.callOpenAI(
  'system', 'target', 'key', 'gpt-4o-mini', null, 'json'
);
assert.equal(openAiJson, '{"replacementText":"และยิ้ม"}');
assert.equal(requests.length, 1);
body = JSON.parse(requests[0].options.body);
assert.deepEqual(
  body.response_format,
  { type: 'json_object' },
  'TQG Repair OpenAI calls request JSON mode'
);

requests = [];
await context.callGemini('system', 'target', 'key', 'gemini-2.5-flash', null);
assert.equal(requests.length, 1);
body = JSON.parse(requests[0].options.body);
assert.equal(
  body.generationConfig.responseMimeType,
  undefined,
  'normal Gemini calls remain text-mode'
);

requests = [];
const geminiJson = await context.callGemini(
  'system', 'target', 'key', 'gemini-2.5-flash', null, 'json'
);
assert.equal(geminiJson, '{"replacementText":"และยิ้ม"}');
assert.equal(requests.length, 1);
body = JSON.parse(requests[0].options.body);
assert.equal(
  body.generationConfig.responseMimeType,
  'application/json',
  'TQG Repair Gemini calls request JSON MIME type'
);

let forwarded = null;
context.callOpenAI = async (...args) => {
  forwarded = ['openai', args];
  return 'ok';
};
context.callGemini = async (...args) => {
  forwarded = ['gemini', args];
  return 'ok';
};

const retryResult = await context.callAIWithRetry(
  'sys', 'text', 'key', 'model', null, 0, 'openai', 'json'
);
assert.equal(retryResult, 'ok');
assert.equal(forwarded[0], 'openai');
assert.equal(
  forwarded[1][5],
  'json',
  'Retry layer forwards structured response mode'
);

assert.ok(
  createTQGAITransport.includes('providerSel.value') &&
  createTQGAITransport.includes("'json'"),
  'TQG AI transport enables JSON mode explicitly'
);

console.log('TQG Repair Production Contract regression: PASS');
