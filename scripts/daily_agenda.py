#!/usr/bin/env python3
"""每日日程推送：查询今天日程并通过钉钉单聊发送给用户。"""

import json
import subprocess
import sys
from datetime import datetime, timedelta, timezone

TZ = timezone(timedelta(hours=8))
USER_ID = "1423025636364102"


def run_cmd(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        print(f"命令失败: {' '.join(cmd)}\nstderr: {result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout


def get_today_events():
    today = datetime.now(TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    start = today.strftime('%Y-%m-%dT%H:%M:%S+08:00')
    end = tomorrow.strftime('%Y-%m-%dT%H:%M:%S+08:00')

    output = run_cmd([
        'dws', 'calendar', 'event', 'list',
        '--start', start, '--end', end, '--format', 'json'
    ])
    data = json.loads(output)

    events = []
    if isinstance(data, list):
        events = data
    elif isinstance(data, dict):
        result = data.get('result', {})
        if isinstance(result, dict):
            events = result.get('events', [])
        elif isinstance(result, list):
            events = result
        else:
            events = data.get('events', [])
    return events


def fmt_time(iso_str):
    if not iso_str:
        return "??:??"
    try:
        for fmt in ('%Y-%m-%dT%H:%M:%S%z', '%Y-%m-%dT%H:%M:%S'):
            try:
                dt = datetime.strptime(iso_str, fmt)
                return dt.strftime('%H:%M')
            except ValueError:
                continue
        return iso_str[11:16]
    except Exception:
        return iso_str[11:16] if len(iso_str) > 16 else "??:??"


def build_message(events):
    today = datetime.now(TZ)
    weekday = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][today.weekday()]
    date_str = today.strftime('%m月%d日')

    lines = [f"☀️ 早安！今天是 {date_str} {weekday}", ""]

    if not events:
        lines.append("✅ 今天没有日程安排，自由安排吧！")
        return "\n".join(lines)

    lines.append(f"📋 今日日程（共 {len(events)} 场）：")
    lines.append("")

    for e in events:
        title = e.get('summary') or e.get('title', '无标题')
        start_t = fmt_time(
            e.get('start', {}).get('dateTime', '') if isinstance(e.get('start'), dict) else str(e.get('start', ''))
        )
        end_t = fmt_time(
            e.get('end', {}).get('dateTime', '') if isinstance(e.get('end'), dict) else str(e.get('end', ''))
        )
        loc = e.get('location', {})
        loc_str = loc.get('displayName', '') if isinstance(loc, dict) else str(loc or '')

        line = f"  🕐 {start_t}-{end_t}  {title}"
        if loc_str:
            line += f"  📍{loc_str}"
        lines.append(line)

    return "\n".join(lines)


def send_message(text):
    # 通过 --text flag 发送，用 Python subprocess 直接传参避免 shell 转义问题
    run_cmd([
        'dws', 'chat', 'message', 'send',
        '--user', USER_ID,
        '--title', '今日日程',
        '--text', text,
        '--format', 'json'
    ])


def main():
    print("查询今日日程...")
    events = get_today_events()
    msg = build_message(events)
    print(msg)
    print("\n发送中...")
    send_message(msg)
    print("✅ 已发送！")


if __name__ == '__main__':
    main()
