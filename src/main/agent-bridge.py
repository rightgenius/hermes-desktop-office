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
import re
import signal
import subprocess
import sys
import threading
import time
import uuid

_PROCESS_STARTED = time.perf_counter()

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
_session_callbacks = {}  # session_id -> interactive callbacks for thread-local binding
_sessions_lock = threading.Lock()

# Blocking state for interactive prompts (clarify, sudo, secret)
# Keyed by (session_id, request_id) to support concurrent sessions
_pending_responses = {}  # (session_id, request_id) -> {"event": threading.Event, "answer": str}
_pending_lock = threading.Lock()


def _bind_interactive_callbacks(session_id):
    """Install a session's callbacks in the current worker thread."""
    callbacks = _session_callbacks.get(session_id)
    if not callbacks:
        return
    try:
        from tools.terminal_tool import (
            set_approval_callback,
            set_sudo_password_callback,
        )
        from tools.skills_tool import set_secret_capture_callback

        set_approval_callback(callbacks["approval"])
        set_sudo_password_callback(callbacks["sudo"])
        set_secret_capture_callback(callbacks["secret"])
    except ImportError:
        pass


# ---------------------------------------------------------------------------
# Cron policy: blacklist-driven auto-authorization
# ---------------------------------------------------------------------------
# Background cron sessions should never block on GUI modals — that defeats
# the point of scheduled tasks. Instead we layer a deny-list on top of the
# hermes-agent approval pipeline:
#
#   1. HARDLINE_PATTERNS in approval.py always blocks catastrophic commands
#      (rm -rf /, mkfs, dd to block device, shutdown/reboot, sudo -S brute
#      force, fork bomb) — this is in the submodule and we don't touch it.
#   2. DANGEROUS_PATTERNS in approval.py triggers our approval_cb; in cron
#      session, the GUI side (this bridge) decides approve/deny instead of
#      forwarding to a human.
#   3. CRON_DENYLIST here adds an extra layer focused on background-attack
#      patterns the default DANGEROUS_PATTERNS don't cover (network egress,
#      credential access, persistence, container escape, recon).
#
# Mirrors src/main/cron-policy.js BUILTIN_DENYLIST. Keep in sync.
CRON_DENYLIST = [
    # === 网络外联（典型 C2 / 数据外泄通道）===
    (re.compile(r'\bssh\s+(?:-[^\s]+\s+)*-[LRD]\b', re.I),
     'net.reverse_ssh', 'SSH 反向 / 本地 / 动态端口转发（持久化通道）'),
    (re.compile(r'\bssh\s+(?:-[^\s]+\s+)*-o\s+(?:[^\s]+\s+)*ProxyCommand\b', re.I),
     'net.ssh_proxycommand', 'SSH 跳板代理'),
    (re.compile(r'\b(?:nc|ncat|netcat)\b[^\n]*(?:-[a-zA-Z]*e\b|--exec\b)[^\n]*(?:/bin/(?:sh|bash|ash|zsh)|(?:sh|bash|ash|zsh))', re.I),
     'net.nc_exec', 'netcat 反弹 shell（-e / --exec 执行 shell）'),
    (re.compile(r'/dev/tcp/[^\s]+', re.I),
     'net.bash_dev_tcp', 'bash /dev/tcp 反向连接（反弹 shell 经典手法）'),
    (re.compile(r'python[23]?\s+-c\s+[^\n]*(?:socket|subprocess)[^\n]*(?:connect|/bin/(?:sh|bash))', re.I),
     'net.python_reverse_shell', 'Python 一行反弹 shell'),
    (re.compile(r'\bcurl\b[^\n|;&]*\|\s*(?:sudo\s+)?(?:ba)?sh\b', re.I),
     'net.curl_pipe_bash', 'curl 远程脚本直接管道给 bash 执行'),
    (re.compile(r'\bwget\b[^\n|;&]*-O\s*-\s*[^\n|;&]*\|\s*(?:sudo\s+)?(?:ba)?sh\b', re.I),
     'net.wget_pipe_shell', 'wget 远程脚本管道执行'),
    # === 凭证 / Secret 读取 ===
    (re.compile(r'\b(?:cat|less|more|head|tail|strings|xxd|od|base64|file|stat)\b[^\n]*(?:[~`]|\$\{?HOME\}?)\/\.aws\/(?:credentials|config)', re.I),
     'cred.read_aws_creds', '读取 AWS 凭证文件'),
    (re.compile(r'\b(?:cat|less|more|head|tail|strings|xxd|od|base64|file|stat)\b[^\n]*(?:id_rsa|id_ed25519|id_ecdsa|id_dsa|\.ssh/[^/\s]+(?:\.pub)?)', re.I),
     'cred.read_ssh_keys', '读取 SSH 私钥'),
    (re.compile(r'\b(?:cat|less|more|head|tail|strings|xxd|od|base64)\b[^\n]*(?:[~`]|\$\{?HOME\}?)\/\.kube\/config', re.I),
     'cred.read_kube_config', '读取 Kubernetes 配置'),
    (re.compile(r'\b(?:printenv|env)\b[^\n]*\b(?:KEY|TOKEN|SECRET|PASSWORD|API_)\w*\b', re.I),
     'cred.dump_env_secrets', '导出含密钥的环境变量'),
    # === 持久化驻留（装后门）===
    (re.compile(r'\bcrontab\s+(?:-[^\s]+\s+)*(?:-l|-e|-r)\b', re.I),
     'persist.write_crontab', '列出 / 编辑 / 删除 crontab（抢调度）'),
    (re.compile(r'\bsystemctl\s+(?:-[^\s]+\s+)*(?:enable|daemon-reload|preset)\b', re.I),
     'persist.systemctl_enable', '启用 systemd 持久化服务'),
    (re.compile(r'\blaunchctl\s+(?:load|unload)\b', re.I),
     'persist.launchctl_load', 'macOS launchd 持久化'),
    (re.compile(r'>>\s*(?:~?\/?(?:\.?(?:bashrc|zshrc|profile|bash_profile|bash_login|tcshrc|cshrc))|\/etc\/(?:profile|bash\.bashrc|zshenv|fish\.fish))\b', re.I),
     'persist.shell_rc_tamper', '追加写入 shell 启动文件'),
    # === 容器逃逸 / 提权 ===
    (re.compile(r'\bnsenter\b[^\n]*(?:--(?:target|pid)\s+1|-t\s+1\b)', re.I),
     'escape.nsenter', 'nsenter 进入 PID 1 namespace（容器逃逸典型手法）'),
    (re.compile(r'\bunshare\s+(?:-[^\s]+\s+)*--(?:user|map-root-user)\b', re.I),
     'escape.unshare_user', 'unshare 创建用户 namespace（容器逃逸）'),
    (re.compile(r'\bchroot\s+\/\s', re.I),
     'escape.chroot_root', 'chroot 到根目录（隔离破坏）'),
    # === 系统完整性破坏 ===
    (re.compile(r'\bchmod\s+(?:-[^\s]+\s+)*[0-7]*[1357][0-7]{2,3}\s+/\s', re.I),
     'integrity.chmod_777_root', '给根目录加全局权限位（破坏安全位）'),
    (re.compile(r'\bchown\s+(?:-[^\s]+\s+)*-R\s+[^\s]+\s+/(?:etc|usr|var|boot|sbin|bin)\b', re.I),
     'integrity.chown_system', '递归改系统目录属主'),
    (re.compile(r'\b(?:iptables|nft|ufw)\s+[^\n]*\b(?:flush|reset|F)\b', re.I),
     'integrity.firewall_flush', '清空防火墙规则'),
    # === 侦察类（warn 而非 block，单次无害但 cron 后台反复跑可疑）===
    (re.compile(
        r'(?<![a-zA-Z0-9_])('
        r'whoami'
        r'|hostname'
        r'|uname(?:\s+-a)?'
        r'|ifconfig'
        r'|id(?:\s+(?:-[a-zA-Z]+\s+)*(?:\\\$?USER|\$\{?USER\}?|\b[a-zA-Z]+\b))?'
        r'|ip\s+(?:addr|route|link)\b'
        r')(?![a-zA-Z0-9_])', re.I),
     'recon.user_enum', '主机指纹侦察（后台反复跑可能是 beacon）'),
]

