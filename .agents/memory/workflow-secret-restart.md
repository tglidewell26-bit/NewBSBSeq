---
name: Workflow secret restart
description: Secret updates are not visible to already-running artifact server processes.
---

After changing Replit Secrets, restart the affected artifact workflow before diagnosing configuration-dependent UI state.

**Why:** A running server keeps its original environment and may also be serving an older compiled bundle, causing configuration endpoints to appear missing or disabled.

**How to apply:** Restart the managed server workflow, then verify the relevant health or configuration endpoint before checking the browser.