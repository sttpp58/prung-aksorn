import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);
const TQG = require(path.join(root, "tqg.js"));
const Repair = require(path.join(root, "tqg-repair.js"));
const datasetPath = process.env.TQG_C2_GOLD_DATASET
  || path.join(root, "tests", "tqg", "c2-private", "gold-dataset.json");
const glossaryPath = process.env.TQG_C4_GLOSSARY || "";

const POSITIVE = new Set(["TRUE_ANOMALY","STRUCTURAL_ERROR","META/PROMPT_LEAK"]);
const NEGATIVE = new Set(["FALSE_POSITIVE","LEGITIMATE_FOREIGN","LEGITIMATE_TECHNICAL","OTHER"]);
const REPAIRABLE = new Set([
  "FOREIGN_SCRIPT_SPAN","MIXED_LANGUAGE_SPAN","SOURCE_LANGUAGE_RESIDUE",
  "SOURCE_TEXT_OVERLAP","REPEATED_TEXT","PROMPT_LEAKAGE","PUA_OR_REPLACEMENT_CHAR"
]);

function fail(message) { throw new Error("C4 validation failed: " + message); }
function check(ok, message) { if (!ok) fail(message); }
function glossary() {
  if (!glossaryPath) return "";
  check(fs.existsSync(glossaryPath), "configured glossary does not exist");
  return fs.readFileSync(glossaryPath, "utf8");
}

function analyze(testCase, glossaryText) {
  return TQG.analyze({
    sourceText: testCase.sourceText,
    targetText: testCase.targetText,
    glossaryText
  });
}

function matchingSpan(testCase, analysis) {
  for (const evidence of testCase.goldEvidence || []) {
    if (!REPAIRABLE.has(evidence.code) || !evidence.text) continue;
    let from = 0;
    while (from < testCase.targetText.length) {
      const start = testCase.targetText.indexOf(evidence.text, from);
      if (start < 0) break;
      const end = start + evidence.text.length;
      const match = analysis.findings.find((f) =>
        f.code === evidence.code &&
        f.start === start &&
        f.end === end &&
        f.text === evidence.text
      );
      if (match) return {
        code: evidence.code,
        start,
        end,
        text: evidence.text
      };
      from = start + 1;
    }
  }
  return null;
}

function replacementFor(code) {
  if (code === "PROMPT_LEAKAGE") return "ข้อความ";
  if (code === "REPEATED_TEXT") return "คำ";
  return "คำแปล";
}

function exactBoundedChange(original, repaired, span, replacement) {
  return repaired.slice(0, span.start) === original.slice(0, span.start) &&
    repaired.slice(span.start + replacement.length) === original.slice(span.end);
}

function inputFor(testCase, analysis, span, transport, glossaryText) {
  return {
    inspectorResult: {
      status: "COMPLETED",
      verdict: "TRUE_ANOMALY",
      repairable: true
    },
    originalAnalysis: analysis,
    targetContext: testCase.targetText,
    sourceContext: testCase.sourceText,
    glossaryContext: glossaryText,
    findings: analysis.findings,
    suspiciousSpan: span,
    transport,
    analyze: (targetText) => TQG.analyze({
      sourceText: testCase.sourceText,
      targetText,
      glossaryText
    })
  };
}

check(fs.existsSync(datasetPath), "C2 gold dataset is required");
const dataset = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
check(dataset.dataset === "TQG-C2-real-world-gold", "unexpected C2 dataset");
check(dataset.cases.length === 175, "locked C2 dataset size changed");

let tracked = false;
try {
  execFileSync("git", ["ls-files", "--error-unmatch", datasetPath], {
    cwd: root, stdio: "ignore"
  });
  tracked = true;
} catch {}
check(!tracked, "private C2 dataset is tracked");

const glossaryText = glossary();
const analyzed = dataset.cases.map((testCase) => ({
  testCase,
  analysis: analyze(testCase, glossaryText)
}));

const positives = analyzed
  .filter(({ testCase }) => POSITIVE.has(testCase.goldLabel))
  .map(({ testCase, analysis }) => ({
    testCase,
    analysis,
    span: matchingSpan(testCase, analysis)
  }))
  .filter((row) => row.span);

check(positives.length >= 24, "fewer than 24 real-world repair candidates");
const sample = positives.slice(0, 48);
const outcomes = [];

for (const row of sample) {
  const replacement = replacementFor(row.span.code);
  const result = await Repair.repair(inputFor(
    row.testCase,
    row.analysis,
    row.span,
    async () => JSON.stringify({ replacementText: replacement }),
    glossaryText
  ));
  outcomes.push({
    caseId: row.testCase.caseId,
    goldLabel: row.testCase.goldLabel,
    code: row.span.code,
    status: result.status,
    accepted: result.accepted,
    reason: result.reason || result.validation?.reason || null,
    revalidated: result.meta?.revalidated === true,
    exactBoundedChange: result.accepted
      ? exactBoundedChange(row.testCase.targetText, result.output, row.span, result.replacementText)
      : true,
    preservedOnReject: result.accepted ? false : result.output === row.testCase.targetText
  });
}const accepted = outcomes.filter((row) => row.accepted);
const rejected = outcomes.filter((row) => !row.accepted);

check(
  accepted.every((row) =>
    row.status === "ACCEPTED" &&
    row.revalidated &&
    row.exactBoundedChange
  ),
  "accepted repairs must be revalidated and span-bounded"
);
check(
  rejected.every((row) =>
    row.status !== "ACCEPTED" && row.preservedOnReject
  ),
  "rejected repairs must preserve original output"
);

