# Phase 1 — Browser / CI Harness Diagnostics

## Scope

This phase changes only browser-test infrastructure and its deterministic
regression gate. It does not change translation, storage, TQG, or application
runtime logic, and it does not change existing scenario assertions.

## Root cause established by reproduction

The original runners launched Chrome with a remote-debugging port but did not
explicitly bind the DevTools server address. In the affected Windows sandbox,
Chrome printed a `DevTools listening on ws://127.0.0.1:<port>` line while the
runner could not establish a TCP/HTTP connection to `/json`.

A standalone probe using the same Chrome binary established the distinction:

- without an explicit address, the runner observed a `/json` readiness timeout;
- with `--remote-debugging-address=127.0.0.1`, `netstat` showed the port as
  `LISTENING`, TCP probing returned `True`, and `/json/version` returned valid
  JSON.

The five browser runners now pass the explicit loopback address and share the
diagnostic helper in `tests/e2e/harness-diagnostics.mjs`.

## Diagnostic contract

The helper reports three categories:

- `APPLICATION_FAILURE` — Chrome/CDP setup completed and the application or
  scenario failed afterwards.
- `BROWSER_STARTUP_FAILURE` — Chrome spawn, DevTools endpoint, page-target, or
  CDP handshake failed.
- `ENVIRONMENT_FAILURE` — browser discovery or environment setup is unavailable.

DevTools readiness is bounded and explicit:

| Setting | Value |
| --- | ---: |
| Maximum attempts | 20 |
| Backoff | 100 ms |
| Per-request timeout | 1,000 ms |
| TCP port probe timeout | 250 ms |

The failure output includes the phase (`devtools_endpoint`, `page_target`, or
`devtools_handshake`), whether the TCP port was observed open, Chrome exit and
signal state, retry settings, the last error, and a bounded stderr tail.

## Regression coverage

`tests/e2e/harness-diagnostics-regression.mjs` injects and checks all three
failure categories. `scripts/regression-gate.mjs` runs that regression as part
of the main gate.

The wrong-browser-path experiment produced:

```text
BROWSER_STARTUP_FAILURE phase=devtools_endpoint
spawn C:\does-not-exist\chrome.exe ENOENT
```

## Verification record

Passed with elevated browser access:

- `node tests/e2e/browser-real-user-scenario.mjs`
- `node tests/e2e/failure-injection.mjs`
- `node tests/e2e/backup-restore-real-world.mjs`
- `node tests/e2e/translation-job-recovery-stress.mjs`
- `node tests/e2e/tqg-production-assurance.mjs`
- `node scripts/regression-gate.mjs`

The existing `tests/e2e/browser-e2e-lifecycle.mjs` wrapper passed setup-exception
and global-timeout cleanup, but its SIGINT case returned `exitCode=null` on the
Windows runner instead of the existing expected `130`. The lifecycle assertion
was not changed. This is recorded as a platform-specific follow-up; CI's Linux
workflow remains the authoritative browser lifecycle environment.
