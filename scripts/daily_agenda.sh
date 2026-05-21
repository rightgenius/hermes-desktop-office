#!/bin/bash
# 每日日程推送 - 每天早上 6:45 执行
cd /Users/nius/dev/hermes-desktop-office
python3 scripts/daily_agenda.py >> /tmp/daily_agenda.log 2>&1
