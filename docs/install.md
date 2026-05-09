# Hermes Desktop for Office — macOS 安装指南

## 前置要求

| 依赖 | 版本 | 安装方式 |
|------|------|----------|
| Node.js | >= 20 | `brew install node` 或 [nvm](https://github.com/nvm-sh/nvm) |
| Git | >= 2.30 | `brew install git` (macOS 自带) |
| Python 3 | >= 3.9 | `brew install python` (macOS 自带 3.x) |
| 网络代理 | socks5://127.0.0.1:7897 | 用于拉取 GitHub submodule |

## 方式一：开发模式运行

### Step 1: 克隆仓库（含 submodule）

```bash
# 启用代理以拉取 GitHub 仓库
export http_proxy=socks5://127.0.0.1:7897
export https_proxy=socks5://127.0.0.1:7897
export all_proxy=socks5://127.0.0.1:7897

git clone https://github.com/rightgenius/hermes-desktop-office.git
cd hermes-desktop-office
git submodule update --init --recursive
```

### Step 2: 安装 Node 依赖

```bash
npm install
```

如果 npm 默认 registry 慢，可换镜像：
```bash
npm install --registry=https://registry.npmmirror.com
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
```

### Step 3: 放置 CLI 二进制

CLI 工具需要放在 `assets/` 目录下。从本机已安装的环境复制：

```bash
# 飞书 CLI (lark-cli) - 找到已安装的二进制路径
# 方式 A: npm 全局安装的二进制
LARK_PKG=$(npm prefix -g)/lib/node_modules/@larksuite/cli/bin/lark-cli
mkdir -p assets/feishu-cli/darwin-arm64
cp "$LARK_PKG" assets/feishu-cli/darwin-arm64/lark-cli
chmod +x assets/feishu-cli/darwin-arm64/lark-cli

# 方式 B: 如果已通过脚本安装到 ~/.lark-cli/
# 找实际二进制: find ~/.lark-cli -name "lark-cli" -type f

# 钉钉 CLI (dws)
DWS_PKG=$(find $(npm prefix -g)/lib/node_modules/dingtalk-workspace-cli -name "dws" -type f | head -1)
mkdir -p assets/dws-cli/darwin-arm64
cp "$DWS_PKG" assets/dws-cli/darwin-arm64/dws
chmod +x assets/dws-cli/darwin-arm64/dws
```

### Step 4: 启动应用

```bash
# 开发模式（自动打开 DevTools）
NODE_ENV=development npx electron .

# 或者直接运行
npx electron .
```

## 方式二：打包安装

### 构建打包

```bash
# 确保 CLI 二进制已放置到 assets/ 目录
npm run download-clis  # 或手动放置

# 打包 macOS
npx electron-builder --mac
```

产出文件在 `dist/` 目录：
- `Hermes Desktop for Office-0.1.0-arm64.dmg` — 磁盘镜像，拖拽安装
- `Hermes Desktop for Office-0.1.0-arm64-mac.zip` — 压缩包

### 安装后

1. 双击 `.dmg` 文件
2. 将 `Hermes Desktop for Office.app` 拖入 Applications
3. 从 Applications 打开

首次启动会自动弹出向导：
1. 输入 Gateway URL 和 API Token
2. 点击授权飞书（浏览器中完成 OAuth）
3. 点击授权钉钉（浏览器中完成 OAuth）

## 常见问题

### Q: git clone 超时
启用代理后重试：
```bash
export https_proxy=socks5://127.0.0.1:7897
git clone https://github.com/rightgenius/hermes-desktop-office.git
```

### Q: npm install 慢
使用国内镜像：
```bash
npm install --registry=https://registry.npmmirror.com
export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

### Q: lark-cli 是脚本不是二进制
npm 全局安装的 `lark-cli` 是一个 Node.js 脚本包装器，实际二进制在包内的 `bin/` 目录。使用上面 Step 3 的方法从包内复制真实二进制。

### Q: dws 找不到
确保已安装 dingtalk-workspace-cli：
```bash
npm install -g dingtalk-workspace-cli
```

### Q: 应用启动白屏
打开 DevTools 查看错误（开发模式自动打开，或按 Cmd+Option+I）。常见原因：
- CLI 二进制缺失或不可执行
- hermes-agent submodule 未初始化

### Q: Agent 启动失败
确保 `src/hermes-agent/` 目录存在且包含 `cli.py`：
```bash
ls src/hermes-agent/cli.py
# 如果不存在，重新初始化 submodule
git submodule update --init --recursive
```

## 目录结构

```
hermes-desktop-office/
├── src/
│   ├── main/              # Electron 主进程
│   ├── renderer/          # 前端界面
│   ├── preload/           # IPC 桥接
│   └── hermes-agent/      # Hermes Agent (git submodule)
├── assets/
│   ├── feishu-cli/        # lark-cli 二进制
│   │   └── darwin-arm64/
│   │       └── lark-cli
│   └── dws-cli/           # dws 二进制
│       └── darwin-arm64/
│           └── dws
├── scripts/
│   └── download-clis.sh   # CLI 自动下载脚本
├── docs/
│   ├── development-plan.md
│   ├── tasks.md
│   └── install.md         # 本文件
├── package.json
└── dist/                  # 构建产物
```
