# 发布/打包验收清单

## 发布前准备

- 确认 `package.json` 版本号已更新。
- 确认 `src/hermes-agent` submodule 指向预期 commit。
- 确认 `npm install` 或 `npm ci` 可正常完成。
- 确认 `npm run download-clis` 能下载当前平台 CLI 二进制。
- 确认新增 Python 依赖已写入 `scripts/bundle-agent-deps.sh`。

## 本地验证

至少运行：

```bash
npm run test:main
npm run test:scanner
```

发布前建议在目标平台运行：

```bash
npm run prebuild:mac
npm run build:mac
PACKAGED_APP_PATH="$(find dist -path '*/Contents/MacOS/*' -type f | head -n 1)" npm run test:packaged
```

Windows 和 Linux 对应使用：

```bash
npm run prebuild:win
npm run build:win
npm run prebuild:linux
npm run build:linux
```

## 产物检查

macOS：
- `dist/*.dmg`
- `dist/*.zip`
- packaged app 能启动并显示主窗口

Windows：
- `dist/*.exe`
- `dist/win-unpacked/*.exe` 能启动

Linux：
- `dist/*.AppImage`
- `dist/*.deb`

功能 smoke：
- 首次启动向导能打开。
- 设置页能保存模型配置。
- Agent 能启动/停止，日志页能过滤、搜索、导出。
- Skills 页面能显示内置 Office skills。
- Gateway 页面在未配置时能显示明确错误状态。

## GitHub Release

1. 创建 `v*` tag 并 push 到 GitHub。
2. 等待 `.github/workflows/release.yml` 完成。
3. 检查 GitHub Release 的安装包、版本号、发布说明。
4. 下载至少一个平台产物做启动 smoke。

## Gitee 同步

GitHub Release 完成后同步 Gitee release notes：

```bash
GITEE_TOKEN=xxx npm run sync:release v0.5.3
```

如需覆盖已有 Gitee Release：

```bash
GITEE_TOKEN=xxx npm run sync:release v0.5.3 --force
```

Gitee 单文件附件限制较低，安装包以 GitHub Release 链接为准。
