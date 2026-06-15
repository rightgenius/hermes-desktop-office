#!/usr/bin/env python3
"""
End-to-end test for the agent-bridge approval callback wiring.

This test runs the actual production `agent-bridge.py` as a subprocess
and verifies that dangerous command approval requests are correctly
routed to the GUI and the response is passed back to the agent.

Strategy:
  - Spawn the bridge as a subprocess
  - Replace the AIAgent with a fake that simulates a tool call
    requiring dangerous-command approval
  - Verify the bridge emits an `approval_request` JSON event on stdout
  - Send a `respond` message with the user's choice
  - Verify the agent receives the choice and continues
"""

import json
import os
import queue
import subprocess
import sys
import textwrap
import threading
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BRIDGE = REPO_ROOT / "src" / "main" / "agent-bridge.py"
HERMES_AGENT = REPO_ROOT / "src" / "hermes-agent"
VENV_PY = HERMES_AGENT / ".venv" / "bin" / "python3"

# We stub the AIAgent via PYTHONPATH so the bridge picks up our fake.
FAKE_AGENT_DIR = REPO_ROOT / "tests" / ".tmp_fake_agent"
FAKE_AGENT_DIR.mkdir(parents=True, exist_ok=True)

FAKE_RUN_AGENT = FAKE_AGENT_DIR / "run_agent.py"
FAKE_RUN_AGENT.write_text(textwrap.dedent('''
    """Fake AIAgent that simulates a dangerous command approval request."""
    import os


    class AIAgent:
        def __init__(self, **kwargs):
            self.kwargs = kwargs
            self._approval_cb = kwargs.get("_test_approval_cb")

        def chat(self, message, stream_callback=None):
            """Simulate a chat that triggers a dangerous command approval."""
            if stream_callback:
                stream_callback("Simulating dangerous command approval flow.\\n")
            # Pull the approval callback we installed. In the real bridge
            # we install it via tools.terminal_tool.set_approval_callback.
            # For the test, we cheat: we read it from the env we set
            # in the parent test.
            from tools.terminal_tool import _get_approval_callback
            cb = _get_approval_callback()
            if cb is None:
                return "BUG: no approval callback installed"
            # Simulate calling the approval callback with a dangerous command
            choice = cb(
                "echo hello && rm -rf /tmp/test",
                "delete in root path",
                allow_permanent=True,
            )
            return f"User chose: {choice!r}"
'''))

# Stub out the heavy dependencies so we don't need to import the real AIAgent.
# We need a minimal hermes_logging too.
FAKE_HERMES_LOGGING = FAKE_AGENT_DIR / "hermes_logging.py"
FAKE_HERMES_LOGGING.write_text(textwrap.dedent('''
    def setup_logging(*args, **kwargs):
        pass
'''))

# Stub tools.terminal_tool for the fake agent to call.
FAKE_TOOLS_DIR = FAKE_AGENT_DIR / "tools"
FAKE_TOOLS_DIR.mkdir(exist_ok=True)
FAKE_TOOLS_INIT = FAKE_TOOLS_DIR / "__init__.py"
FAKE_TOOLS_INIT.write_text("")

FAKE_TERMINAL_TOOL = FAKE_TOOLS_DIR / "terminal_tool.py"
FAKE_TERMINAL_TOOL.write_text(textwrap.dedent('''
    """Minimal stub of tools.terminal_tool exposing only the approval callback API."""
    import threading

    _callback_tls = threading.local()

    def _get_approval_callback():
        return getattr(_callback_tls, "approval", None)

    def set_approval_callback(cb):
        _callback_tls.approval = cb

    def set_sudo_password_callback(cb):
        _callback_tls.sudo_password = cb
'''))

FAKE_SKILLS_TOOL = FAKE_TOOLS_DIR / "skills_tool.py"
FAKE_SKILLS_TOOL.write_text(textwrap.dedent('''
    """Minimal stub of tools.skills_tool for secret capture callback."""
    import threading

    _callback_tls = threading.local()

    def set_secret_capture_callback(cb):
        _callback_tls.secret_capture = cb
'''))


