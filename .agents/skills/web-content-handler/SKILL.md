---
name: web-content-handler
description: "Web content processing skill based on Browser-use concepts. Specialized in OCR repair, dynamic font decryption (PUA), and text cleaning."
---

# web-content-handler

## Key Capabilities
- **Smart Paste**: Remove invisible characters, resolve font obfuscation (PUA), and detect chapter markers.
- **OCR Repair**: 2-level repair (Thai De-obfuscation & Foreign source cleaning).
- **DOM & Input Handling**: Safe text extraction from various source web layouts.

## Implementation Guide
- Use this skill to pre-process raw input in `tqg-repair.js` before translation starts.
- Always validate text cleaning to ensure no loss of critical semantic markers.
