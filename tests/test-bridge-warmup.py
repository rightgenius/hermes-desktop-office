#!/usr/bin/env python3
"""Regression test for desktop bridge startup warmup and session feedback."""

import json
import queue
import subprocess
import tempfile
import textwrap
import threading
import time
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
BRIDGE = REPO_ROOT / "src" / "main" / "agent-bridge.py"
PYTHON = REPO_ROOT / "src" / "hermes-agent" / ".venv" / "bin" / "python3"


def write_fake_runtime(root):
    (root / "run_agent.py").write_text(textwrap.dedent("""
        import time

        time.sleep(0.15)
        _count = 0

        class AIAgent:
            def __init__(self, **kwargs):
                global _count
                _count += 1
                time.sleep(0.25 if _count == 1 else 0.01)

            def chat(self, message, stream_callback=None):
                return "ok"
    """))
    (root / "hermes_logging.py").write_text(
        "def setup_logging(*args, **kwargs):\n    pass\n"
    )
    tools = root / "tools"
    tools.mkdir()
    (tools / "__init__.py").write_text("")
    (tools / "terminal_tool.py").write_text(textwrap.dedent("""
        def set_approval_callback(callback):
            pass

        def set_sudo_password_callback(callback):
            pass
    """))
    (tools / "skills_tool.py").write_text(
        "def set_secret_capture_callback(callback):\n    pass\n"
    )


def main():
    with tempfile.TemporaryDirectory() as tmp:
        fake_runtime = Path(tmp)
        write_fake_runtime(fake_runtime)

        proc = subprocess.Popen(
            [str(PYTHON), str(BRIDGE), str(fake_runtime)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        events = queue.Queue()

        def collect():
            for line in proc.stdout:
                events.put((time.perf_counter(), json.loads(line)))

        threading.Thread(target=collect, daemon=True).start()

        spawned_at = time.perf_counter()
        ready_at, ready = events.get(timeout=5)
        assert ready["type"] == "ready", ready
        assert ready_at - spawned_at >= 0.20, (
            "ready must wait until the cold runtime warmup completes"
        )
        assert ready["startup_ms"] >= 350, (
            "startup_ms must include the cold run_agent import and warmup"
        )

        sent_at = time.perf_counter()
        proc.stdin.write(json.dumps({
            "type": "message",
            "session_id": "session-1",
            "content": "hello",
            "history": [],
        }) + "\n")
        proc.stdin.flush()

        initializing_at, initializing = events.get(timeout=2)
        assert initializing["type"] == "initializing", initializing
        assert initializing_at - sent_at < 0.10, (
            "renderer feedback must not wait for AIAgent construction"
        )

        start_at, start = events.get(timeout=2)
        assert start["type"] == "start", start
        assert start["init_ms"] < 100, start
        assert start_at - sent_at < 0.20, (
            "warmup should make first real session construction fast"
        )

        done_at, done = events.get(timeout=2)
        assert done["type"] == "done", done
        assert done_at >= start_at

        proc.terminate()
        proc.wait(timeout=5)


if __name__ == "__main__":
    main()
