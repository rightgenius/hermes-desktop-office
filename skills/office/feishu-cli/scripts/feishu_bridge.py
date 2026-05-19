#!/usr/bin/env python3
"""
飞书混合消息方案：Webhook 触发 + CLI 读取上下文

工作流程：
1. 用户在群里 @webhook 机器人触发通知（可选）
2. 我通过 CLI 读取群消息上下文
3. 通过 webhook 回复消息

配置说明：
- 从环境变量或配置文件读取 WEBHOOK_URL 和 SECRET
- 配置文件路径：~/.hermes/config/feishu_webhook.json
"""
import json
import subprocess
import requests
import base64
import hashlib
import time
import hmac
import os
from pathlib import Path

# 加载配置
def load_config():
    """从配置文件加载 webhook 配置"""
    config_path = Path.home() / ".hermes" / "config" / "feishu_webhook.json"
    if config_path.exists():
        with open(config_path) as f:
            return json.load(f)
    return {}

config = load_config()

# 配置（优先从环境变量，其次配置文件）
WEBHOOK_URL = os.environ.get("FEISHU_WEBHOOK_URL") or config.get("webhook_url", "")
SECRET = os.environ.get("FEISHU_WEBHOOK_SECRET") or config.get("secret", "")
CHAT_ID = os.environ.get("FEISHU_CHAT_ID") or config.get("chat_id", "")

def gen_sign(timestamp, secret):
    """生成飞书自定义机器人签名"""
    string_to_sign = f"{timestamp}\n{secret}"
    hmac_code = hmac.new(string_to_sign.encode("utf-8"), digestmod=hashlib.sha256).digest()
    sign = base64.b64encode(hmac_code).decode('utf-8')
    return sign

def send_webhook_message(text):
    """通过 webhook 发送消息"""
    if not WEBHOOK_URL or not SECRET:
        return {"error": "WEBHOOK_URL or SECRET not configured"}
    
    timestamp = int(time.time())
    sign = gen_sign(timestamp, SECRET)
    
    message = {
        "timestamp": str(timestamp),
        "sign": sign,
        "msg_type": "text",
        "content": {
            "text": text
        }
    }
    
    try:
        response = requests.post(WEBHOOK_URL, json=message, timeout=30)
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def get_chat_messages(chat_id=None, limit=20):
    """通过 CLI 获取群消息"""
    chat_id = chat_id or CHAT_ID
    
    if not chat_id:
        return []
    
    try:
        result = subprocess.run(
            ["lark-cli", "im", "+chat-messages-list", 
             "--chat-id", chat_id, 
             "--format", "json"],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        data = json.loads(result.stdout)
        if data.get("ok"):
            messages = data.get("data", {}).get("messages", [])
            return messages[:limit]
        else:
            return []
    except Exception as e:
        print(f"Error getting messages: {e}")
        return []

def get_recent_conversation(limit=10):
    """获取最近的对话上下文"""
    messages = get_chat_messages(limit=limit)
    
    # 过滤出用户和机器人的消息
    conversation = []
    for msg in reversed(messages):  # 按时间正序
        sender = msg.get("sender", {})
        sender_name = sender.get("name", "Unknown")
        sender_type = sender.get("sender_type", "")
        content = msg.get("content", "")
        msg_type = msg.get("msg_type", "")
        
        if msg_type == "text":
            conversation.append({
                "sender": sender_name,
                "type": sender_type,
                "content": content,
                "time": msg.get("create_time", "")
            })
    
    return conversation

def reply_to_chat(text):
    """回复群消息（通过 webhook）"""
    return send_webhook_message(text)

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python feishu_bridge.py <command> [args]")
        print("Commands:")
        print("  send <message>     - 发送消息到群")
        print("  read               - 读取最近消息")
        print("  context            - 获取对话上下文")
        print("\nConfiguration:")
        print("  Set FEISHU_WEBHOOK_URL, FEISHU_WEBHOOK_SECRET, FEISHU_CHAT_ID")
        print("  Or create ~/.hermes/config/feishu_webhook.json")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "send":
        message = " ".join(sys.argv[2:])
        result = send_webhook_message(message)
        print(json.dumps(result, indent=2, ensure_ascii=False))
    
    elif command == "read":
        messages = get_chat_messages()
        for msg in messages:
            sender = msg.get("sender", {}).get("name", "Unknown")
            content = msg.get("content", "")[:50]
            print(f"[{sender}] {content}...")
    
    elif command == "context":
        conversation = get_recent_conversation()
        for msg in conversation:
            print(f"[{msg['sender']}] {msg['content'][:100]}")
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
