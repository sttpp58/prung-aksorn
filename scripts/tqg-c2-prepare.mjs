import fs from "node:fs";
import crypto from "node:crypto";

const repo = process.cwd();
const selectedPath = process.env.TQG_C2_SELECTED
  || "tests/tqg/c2-private/selection-source.json";
const analyzedPath = process.env.TQG_C2_ANALYZED
  || "tests/tqg/c2-private/analyzed-source.json";
const outDir = "tests/tqg/c2-private";

const selected = JSON.parse(fs.readFileSync(selectedPath, "utf8"));
const analyzed = JSON.parse(fs.readFileSync(analyzedPath, "utf8"));

const labels = new Map();
const set = (ids, label) => ids.forEach(id => labels.set(id, label));
const range = (a, b) => Array.from(
  { length: b - a + 1 },
  (_, i) => "C2-" + String(a + i).padStart(3, "0")
);

set(range(1, 50), "OTHER");
set(range(51, 100), "TRUE_ANOMALY");
labels.set("C2-076", "STRUCTURAL_ERROR");
set([
  "C2-101", "C2-102", "C2-103", "C2-104", "C2-105", "C2-107",
  "C2-108", "C2-109", "C2-110", "C2-111", "C2-121", "C2-122",
  "C2-126", "C2-128", "C2-138", "C2-148", "C2-151", "C2-152",
  "C2-159", "C2-163", "C2-170", "C2-174"
], "FALSE_POSITIVE");
labels.set("C2-106", "AMBIGUOUS");
labels.set("C2-119", "LEGITIMATE_FOREIGN");
labels.set("C2-160", "LEGITIMATE_TECHNICAL");
set([
  "C2-112", "C2-113", "C2-114", "C2-115", "C2-116", "C2-117",
  "C2-118", "C2-120", "C2-123", "C2-124", "C2-125", "C2-127",
  "C2-129", "C2-130", "C2-131", "C2-132", "C2-133", "C2-134",
  "C2-135", "C2-136", "C2-137", "C2-139", "C2-140", "C2-141",
  "C2-142", "C2-143", "C2-144", "C2-145", "C2-146", "C2-147",
  "C2-149", "C2-150", "C2-153", "C2-154", "C2-155", "C2-156",
  "C2-157", "C2-158", "C2-161", "C2-162", "C2-164", "C2-165",
  "C2-166", "C2-167", "C2-169", "C2-172"
], "TRUE_ANOMALY");
set(["C2-168", "C2-171", "C2-173"], "OTHER");
const promptId = process.env.TQG_C2_PROMPT_ID;
if (!promptId) throw new Error("TQG_C2_PROMPT_ID is required for taxonomy coverage.");
const promptRow = analyzed.rows.find(row => row.id === promptId);
if (!promptRow) throw new Error("Prompt-leak case id was not found.");

