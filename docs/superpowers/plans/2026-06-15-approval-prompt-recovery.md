# Approval Prompt Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep repeated interactive approvals on the GUI bridge path and make every prompt safely dismissible.

**Architecture:** Rebind Hermes thread-local callbacks in each bridge message worker, using callbacks stored per session. Centralize renderer prompt cancellation and terminal cleanup around the existing prompt overlay functions.

**Tech Stack:** Python bridge, Electron renderer JavaScript/CSS, Node test runner, Python subprocess end-to-end test.

---

### Task 1: Repeated-session bridge approval

**Files:**
- Modify: `tests/test-bridge-approval-e2e.py`
- Modify: `src/main/agent-bridge.py`

- [ ] Add a test that sends a second message to the same session and expects another `approval_request`.
- [ ] Run `python3 tests/test-bridge-approval-e2e.py` and confirm the repeated-session assertion fails.
- [ ] Store interactive callbacks per session and bind them in each `_handle_message` worker before `agent.chat()`.
- [ ] Run `python3 tests/test-bridge-approval-e2e.py` and confirm it passes.

### Task 2: Prompt close and terminal cleanup

**Files:**
- Modify: `tests/main/test-renderer-regressions.js`
- Modify: `src/renderer/app.js`
- Modify: `src/renderer/styles.css`

- [ ] Add assertions for a common close button, safe cancellation, prompt replacement, and matching-session terminal cleanup.
- [ ] Run `node --test tests/main/test-renderer-regressions.js` and confirm the new assertions fail.
- [ ] Add shared prompt header/close markup and cancellation handling.
- [ ] Remove an existing prompt before replacement and on matching terminal events.
- [ ] Run `node --test tests/main/test-renderer-regressions.js` and confirm it passes.

### Task 3: Verification

**Files:**
- Verify all modified files above.

- [ ] Run `npm run test:main`.
- [ ] Run `python3 tests/test-bridge-approval-e2e.py`.
- [ ] Run a bounded `npm run dev` startup smoke check and confirm Electron starts without an immediate renderer error.
- [ ] Review `git diff --check` and the final diff.