const controls = analyzed
  .filter(({ testCase }) => NEGATIVE.has(testCase.goldLabel))
  .slice(0, 24);
check(controls.length === 24, "expected 24 negative controls");

const controlResults = [];
for (const row of controls) {
  const span = row.analysis.findings[0] || {
    code: "NO_FINDING",
    start: 0,
    end: 0,
    text: ""
  };
  let calls = 0;
  const result = await Repair.repair({
    ...inputFor(
      row.testCase,
      row.analysis,
      span,
      async () => {
        calls += 1;
        return JSON.stringify({ replacementText: "คำแปล" });
      },
      glossaryText
    ),
    inspectorResult: {
      status: "COMPLETED",
      verdict: "FALSE_POSITIVE",
      repairable: false
    }
  });
  controlResults.push({
    caseId: row.testCase.caseId,
    status: result.status,
    accepted: result.accepted,
    calls,
    preserved: result.output === row.testCase.targetText
  });
}
check(
  controlResults.every((row) => !row.accepted && row.calls === 0 && row.preserved),
  "negative controls must fail closed before transport"
);

const mutationSample = sample.slice(0, Math.min(6, sample.length));
const mutationResults = [];

for (const row of mutationSample) {
  let sameCalls = 0;
  const sameSpan = await Repair.repair(inputFor(
    row.testCase,
    row.analysis,
    row.span,
    async () => {
      sameCalls += 1;
      return JSON.stringify({ replacementText: row.span.text });
    },
    glossaryText
  ));
  mutationResults.push({
    kind: "same-span",
    caseId: row.testCase.caseId,
    accepted: sameSpan.accepted,
    calls: sameCalls,
    preserved: sameSpan.output === row.testCase.targetText
  });

  const malformed = await Repair.repair(inputFor(
    row.testCase,
    row.analysis,
    row.span,
    async () => "not-json",
    glossaryText
  ));
  mutationResults.push({
    kind: "malformed-json",
    caseId: row.testCase.caseId,
    accepted: malformed.accepted,
    preserved: malformed.output === row.testCase.targetText
  });

  const oversized = await Repair.repair(inputFor(
    row.testCase,
    row.analysis,
    row.span,
    async () => JSON.stringify({
      replacementText: "x".repeat(Repair.DEFAULTS.maxReplacementChars + 1)
    }),
    glossaryText
  ));
  mutationResults.push({
    kind: "oversized-replacement",
    caseId: row.testCase.caseId,
    accepted: oversized.accepted,
    preserved: oversized.output === row.testCase.targetText
  });
}

check(
  mutationResults.every((row) => !row.accepted && row.preserved),
  "invalid/mutated repair responses must fail closed"
);

const giant = analyzed
  .flatMap(({ testCase, analysis }) =>
    analysis.findings
      .filter((finding) =>
        Number.isInteger(finding.start) &&
        Number.isInteger(finding.end) &&
        finding.end - finding.start > Repair.DEFAULTS.maxRepairSpanChars
      )
      .map((finding) => ({ testCase, analysis, finding }))
  )[0];

check(Boolean(giant), "real-world corpus must exercise max repair-span guard");

let giantCalls = 0;
const giantSpan = {
  code: giant.finding.code,
  start: giant.finding.start,
  end: giant.finding.end,
  text: giant.testCase.targetText.slice(
    giant.finding.start,
    giant.finding.end
  )
};

const giantResult = await Repair.repair(inputFor(
  giant.testCase,
  giant.analysis,
  giantSpan,
  async () => {
    giantCalls += 1;
    return JSON.stringify({ replacementText: "คำแปล" });
  },
  glossaryText
));

check(
  giantResult.status === "ERROR" &&
  !giantResult.accepted &&
  giantResult.output === giant.testCase.targetText &&
  giantCalls === 0,
  "oversized real-world span must fail closed before transport"
);

const summary = {
  pass: true,
  analyzerVersion: TQG.version,
  repairVersion: Repair.version,
  datasetCases: dataset.cases.length,
  glossaryConfigured: Boolean(glossaryPath),
  glossaryChars: glossaryText.length,
  positiveCandidates: positives.length,
  boundedSample: sample.length,
  boundedAccepted: accepted.length,
  boundedRejected: rejected.length,
  acceptedRate: sample.length ? accepted.length / sample.length : null,
  acceptedAllRevalidated: accepted.every((row) => row.revalidated),
  acceptedAllBounded: accepted.every((row) => row.exactBoundedChange),
  rejectedAllPreserved: rejected.every((row) => row.preservedOnReject),
  negativeControls: controlResults.length,
  negativeControlsFailClosed: controlResults.every((row) =>
    !row.accepted && row.calls === 0 && row.preserved
  ),
  mutationTests: mutationResults.length,
  mutationTestsFailClosed: mutationResults.every((row) =>
    !row.accepted && row.preserved
  ),
  oversizedSpanGuard: {
    maxRepairSpanChars: Repair.DEFAULTS.maxRepairSpanChars,
    caseId: giant.testCase.caseId,
    code: giant.finding.code,
    findingSpanChars: giant.finding.end - giant.finding.start,
    status: giantResult.status,
    accepted: giantResult.accepted,
    transportCalls: giantCalls,
    originalPreserved: giantResult.output === giant.testCase.targetText
  }
};

summary.digest = crypto.createHash("sha256")
  .update(JSON.stringify(summary))
  .digest("hex");
console.log(JSON.stringify(summary, null, 2));
