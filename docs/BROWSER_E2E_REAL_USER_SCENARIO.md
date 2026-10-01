# Browser E2E / Real User Scenario

## Scope
This test covers one browser-level production scenario without changing application core logic:

1. Launch the application in a clean Chromium-family profile over an HTTP origin.
2. Create a Project through the visible UI.
3. Enter and persist a Book A draft.
4. Create Book B through the visible UI and enter a separate draft.
5. Switch back to Book A and start a translation through the visible UI.
6. Replace the provider call with a deterministic in-browser mock so no real API key or provider request is used.
7. Hold the provider response open, switch to Book B, then release the response.
8. Verify the completed Book A job does not overwrite Book B input/output.
9. Reload the browser and verify Book B draft/title persistence.
10. Navigate through the visible history UI and verify the Book A result remains accessible.
11. Fail on uncaught browser/runtime errors.

## Test Architecture
The E2E runner is dependency-free and uses:

- Node.js built-in HTTP server for the local application origin.
- Chromium-family browser through the Chrome DevTools Protocol.
- A temporary clean browser profile for isolation.
- A deterministic mocked OpenAI response inside the page context.

No production API provider is contacted by this test.

## CI
`.github/workflows/browser-e2e.yml` runs this scenario on every pull request and push to `main`.

## Non-goals
- Translation algorithm changes
- TQG algorithm or semantic behavior changes
- IndexedDB schema changes
- Architecture refactor
- Failure injection matrix
- Backup/restore stress testing
- Full browser coverage of every UI surface

## Observed non-blocking UX note
When a stale Book A translation completes after the user has switched to Book B, the existing shared cancel control may remain visible briefly even though the active Book is ready. The E2E scenario confirms that this does not overwrite Book B state; correcting that control lifecycle is intentionally deferred to a separate UI/async-state scope.