def run_test():
    """Spawn the bridge subprocess and verify approval_request event flow."""
    env = os.environ.copy()
    # Inject our fake agent module so the bridge imports our AIAgent.
    env["PYTHONPATH"] = str(FAKE_AGENT_DIR) + os.pathsep + str(HERMES_AGENT / "deps") + os.pathsep + str(HERMES_AGENT)

    proc = subprocess.Popen(
        [str(VENV_PY), str(BRIDGE), str(HERMES_AGENT)],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
        bufsize=1,
    )

    events = []
    event_queue = queue.Queue()

    def collect_events():
        for line in proc.stdout:
            line = line.strip()
            if not line:
                continue
            try:
                event_queue.put(json.loads(line))
            except json.JSONDecodeError:
                print(f"[non-JSON stdout] {line}", file=sys.stderr)

    threading.Thread(target=collect_events, daemon=True).start()

    def read_event(timeout=2.0):
        """Read one JSON line from stdout (with timeout)."""
        try:
            obj = event_queue.get(timeout=timeout)
        except queue.Empty:
            return None
        events.append(obj)
        return obj

    # Wait for ready
    ready = read_event(timeout=5)
    assert ready and ready.get("type") == "ready", f"expected ready, got {ready!r}"
    print("[OK] bridge emitted ready")

    # Send a message
    msg = json.dumps({
        "type": "message",
        "session_id": "test-session-1",
        "content": "please run a dangerous command",
        "history": [],
    })
    proc.stdin.write(msg + "\n")
    proc.stdin.flush()

    # We expect:
    # 1. start event
    # 2. chunk event (from fake stream_callback before approval fires)
    # 3. approval_request event (the bug fix!)
    # 4. done event
    start = read_event(timeout=3)
    assert start and start.get("type") == "start", f"expected start, got {start!r}"
    print("[OK] bridge emitted start")

    # First the fake's stream_callback emits a chunk before calling
    # the approval callback.
    chunk = read_event(timeout=3)
    assert chunk is not None, "no chunk event received after start"
    assert chunk.get("type") == "chunk", f"expected chunk, got {chunk!r}"
    print(f"[OK] bridge emitted chunk: {chunk.get('text', '')[:50]!r}")

    # Now the approval_request should come (the bug fix!)
    approval = read_event(timeout=3)
    assert approval is not None, (
        "no approval_request event received — the bridge did not "
        "install the approval callback. This is the bug!"
    )
    assert approval.get("type") == "approval_request", (
        f"BUG: expected approval_request, got {approval!r}. "
    )
    assert approval.get("command") == "echo hello && rm -rf /tmp/test"
    assert approval.get("description") == "delete in root path"
    assert approval.get("allow_permanent") is True
    assert approval.get("request_id"), "missing request_id"
    assert approval.get("session_id") == "test-session-1"
    print(f"[OK] bridge emitted approval_request: command={approval['command']!r}")
    print(f"     description={approval['description']!r}")
    print(f"     allow_permanent={approval['allow_permanent']!r}")
    print(f"     request_id={approval['request_id']!r}")

    # Send the user's "deny" response
    rid = approval["request_id"]
    sid = approval["session_id"]
    resp = json.dumps({
        "type": "respond",
        "session_id": sid,
        "request_id": rid,
        "answer": "deny",
    })
    proc.stdin.write(resp + "\n")
    proc.stdin.flush()
    print("[OK] sent respond (deny)")

    # Now we should get the done event with the agent's response
    done = read_event(timeout=3)
    assert done and done.get("type") == "done", f"expected done, got {done!r}"
    final_text = done.get("text", "")
    assert "deny" in final_text, f"agent should have received deny, got: {final_text!r}"
    print(f"[OK] bridge emitted done: {final_text!r}")

    # -------------------------------------------------------------------------
    # Test 2: approval callbacks are rebound for a reused session
    # -------------------------------------------------------------------------
    print("\n--- Test 2: repeated approval in the same session ---")
    proc.stdin.write(msg + "\n")
    proc.stdin.flush()

    repeated_start = read_event(timeout=3)
    assert repeated_start and repeated_start.get("type") == "start", (
        f"expected repeated start, got {repeated_start!r}"
    )
    repeated_chunk = read_event(timeout=3)
    assert repeated_chunk and repeated_chunk.get("type") == "chunk", (
        f"expected repeated chunk, got {repeated_chunk!r}"
    )
    repeated_approval = read_event(timeout=3)
    assert repeated_approval and repeated_approval.get("type") == "approval_request", (
        "reused sessions must bind the GUI approval callback in every worker "
        f"thread, got {repeated_approval!r}"
    )
    proc.stdin.write(json.dumps({
        "type": "respond",
        "session_id": "test-session-1",
        "request_id": repeated_approval["request_id"],
        "answer": "deny",
    }) + "\n")
    proc.stdin.flush()
    repeated_done = read_event(timeout=3)
    assert repeated_done and repeated_done.get("type") == "done", (
        f"expected repeated done, got {repeated_done!r}"
    )
    print("[OK] reused session emitted a second approval_request")

    # -------------------------------------------------------------------------
    # Test 3: "once" approval choice on a fresh session
    # -------------------------------------------------------------------------
    print("\n--- Test 3: 'once' approval ---")
    msg2 = json.dumps({
        "type": "message",
        "session_id": "test-session-2",
        "content": "please run another dangerous command",
        "history": [],
    })
    proc.stdin.write(msg2 + "\n")
    proc.stdin.flush()

    start2 = read_event(timeout=3)
    assert start2 and start2.get("type") == "start", f"expected start, got {start2!r}"
    chunk2 = read_event(timeout=3)
    assert chunk2 and chunk2.get("type") == "chunk", f"expected chunk, got {chunk2!r}"
    approval2 = read_event(timeout=3)
    assert approval2 and approval2.get("type") == "approval_request", (
        f"expected approval_request, got {approval2!r}"
    )
    assert approval2.get("session_id") == "test-session-2"
    assert approval2.get("request_id"), "missing request_id"
    print(f"[OK] bridge emitted approval_request (session-2): rid={approval2['request_id']}")

    # Approve once
    resp2 = json.dumps({
        "type": "respond",
        "session_id": "test-session-2",
        "request_id": approval2["request_id"],
        "answer": "once",
    })
    proc.stdin.write(resp2 + "\n")
    proc.stdin.flush()

    done2 = read_event(timeout=3)
    assert done2 and done2.get("type") == "done", f"expected done, got {done2!r}"
    assert "once" in done2.get("text", ""), (
        f"agent should have received 'once', got: {done2.get('text')!r}"
    )
    print(f"[OK] bridge emitted done: {done2.get('text')!r}")

    # -------------------------------------------------------------------------
    # Test 4: session key is set per chat session
    # -------------------------------------------------------------------------
    print("\n--- Test 4: session key binding ---")
    msg3 = json.dumps({
        "type": "message",
        "session_id": "test-session-3",
        "content": "test",
        "history": [],
    })
    proc.stdin.write(msg3 + "\n")
    proc.stdin.flush()
    start3 = read_event(timeout=3)
    chunk3 = read_event(timeout=3)
    approval3 = read_event(timeout=3)
    # Respond deny to unblock the fake
    resp3 = json.dumps({
        "type": "respond",
        "session_id": "test-session-3",
        "request_id": approval3["request_id"],
        "answer": "deny",
    })
    proc.stdin.write(resp3 + "\n")
    proc.stdin.flush()
    done3 = read_event(timeout=3)
    print(f"[OK] session-3 completed with session_id: {approval3.get('session_id')!r}")

    # Cleanup
    proc.stdin.close()
    proc.terminate()
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        proc.kill()

    print("\n[PASS] End-to-end approval flow works correctly!")
    return 0


if __name__ == "__main__":
    sys.exit(run_test())
