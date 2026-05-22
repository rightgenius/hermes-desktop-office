# Release Notes v0.4.0

## What's New

### Collapsible Tool Calls
- Completed tool calls automatically collapse into a summary badge (e.g. "✓ 5 个工具完成")
- Running tools remain visible with a warning border and spinner
- Click the summary to expand and see individual tool call details
- Each tool call can be further expanded to view arguments and results
- Error counts are shown separately in the summary

### Chinese Tool Names
- All tool calls now display user-friendly Chinese names instead of technical identifiers
- Examples: `terminal` → 执行命令, `read_file` → 读取文件, `skill_view` → 查看技能
- Supports pattern matching for `browser_*`, `mcp_*`, `ha_*`, `feishu_*` prefixed tools

## Improvements

- Separate CI and Release workflows for cleaner automation
- Drop macOS x64 build target (macOS arm64 only)
- Add CI/CD documentation to AGENTS.md
- New E2E test suite for collapsible tool call UI (10 tests)

## Supported Platforms

- macOS arm64
- Windows x64
- Linux x64
