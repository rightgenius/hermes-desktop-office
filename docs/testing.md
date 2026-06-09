# 测试入口说明

## 快速选择

| 场景 | 命令 | 说明 |
|------|------|------|
| 主进程/工具逻辑 | `npm run test:main` | Node test runner，覆盖 Agent/Gateway/renderer 静态回归 |
| Skill 扫描器 | `npm run test:scanner` | 验证 builtin/user/agent skill 扫描逻辑 |
| Skills 页面 E2E | `npm run test:e2e` | Playwright 验证 skills 页面关键流程 |
| Gateway 页面 E2E | `npm run test:e2e:gateway` | Electron UI 脚本验证 Gateway 页面 |
| 打包应用 smoke | `npm run test:packaged` | 需要先设置 `PACKAGED_APP_PATH` 或由 CI 构建步骤注入 |

## 推荐本地检查顺序

普通代码改动：

```bash
npm run test:main
```

涉及 Skills 管理：

```bash
npm run test:scanner
npm run test:e2e
```

涉及 Gateway：

```bash
npm run test:main
npm run test:e2e:gateway
```

涉及打包、资源路径、Python runtime、CLI 二进制：

```bash
npm run prebuild:mac
npm run build:mac
PACKAGED_APP_PATH="$(find dist -path '*/Contents/MacOS/*' -type f | head -n 1)" npm run test:packaged
```

## CI 覆盖

`.github/workflows/ci.yml` 在 `main` push 和 PR 上构建 macOS、Windows、Linux，并运行 packaged smoke。`.github/workflows/release.yml` 在 `v*` tag 上构建发布产物并创建 GitHub Release。