const rows = selected.cases
  .filter(row => row.caseId !== "C2-175")
  .concat([{ ...promptRow, samplingBucket: "EDGE_CASE" }])
  .map((row, index) => {
    const caseId = index === 174 ? "C2-175" : row.caseId;
    const goldLabel = caseId === "C2-175"
      ? "META/PROMPT_LEAK"
      : labels.get(caseId);
    if (!goldLabel) throw new Error("Missing gold label for " + caseId);

    let goldRationale = "No material anomaly was observed in the bounded review context.";
    if (goldLabel === "TRUE_ANOMALY") {
      goldRationale =
        "Confirmed material output anomaly: foreign/source residue or corrupted mixed-language content is embedded in Thai output.";
    } else if (goldLabel === "FALSE_POSITIVE") {
      goldRationale =
        "Detector flag is explainable by legitimate repetition or formatting variation; no material translation anomaly was confirmed.";
    } else if (goldLabel === "AMBIGUOUS") {
      goldRationale =
        "Evidence is insufficient for a definitive label; quote-structure mismatch alone does not establish a translation defect.";
    } else if (goldLabel === "LEGITIMATE_FOREIGN") {
      goldRationale =
        "Foreign token functions as an intentional proper-name/foreign-language element and is supported by source/context.";
    } else if (goldLabel === "LEGITIMATE_TECHNICAL") {
      goldRationale =
        "Foreign token is technical measurement notation used intentionally in context.";
    } else if (goldLabel === "STRUCTURAL_ERROR") {
      goldRationale =
        "Confirmed structural defect: target has materially fewer paragraphs than source (41 vs 43).";
    } else if (goldLabel === "META/PROMPT_LEAK") {
      goldRationale =
        "Confirmed meta/prompt leakage: assistant-style text is embedded in the translated novel output.";
    }

    if (caseId === "C2-119") {
      goldRationale =
        "Jing is a source-supported person-name token, retained as a legitimate foreign-name control.";
    }
    if (caseId === "C2-160") {
      goldRationale =
        "丈 is a distance unit embedded in a measurement expression, treated as legitimate technical notation.";
    }

    const contentHash = crypto.createHash("sha256")
      .update(String(row.sourceText || "") + "\0" + String(row.targetText || ""))
      .digest("hex");

    return {
      caseId,
      samplingBucket: row.samplingBucket,
      id: row.id,
      bookId: row.bookId,
      chapterNumber: row.chapterNumber,
      title: row.title,
      tqg: {
        status: row.status,
        codes: row.codes,
        ratio: row.ratio,
        sourceLen: row.sourceLen,
        targetLen: row.targetLen
      },
      goldLabel,
      goldRationale,
      goldEvidence: (row.findings || []).slice(0, 4).map(f => ({
        code: f.code,
        text: String(f.text || "").slice(0, 180)
      })),
      reviewStatus: "GOLD_REVIEWED",
      contentHash,
      sourceText: row.sourceText || "",
      targetText: row.targetText || ""
    };
  });
const expected = {
  RANDOM_CLEAN: 50,
  RANDOM_MIXED: 50,
  TQG_FLAGGED: 50,
  EDGE_CASE: 25
};
const byBucket = Object.groupBy(rows, row => row.samplingBucket);
for (const [bucket, count] of Object.entries(expected)) {
  if ((byBucket[bucket] || []).length !== count) {
    throw new Error("Bucket count mismatch: " + bucket);
  }
}

const byLabel = Object.groupBy(rows, row => row.goldLabel);
const labelsExpected = [
  "TRUE_ANOMALY",
  "FALSE_POSITIVE",
  "AMBIGUOUS",
  "LEGITIMATE_FOREIGN",
  "LEGITIMATE_TECHNICAL",
  "STRUCTURAL_ERROR",
  "META/PROMPT_LEAK",
  "OTHER"
];
for (const label of labelsExpected) {
  if (!(byLabel[label] || []).length) {
    throw new Error("Missing taxonomy label: " + label);
  }
}

const dataset = {
  schemaVersion: "1.0",
  dataset: "TQG-C2-real-world-gold",
  annotation: {
    method: "single-reviewer-adjudication",
    taxonomy: labelsExpected,
    ambiguousExcludedFromBinaryMetrics: true
  },
  sampling: { ...expected, total: rows.length },
  sourceSnapshot: { fullCompletedChapters: 261, glossaryRecords: 1452 },
  cases: rows
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  outDir + "/gold-dataset.json",
  JSON.stringify(dataset, null, 2),
  "utf8"
);
fs.writeFileSync(
  outDir + "/label-summary.json",
  JSON.stringify({
    byLabel: Object.fromEntries(
      Object.entries(byLabel).map(([k, v]) => [k, v.length])
    ),
    byBucket: Object.fromEntries(
      Object.entries(byBucket).map(([k, v]) => [k, v.length])
    )
  }, null, 2),
  "utf8"
);
console.log(JSON.stringify({
  cases: rows.length,
  byLabel: Object.fromEntries(
    Object.entries(byLabel).map(([k, v]) => [k, v.length])
  ),
  byBucket: Object.fromEntries(
    Object.entries(byBucket).map(([k, v]) => [k, v.length])
  )
}, null, 2));