# Per-session metadata about cron-ness. Set when _handle_message sees
# is_cron_session=true; consumed by approval_cb to choose policy path.
_session_cron_meta = {}  # session_id -> {"job_id": str|None, "session_id": session_id}


def _evaluate_cron_denylist(command):
    """Match command against CRON_DENYLIST. Returns (rule_id, description) or None."""
    if not command:
        return None
    for regex, rule_id, description in CRON_DENYLIST:
        if regex.search(command):
            return (rule_id, description)
    return None


def _set_session_cron_flag(session_id, cron_job_id):
    """Mark a session as a cron session so approval_cb can apply denylist."""
    if not session_id:
        return
    _session_cron_meta[session_id] = {"job_id": cron_job_id}


def _is_cron_session(session_id):
    meta = _session_cron_meta.get(session_id)
    return bool(meta)


def _emit_cron_decision(session_id, *, decision, rule_id, description, command):
    """Emit a structured decision event for the GUI to record in audit log."""
    meta = _session_cron_meta.get(session_id) or {}
    _emit({
        "type": "cron_decision",
        "session_id": session_id,
        "decision": decision,         # "auto_approve" | "denylist_blocked"
        "rule_id": rule_id,
        "description": description,
        "command": command,
        "cron_job_id": meta.get("job_id"),
    })


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
    """Get or create an AIAgent instance for the given session_id.

    The interactive prompt callbacks (clarify / approval / sudo / secret) are
    installed in three places:

    1. The clarify callback is passed to AIAgent.__init__ because AIAgent
       routes it through the clarify tool.
    2. The approval, sudo, and secret callbacks are installed thread-locally
       via set_approval_callback / set_sudo_password_callback /
       set_secret_capture_callback so the dangerous-command, sudo-password,
       and skills-tool paths in hermes-agent pick them up. They MUST be
       installed in the same thread that calls agent.chat() because the
       approval module stores them in a threading.local().
    """
    with _sessions_lock:
        if session_id not in _sessions:
            hermes_logging.setup_logging(log_level="WARNING")

            def approval_cb(command, description, *, allow_permanent=True):
                # Cron session: never block on GUI modal. Apply denylist policy,
                # emit decision event for audit, then return approve/deny.
                if _is_cron_session(session_id):
                    hit = _evaluate_cron_denylist(command)
                    if hit is not None:
                        rule_id, rule_desc = hit
                        _emit_cron_decision(
                            session_id,
                            decision="denylist_blocked",
                            rule_id=rule_id,
                            description=rule_desc,
                            command=command,
                        )
                        # Return 'deny' so hermes-agent treats the command as blocked.
                        # approval.py:789 documents 'once'|'session'|'always'|'deny'.
                        return "deny"
                    # No denylist hit → auto-approve and audit.
                    _emit_cron_decision(
                        session_id,
                        decision="auto_approve",
                        rule_id=None,
                        description=description or "",
                        command=command,
                    )
                    return "once"

                return _block_for_input(
                    session_id, "approval_request",
                    {
                        "command": command,
                        "description": description,
                        "allow_permanent": allow_permanent,
                },
                timeout=300,
            )

            def sudo_cb():
                return _block_for_input(
                    session_id, "sudo_request", {}, timeout=120,
                )

            def secret_cb(env_var, prompt, metadata=None):
                payload = {"env_var": env_var, "prompt": prompt}
                if metadata:
                    payload["metadata"] = metadata
                val = _block_for_input(
                    session_id, "secret_request", payload, timeout=300,
                )
                if not val:
                    return {
                        "success": True,
                        "stored_as": env_var,
                        "validated": False,
                        "skipped": True,
                        "message": "skipped",
                    }
                from hermes_cli.config import save_env_value_secure
                return {
                    **save_env_value_secure(env_var, val),
                    "skipped": False,
                    "message": "ok",
                }

            _session_callbacks[session_id] = {
                "approval": approval_cb,
                "sudo": sudo_cb,
                "secret": secret_cb,
            }
            _bind_interactive_callbacks(session_id)

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
            agent.background_review_callback = lambda text: _emit({
                "type": "background_review",
                "session_id": session_id,
                "text": text,
            })
            _sessions[session_id] = agent
        return _sessions[session_id]


