import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const datasetPath = process.env.TQG_C2_GOLD_DATASET
  || "tests/tqg/c2-private/gold-dataset.json";
const taxonomy = [
  "TRUE_ANOMALY", "FALSE_POSITIVE", "AMBIGUOUS",
  "LEGITIMATE_FOREIGN", "LEGITIMATE_TECHNICAL",
  "STRUCTURAL_ERROR", "META/PROMPT_LEAK", "OTHER"
];
const expectedBuckets = {
  RANDOM_CLEAN: 50, RANDOM_MIXED: 50,
  TQG_FLAGGED: 50, EDGE_CASE: 25
};
const anomalyLabels = new Set([
  "TRUE_ANOMALY", "STRUCTURAL_ERROR", "META/PROMPT_LEAK"
]);
const legitimateLabels = new Set([
  "FALSE_POSITIVE", "LEGITIMATE_FOREIGN",
  "LEGITIMATE_TECHNICAL", "OTHER"
]);

function fail(message) {
  throw new Error("C2 validation failed: " + message);
}

if (!fs.existsSync(datasetPath)) fail("dataset not found: " + datasetPath);
const raw = JSON.parse(fs.readFileSync(datasetPath, "utf8"));
if (raw.schemaVersion !== "1.0") fail("schemaVersion must be 1.0");
if (raw.dataset !== "TQG-C2-real-world-gold") fail("dataset id mismatch");
if (!Array.isArray(raw.cases)) fail("cases must be an array");
if (raw.cases.length !== 175) fail("expected exactly 175 cases");

for (const [bucket, count] of Object.entries(expectedBuckets)) {
  const actual = raw.cases.filter(c => c.samplingBucket === bucket).length;
  if (actual !== count) {
    fail("bucket " + bucket + ": expected " + count + ", got " + actual);
  }
}

const actualLabels = new Set(raw.cases.map(c => c.goldLabel));
for (const label of taxonomy) {
  if (!actualLabels.has(label)) fail("taxonomy label missing: " + label);
}
for (const label of actualLabels) {
  if (!taxonomy.includes(label)) fail("unknown taxonomy label: " + label);
}

const caseIds = new Set();
const contentHashes = new Set();
for (const c of raw.cases) {
  if (!/^C2-\d{3}$/.test(c.caseId)) fail("invalid caseId: " + c.caseId);
  if (caseIds.has(c.caseId)) fail("duplicate caseId: " + c.caseId);
  caseIds.add(c.caseId);
  if (c.reviewStatus !== "GOLD_REVIEWED") {
    fail("case " + c.caseId + " is not GOLD_REVIEWED");
  }
  if (!taxonomy.includes(c.goldLabel)) {
    fail("case " + c.caseId + " has invalid goldLabel");
  }
  if (typeof c.goldRationale !== "string" || !c.goldRationale.trim()) {
    fail("case " + c.caseId + " has no gold rationale");
  }
  if (typeof c.sourceText !== "string" || !c.sourceText.length) {
    fail("case " + c.caseId + " has no sourceText");
  }
  if (typeof c.targetText !== "string" || !c.targetText.length) {
    fail("case " + c.caseId + " has no targetText");
  }

  const expectedHash = crypto.createHash("sha256")
    .update(c.sourceText + "\0" + c.targetText)
    .digest("hex");
  if (c.contentHash !== expectedHash) {
    fail("contentHash mismatch: " + c.caseId);
  }
  if (contentHashes.has(c.contentHash)) {
    fail("duplicate source/target content: " + c.caseId);
  }
  contentHashes.add(c.contentHash);
}
const summary = {};
for (const label of taxonomy) summary[label] = 0;
for (const c of raw.cases) summary[c.goldLabel]++;

const statusByLabel = {};
for (const c of raw.cases) {
  const key = c.goldLabel + "|" + c.tqg.status;
  statusByLabel[key] = (statusByLabel[key] || 0) + 1;
}

const evaluable = raw.cases.filter(c => c.goldLabel !== "AMBIGUOUS");
const predictedPositive = c =>
  c.tqg.status === "REVIEW" || c.tqg.status === "HIGH_SUSPICION";
const isGoldPositive = c => anomalyLabels.has(c.goldLabel);
const isGoldNegative = c => legitimateLabels.has(c.goldLabel);
const confusion = { TP: 0, TN: 0, FP: 0, FN: 0 };

for (const c of evaluable) {
  if (!isGoldPositive(c) && !isGoldNegative(c)) {
    fail("non-evaluable label leaked into binary metrics: " + c.caseId);
  }
  const predicted = predictedPositive(c);
  const actual = isGoldPositive(c);
  if (predicted && actual) confusion.TP++;
  else if (!predicted && !actual) confusion.TN++;
  else if (predicted && !actual) confusion.FP++;
  else confusion.FN++;
}

const precision = (confusion.TP + confusion.FP) === 0
  ? null : confusion.TP / (confusion.TP + confusion.FP);
const recall = (confusion.TP + confusion.FN) === 0
  ? null : confusion.TP / (confusion.TP + confusion.FN);
const specificity = (confusion.TN + confusion.FP) === 0
  ? null : confusion.TN / (confusion.TN + confusion.FP);
const accuracy = evaluable.length === 0
  ? null : (confusion.TP + confusion.TN) / evaluable.length;
const f1 = precision === null || recall === null || precision + recall === 0
  ? null : 2 * precision * recall / (precision + recall);

let privateTracked = false;
try {
  execFileSync("git", ["ls-files", "--error-unmatch", datasetPath],
    { stdio: "ignore" });
  privateTracked = true;
} catch {
  privateTracked = false;
}
if (privateTracked) fail("private gold dataset is tracked by git");
if (raw.cases.some(c =>
  c.caseId === "C2-175" && c.goldLabel !== "META/PROMPT_LEAK"
)) {
  fail("C2-175 prompt-leak taxonomy-coverage case is missing");
}
if (!raw.cases.some(c => c.goldLabel === "STRUCTURAL_ERROR")) {
  fail("expected at least one structural-error case");
}
if (!raw.cases.some(c => c.goldLabel === "AMBIGUOUS")) {
  fail("expected at least one ambiguous case");
}

console.log(JSON.stringify({
  PASS: true,
  dataset: raw.dataset,
  cases: raw.cases.length,
  bucketCounts: expectedBuckets,
  labelCounts: summary,
  statusByLabel,
  binaryMetrics: {
    excludedAmbiguous: raw.cases.length - evaluable.length,
    evaluatedCases: evaluable.length,
    positiveLabels: [...anomalyLabels],
    negativeLabels: [...legitimateLabels],
    confusion,
    accuracy,
    precision,
    recall,
    specificity,
    f1,
    interpretation:
      "Sample-stratified effectiveness only; not a production-prevalence estimate."
  },
  privacy: {
    privateDatasetTrackedByGit: privateTracked,
    sourceAndTargetIncluded: true
  }
}, null, 2));
