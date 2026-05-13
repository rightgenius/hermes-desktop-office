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

# hermes-agent directory is passed as first argument
hermes_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'hermes-agent')
hermes_dir = os.path.abspath(hermes_dir)
if hermes_dir not in sys.path:
    sys.path.insert(0, hermes_dir)

from run_agent import AIAgent
import hermes_logging

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
    )

    # Signal ready
    sys.stdout.write(json.dumps({"type": "ready"}) + "\n")
    sys.stdout.flush()

    # Read messages from stdin
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            sys.stdout.write(json.dumps({"type": "error", "message": "Invalid JSON"}) + "\n")
            sys.stdout.flush()
            continue

        if msg.get("type") == "message":
            content = msg.get("content", "")
            history = msg.get("history", [])
            if not content:
                sys.stdout.write(json.dumps({"type": "error", "message": "Empty message"}) + "\n")
                sys.stdout.flush()
                continue

            try:
                def on_chunk(text):
                    sys.stdout.write(json.dumps({"type": "chunk", "text": text}) + "\n")
                    sys.stdout.flush()

                sys.stdout.write(json.dumps({"type": "start"}) + "\n")
                sys.stdout.flush()

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
                sys.stdout.write(json.dumps({"type": "done", "text": result}) + "\n")
                sys.stdout.flush()

            except Exception as e:
                sys.stdout.write(json.dumps({"type": "error", "message": str(e)}) + "\n")
                sys.stdout.flush()

        elif msg.get("type") == "stop":
            sys.stdout.write(json.dumps({"type": "stopped"}) + "\n")
            sys.stdout.flush()

        elif msg.get("type") == "ping":
            sys.stdout.write(json.dumps({"type": "pong"}) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
