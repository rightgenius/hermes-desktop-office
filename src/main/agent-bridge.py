#!/usr/bin/env python3
"""
Hermes Agent Bridge for GUI communication.
Reads JSON messages from stdin, calls AIAgent.chat(), writes responses to stdout.

Usage: python3 bridge.py <hermes-agent-dir>

Protocol:
  Input:  {"type": "message", "content": "user message", "history": [...]}\n
  Output: {"type": "ready"}\n
          {"type": "start"}\n
          {"type": "chunk", "text": "..."}\n
          {"type": "done", "text": "full response"}\n
          {"type": "error", "message": "..."}\n
"""

import json
import os
import sys
import threading
import uuid

# Blocking state for interactive prompts (clarify, sudo, secret)
_pending_responses = {}  # request_id -> {"event": threading.Event, "answer": str}
_pending_lock = threading.Lock()


def _emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()

# hermes-agent directory is passed as first argument
hermes_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'hermes-agent')
hermes_dir = os.path.abspath(hermes_dir)
if hermes_dir not in sys.path:
    sys.path.insert(0, hermes_dir)

from run_agent import AIAgent
import hermes_logging

def _block_for_input(event_type, payload, timeout=300):
    """Block until the GUI responds, mirroring the TUI gateway _block mechanism.

    Generates a unique request_id, sends the event to stdout, blocks on a threading.Event,
    and returns the user's answer when _pending_responses is populated by stdin 'respond' message.
    """
    rid = uuid.uuid4().hex[:8]
    ev = threading.Event()
    with _pending_lock:
        _pending_responses[rid] = {"event": ev, "answer": ""}
    payload["request_id"] = rid
    _emit({"type": event_type, **payload})
    if not ev.wait(timeout=timeout):
        with _pending_lock:
            _pending_responses.pop(rid, None)
        return ""
    with _pending_lock:
        answer = _pending_responses.pop(rid, {}).get("answer", "")
    return answer


def main():
    hermes_logging.setup_logging(log_level="WARNING")
    
    # Configure agent from environment
    agent = AIAgent(
        base_url=os.getenv("HERMES_BASE_URL") or os.getenv("OPENROUTER_BASE_URL"),
        api_key=os.getenv("HERMES_API_TOKEN") or os.getenv("OPENAI_API_KEY"),
        provider=os.getenv("HERMES_INFERENCE_PROVIDER"),
        model=os.getenv("HERMES_MODEL") or os.getenv("HERMES_INFERENCE_MODEL"),
        max_iterations=int(os.getenv("HERMES_MAX_TURNS", "60")),
        quiet_mode=True,
        save_trajectories=False,
        # Thinking / reasoning callbacks
        thinking_callback=lambda text: _emit({"type": "thinking", "text": text}),
        reasoning_callback=lambda text: _emit({"type": "reasoning", "text": text}),
        # Tool execution callbacks
        tool_gen_callback=lambda name: _emit({"type": "tool_gen", "name": name}),
        tool_progress_callback=lambda event_type, name=None, preview=None, _args=None, **kwargs: _emit({
            "type": "tool_progress",
            "event": event_type,
            "name": name or "",
            "preview": preview or "",
            **({k: v for k, v in kwargs.items() if k in ("duration", "is_error")} if kwargs else {})
        }),
        tool_start_callback=lambda tool_call_id, name, args: _emit({
            "type": "tool_start",
            "tool_id": tool_call_id,
            "name": name,
            "args": json.dumps(args, ensure_ascii=False) if isinstance(args, dict) else str(args)
        }),
        tool_complete_callback=lambda tool_call_id, name, args, result: _emit({
            "type": "tool_complete",
            "tool_id": tool_call_id,
            "name": name,
            "args": json.dumps(args, ensure_ascii=False) if isinstance(args, dict) else str(args),
            "result": str(result)[:2000]
        }),
        # Interactive prompt callbacks (blocking)
        clarify_callback=lambda question, choices: _block_for_input("clarify_request", {
            "question": question,
            "choices": json.dumps(choices, ensure_ascii=False) if choices else None
        }),
        status_callback=lambda kind, text: _emit({"type": "status", "kind": kind, "text": text}),
    )

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
            _emit({"type": "error", "message": "Invalid JSON"})
            continue

        if msg.get("type") == "respond":
            rid = msg.get("request_id", "")
            answer = msg.get("answer", "")
            with _pending_lock:
                if rid in _pending_responses:
                    _pending_responses[rid]["answer"] = answer
                    _pending_responses[rid]["event"].set()
            continue

        if msg.get("type") == "message":
            content = msg.get("content", "")
            history = msg.get("history", [])
            if not content:
                _emit({"type": "error", "message": "Empty message"})
                continue

            try:
                def on_chunk(text):
                    _emit({"type": "chunk", "text": text})

                _emit({"type": "start"})

                # Build the full message with history context
                if history:
                    # Prepend history to the current message so the agent has context
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
                _emit({"type": "done", "text": result})

            except Exception as e:
                _emit({"type": "error", "message": str(e)})

        elif msg.get("type") == "stop":
            _emit({"type": "stopped"})

        elif msg.get("type") == "ping":
            _emit({"type": "pong"})


if __name__ == "__main__":
    main()
