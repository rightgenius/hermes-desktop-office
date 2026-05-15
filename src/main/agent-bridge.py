#!/usr/bin/env python3
"""
Hermes Agent Bridge for GUI communication.
Supports multiple concurrent sessions, each with its own AIAgent instance.

Usage: python3 bridge.py <hermes-agent-dir>

Protocol:
  Input:  {"type": "message", "session_id": "xxx", "content": "...", "history": [...]}
  Output: {"type": "ready"}
          {"type": "start", "session_id": "xxx"}
          {"type": "chunk", "session_id": "xxx", "text": "..."}
          {"type": "done", "session_id": "xxx", "text": "..."}
          {"type": "error", "session_id": "xxx", "message": "..."}
          {"type": "reasoning", "session_id": "xxx", "text": "..."}
          {"type": "thinking", "session_id": "xxx", "text": "..."}
          {"type": "tool_start", "session_id": "xxx", ...}
          {"type": "tool_complete", "session_id": "xxx", ...}
          {"type": "clarify_request", "session_id": "xxx", ...}
"""

import json
import os
import signal
import subprocess
import sys
import threading
import uuid

# hermes-agent directory is passed as first argument
hermes_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'hermes-agent')
hermes_dir = os.path.abspath(hermes_dir)
if hermes_dir not in sys.path:
    sys.path.insert(0, hermes_dir)

from run_agent import AIAgent
import hermes_logging


def _emit(obj):
    """Emit a JSON message to stdout."""
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


# Session management
_sessions = {}  # session_id -> AIAgent instance
_sessions_lock = threading.Lock()

# Blocking state for interactive prompts (clarify, sudo, secret)
# Keyed by (session_id, request_id) to support concurrent sessions
_pending_responses = {}  # (session_id, request_id) -> {"event": threading.Event, "answer": str}
_pending_lock = threading.Lock()


def _block_for_input(session_id, event_type, payload, timeout=300):
    """Block until the GUI responds, mirroring the TUI gateway _block mechanism."""
    rid = uuid.uuid4().hex[:8]
    ev = threading.Event()
    key = (session_id, rid)
    with _pending_lock:
        _pending_responses[key] = {"event": ev, "answer": ""}
    payload["request_id"] = rid
    payload["session_id"] = session_id
    _emit({"type": event_type, **payload})
    if not ev.wait(timeout=timeout):
        with _pending_lock:
            _pending_responses.pop(key, None)
        return ""
    with _pending_lock:
        answer = _pending_responses.pop(key, {}).get("answer", "")
    return answer


def _get_or_create_agent(session_id):
    """Get or create an AIAgent instance for the given session_id."""
    with _sessions_lock:
        if session_id not in _sessions:
            hermes_logging.setup_logging(log_level="WARNING")
            agent = AIAgent(
                base_url=os.getenv("HERMES_BASE_URL") or os.getenv("OPENROUTER_BASE_URL"),
                api_key=os.getenv("HERMES_API_TOKEN") or os.getenv("OPENAI_API_KEY"),
                provider=os.getenv("HERMES_INFERENCE_PROVIDER"),
                model=os.getenv("HERMES_MODEL") or os.getenv("HERMES_INFERENCE_MODEL"),
                max_iterations=int(os.getenv("HERMES_MAX_TURNS", "60")),
                quiet_mode=True,
                save_trajectories=False,
                # Thinking / reasoning callbacks
                thinking_callback=lambda text: _emit({"type": "thinking", "session_id": session_id, "text": text}),
                reasoning_callback=lambda text: _emit({"type": "reasoning", "session_id": session_id, "text": text}),
                # Tool execution callbacks
                tool_gen_callback=lambda name: _emit({"type": "tool_gen", "session_id": session_id, "name": name}),
                tool_progress_callback=lambda event_type, name=None, preview=None, _args=None, **kwargs: _emit({
                    "type": "tool_progress",
                    "session_id": session_id,
                    "event": event_type,
                    "name": name or "",
                    "preview": preview or "",
                    **({k: v for k, v in kwargs.items() if k in ("duration", "is_error")} if kwargs else {})
                }),
                tool_start_callback=lambda tool_call_id, name, args: _emit({
                    "type": "tool_start",
                    "session_id": session_id,
                    "tool_id": tool_call_id,
                    "name": name,
                    "args": json.dumps(args, ensure_ascii=False) if isinstance(args, dict) else str(args)
                }),
                tool_complete_callback=lambda tool_call_id, name, args, result: _emit({
                    "type": "tool_complete",
                    "session_id": session_id,
                    "tool_id": tool_call_id,
                    "name": name,
                    "args": json.dumps(args, ensure_ascii=False) if isinstance(args, dict) else str(args),
                    "result": str(result)[:2000]
                }),
                # Interactive prompt callbacks (blocking)
                clarify_callback=lambda question, choices: _block_for_input(session_id, "clarify_request", {
                    "question": question,
                    "choices": json.dumps(choices, ensure_ascii=False) if choices else None
                }),
                status_callback=lambda kind, text: _emit({"type": "status", "session_id": session_id, "kind": kind, "text": text}),
            )
            _sessions[session_id] = agent
        return _sessions[session_id]


