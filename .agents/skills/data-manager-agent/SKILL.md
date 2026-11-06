---
name: data-manager-agent
description: "Data management and local storage skill based on OpenInterpreter concepts. Handles IndexedDB CRUD, JSON backups, and multi-format exports (.docx, .epub)."
---

# data-manager-agent

## Key Capabilities
- **IndexedDB Orchestration**: Manage large volumes of novel drafts, book history, and glossary items.
- **Export Engine**: Convert structured data into sanitized `.docx` and `.epub` formats.
- **Consistency Enforcement**: Validate SHA-256 digests for chunked data to ensure integrity during recovery.

## Implementation Guide
- Use this skill to manage database migrations (`storage-v2.js`).
- Apply sanitized XML/HTML practices when generating export files.
