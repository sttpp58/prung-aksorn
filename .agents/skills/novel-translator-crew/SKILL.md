---
name: novel-translator-crew
description: "Multi-agent translation pipeline based on CrewAI concepts. Handles translation, stylistic refinement, and consistency checks using specialized role-based agent tasks."
---

# novel-translator-crew

## Roles & Tasks
1. **Translator Agent**: Performs literal and context-aware translation.
2. **Editor Agent**: Refines Thai grammar and prose flow based on genre settings.
3. **Consistency Agent**: Monitors glossary terms and stylistic consistency.

## Implementation Guide
- Use this skill to orchestrate `tqg.js` translation tasks.
- Ensure all chunks pass through the Proofreader role before being saved to IndexedDB.