def _handle_message(msg):
    """Handle a message request in a separate thread."""
    session_id = msg.get("session_id", "")
    content = msg.get("content", "")
    history = msg.get("history", [])
    workspace_path = msg.get("workspace_path", "")

    if not content:
        _emit({"type": "error", "session_id": session_id, "message": "Empty message"})
        return

    try:
        # Set TERMINAL_CWD for this session's workspace and chdir so
        # os.getcwd() and the terminal tool's default cwd both follow.
        # Only set if workspace_path is a valid non-empty directory.
        if workspace_path and workspace_path.strip():
            workspace_path = workspace_path.strip()
            os.environ["TERMINAL_CWD"] = workspace_path
            os.chdir(workspace_path)
        elif "TERMINAL_CWD" not in os.environ:
            os.environ["TERMINAL_CWD"] = os.getcwd()

        agent = _get_or_create_agent(session_id)

        def on_chunk(text):
            _emit({"type": "chunk", "session_id": session_id, "text": text})

        _emit({"type": "start", "session_id": session_id})

        # Build the full message with history context
        if history:
            context_parts = []
            for h in history:
                role = h.get("role", "unknown")
                text = h.get("content", "")
                if role == "user":
                    context_parts.append(f"User: {text}")
                elif role == "assistant":
                    context_parts.append(f"Assistant: {text}")
            context = "\n\n".join(context_parts)
            full_message = f"Previous conversation:\n{context}\n\nNow please respond to: {content}"
        else:
            full_message = content

        result = agent.chat(full_message, stream_callback=on_chunk)
        _emit({"type": "done", "session_id": session_id, "text": result})

    except Exception as e:
        _emit({"type": "error", "session_id": session_id, "message": str(e)})


def _handle_respond(msg):
    """Handle a respond message (answer to clarify/sudo/secret prompt)."""
    session_id = msg.get("session_id", "")
    rid = msg.get("request_id", "")
    answer = msg.get("answer", "")
    key = (session_id, rid)
    with _pending_lock:
        if key in _pending_responses:
            _pending_responses[key]["answer"] = answer
            _pending_responses[key]["event"].set()


def _handle_stop(msg):
    """Handle a stop message."""
    session_id = msg.get("session_id", "")
    # For now, just emit stopped. Full interrupt support would require
    # setting _interrupt_requested on the AIAgent instance.
    _emit({"type": "stopped", "session_id": session_id})


def _handle_set_workspace(msg):
    """Handle a set_workspace message to update TERMINAL_CWD and chdir."""
    session_id = msg.get("session_id", "")
    workspace_path = msg.get("workspace_path", "")
    if workspace_path and workspace_path.strip():
        workspace_path = workspace_path.strip()
        os.environ["TERMINAL_CWD"] = workspace_path
        os.chdir(workspace_path)
        _emit({"type": "workspace_set", "session_id": session_id, "workspace_path": workspace_path})


def main():
    # Signal ready
    _emit({"type": "ready"})

    # Read messages from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            _emit({"type": "error", "session_id": "", "message": "Invalid JSON"})
            continue

        msg_type = msg.get("type", "")

        if msg_type == "respond":
            _handle_respond(msg)
        elif msg_type == "message":
            # Handle each message in a separate thread for concurrency
            t = threading.Thread(target=_handle_message, args=(msg,), daemon=True)
            t.start()
        elif msg_type == "stop":
            _handle_stop(msg)
        elif msg_type == "set_workspace":
            _handle_set_workspace(msg)
        elif msg_type == "ping":
            _emit({"type": "pong"})


if __name__ == "__main__":
    main()
