#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  HARNESS_FAILURE_KINDS,
  DEVTOOLS_RETRY_POLICY,
  HarnessFailure,
  classifyInjectedFailure,
  formatHarnessFailure
} from './harness-diagnostics.mjs';

function check(condition, message) {
  assert.ok(condition, message);
  console.log('PASS  ' + message);
}

check(DEVTOOLS_RETRY_POLICY.maxAttempts === 20, 'bounded DevTools retry count is explicit');
check(DEVTOOLS_RETRY_POLICY.backoffMs === 100, 'bounded DevTools retry backoff is explicit');
check(DEVTOOLS_RETRY_POLICY.requestTimeoutMs === 1000, 'DevTools request timeout is explicit');

for (const kind of Object.values(HARNESS_FAILURE_KINDS)) {
  const failure = classifyInjectedFailure(kind);
  check(failure instanceof HarnessFailure, kind + ' injection creates a typed harness failure');
  check(formatHarnessFailure(failure).startsWith(kind + ' phase='), kind + ' error has an explicit category prefix');
}

const browserFailure = classifyInjectedFailure(HARNESS_FAILURE_KINDS.BROWSER_STARTUP_FAILURE);
check(browserFailure.phase === 'devtools_endpoint', 'browser startup injection identifies the DevTools phase');
const applicationFailure = classifyInjectedFailure(HARNESS_FAILURE_KINDS.APPLICATION_FAILURE);
check(applicationFailure.phase === 'page_load', 'application injection identifies the page-load phase');
const environmentFailure = classifyInjectedFailure(HARNESS_FAILURE_KINDS.ENVIRONMENT_FAILURE);
check(environmentFailure.phase === 'environment', 'environment injection identifies the environment phase');

console.log('Harness Diagnostics Regression: PASS');
