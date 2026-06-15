# Approval Prompt Recovery Design

## Goal

Ensure interactive Agent prompts always use the desktop UI, never corrupt the
bridge JSON protocol, and can always be dismissed without leaving chat stuck in
the generating state.

## Root Cause

Hermes stores approval, sudo, and secret callbacks in `threading.local()`.
`agent-bridge.py` currently installs those callbacks only while creating an
`AIAgent`. Later messages for the same desktop session run in new worker
threads, so those threads fall back to terminal `input()`. The terminal prompt
then consumes JSON messages intended for the bridge and emits `Invalid JSON`.

The renderer builds each prompt variant separately and has no common close
control. It also leaves a prompt visible when the corresponding request reaches
an error, completion, or stopped terminal state.

## Design

1. Store each session's interactive callback functions alongside its Agent.
2. Bind those callbacks in every `_handle_message` worker thread immediately
   before calling `agent.chat()`.
3. Keep all changes in `src/main/agent-bridge.py`; do not modify the Hermes
   submodule.
4. Add a shared close button to every renderer prompt. Closing submits a safe
   cancellation answer: `deny` for approvals and an empty answer otherwise.
5. Replace an existing prompt before showing another prompt, and remove prompts
   when the matching session completes, errors, or stops.

## Testing

- Extend the bridge end-to-end test to send two messages through the same
  session and verify both produce `approval_request` events.
- Add renderer regression assertions for the shared close control, safe
  cancellation mapping, prompt replacement, and terminal-state cleanup.
- Run the focused tests, the complete main-process test suite, and a development
  startup smoke check.