def _warm_runtime():
    """Populate cold import, provider, and tool caches before reporting ready."""
    warmup_session_id = "__desktop_warmup__"
    _get_or_create_agent(warmup_session_id)
    with _sessions_lock:
        _sessions.pop(warmup_session_id, None)
        _session_callbacks.pop(warmup_session_id, None)


def _handle_message(msg):
    """Handle a message request in a separate thread."""
    session_id = msg.get("session_id", "")
    content = msg.get("content", "")
    history = msg.get("history", [])
    workspace_path = msg.get("workspace_path", "")
    is_cron_session = bool(msg.get("is_cron_session"))
    cron_job_id = msg.get("cron_job_id") or None

    if not content:
        _emit({"type": "error", "session_id": session_id, "message": "Empty message"})
        return

    request_started = time.perf_counter()
    _emit({"type": "initializing", "session_id": session_id})

    # Save and restore env vars we mutate, so cron-session flag doesn't leak
    # across concurrent chat sessions sharing the same Python process.
    _env_save = {}
    try:
        if is_cron_session:
            _set_session_cron_flag(session_id, cron_job_id)
            # Tell hermes-agent's approval.py to take the cron_mode branch
            # (non-interactive: skip approval prompt unless cron_mode=deny).
            _env_save["HERMES_CRON_SESSION"] = os.environ.get("HERMES_CRON_SESSION")
            os.environ["HERMES_CRON_SESSION"] = "1"
        else:
            # Make sure non-cron chat sessions are NOT flagged as cron, even
            # if some earlier run set it and didn't restore (defensive).
            _env_save["HERMES_CRON_SESSION"] = os.environ.get("HERMES_CRON_SESSION")
            os.environ.pop("HERMES_CRON_SESSION", None)

        try:
            # Set TERMINAL_CWD for this session's workspace and chdir so
            # os.getcwd() and the terminal tool's default cwd both follow.
            # Only set if workspace_path is a valid non-empty directory.
            if workspace_path and workspace_path.strip():
                workspace_path = workspace_path.strip()
                _env_save["TERMINAL_CWD"] = os.environ.get("TERMINAL_CWD")
                os.environ["TERMINAL_CWD"] = workspace_path
                os.chdir(workspace_path)
            elif "TERMINAL_CWD" not in os.environ:
                os.environ["TERMINAL_CWD"] = os.getcwd()

            # Bind HERMES_SESSION_KEY to this chat session so the dangerous-command
            # approval system can scope session-level approvals to this chat.
            # Per-chat session keys are required because the bridge handles
            # multiple concurrent chats in this process.
            if session_id:
                _env_save["HERMES_SESSION_KEY"] = os.environ.get("HERMES_SESSION_KEY")
                os.environ["HERMES_SESSION_KEY"] = f"desktop-bridge:{session_id}"

            init_started = time.perf_counter()
            agent = _get_or_create_agent(session_id)
            init_ms = round((time.perf_counter() - init_started) * 1000)
            # Hermes stores these callbacks in threading.local(). Every desktop
            # message uses a fresh worker thread, including reused chat sessions.
            _bind_interactive_callbacks(session_id)

            first_chunk_ms = None

            def on_chunk(text):
                nonlocal first_chunk_ms
                if first_chunk_ms is None:
                    first_chunk_ms = round((time.perf_counter() - request_started) * 1000)
                _emit({"type": "chunk", "session_id": session_id, "text": text})

            _emit({"type": "start", "session_id": session_id, "init_ms": init_ms})

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
            _emit({
                "type": "done",
                "session_id": session_id,
                "text": result,
                "total_ms": round((time.perf_counter() - request_started) * 1000),
                "first_chunk_ms": first_chunk_ms,
            })

        except Exception as e:
            _emit({"type": "error", "session_id": session_id, "message": str(e)})
    finally:
        # Restore env so we don't leak cron-session flag into the next chat.
        for key, prior in _env_save.items():
            if prior is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = prior
        # Drop cron meta after this session ends so a future reuse of the
        # same session_id (e.g. cron manager replaying a job) re-evaluates
        # the flag from the new message rather than carrying over state.
        if is_cron_session:
            _session_cron_meta.pop(session_id, None)


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
    # Enable interactive mode so tools like cronjob are available
    os.environ["HERMES_INTERACTIVE"] = "1"

    try:
        _warm_runtime()
    except Exception as exc:
        _emit({
            "type": "startup_error",
            "message": str(exc),
            "startup_ms": round((time.perf_counter() - _PROCESS_STARTED) * 1000),
        })
        return

    _emit({
        "type": "ready",
        "startup_ms": round((time.perf_counter() - _PROCESS_STARTED) * 1000),
    })

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
