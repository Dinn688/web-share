# macOS 部署说明

## 适用场景

这个包适合在 macOS 桌面或局域网内的 Mac mini / Mac Studio 上运行“邻享 / LinShare”。默认端口是 `5832`，避免普通用户绑定 `80` 端口时遇到权限问题。

## 目录内容

- `server.js`：服务入口
- `public/`：前端页面和静态资源
- `package.json`、`package-lock.json`：Node.js 依赖声明
- `config/macos.env`：macOS 运行配置
- `start.command`：双击启动并后台运行脚本
- `scripts/start.sh`：终端启动并后台运行脚本
- `scripts/install-launchd.sh`：安装登录自启动
- `scripts/uninstall-launchd.sh`：移除登录自启动
- `scripts/status.sh`：查看启动状态和本机健康检查

## 环境要求

安装 Node.js 18 或更高版本，推荐 Node.js 20 LTS。

使用 Homebrew 安装示例：

```bash
brew install node
```

确认版本：

```bash
node -v
npm -v
```

## 快速启动

```bash
tar -xzf linshare-1.0.0-macos.tar.gz
cd linshare-1.0.0-macos
chmod +x start.command scripts/*.sh
./start.command
```

也可以直接双击 `start.command`。

检测通过后服务会在后台运行，终端窗口会自动结束。实际端口请以 `logs/server.log` 中输出为准。

浏览器访问：

```text
http://本机IP:5832/
```

本机访问：

```text
http://127.0.0.1:5832/
```

## 修改端口和数据目录

编辑 `config/macos.env`：

```bash
HOST=0.0.0.0
PORT=5832
PORT_RETRY_LIMIT=20
DATA_DIR=./data
UPLOAD_CHUNK_LIMIT_MB=16
DEFAULT_MAX_SHARED_STORAGE_MB=10240
```

`PORT=5832` 是默认起始端口，端口被占用时会自动尝试后续端口；`PORT_RETRY_LIMIT=20` 表示最多向后尝试 20 个端口。如果要使用 `80` 端口，需要用管理员权限启动，并且可能需要处理 macOS 防火墙提示。

## 设置登录自启动

```bash
chmod +x scripts/*.sh
./scripts/install-launchd.sh
```

安装完成后会创建 LaunchAgent：

```text
~/Library/LaunchAgents/com.linshare.web-share.plist
```

常用命令：

```bash
./scripts/status.sh
tail -f logs/launchd.out.log
tail -f logs/launchd.err.log
```

## 移除登录自启动

```bash
./scripts/uninstall-launchd.sh
```

该命令只移除 LaunchAgent，不会删除 `data/` 里的文件。

## 日志和排查

- 后台启动日志位于 `logs/server.log`，PID 位于 `logs/server.pid`。
- LaunchAgent 日志位于 `logs/launchd.out.log` 和 `logs/launchd.err.log`。
- 首次启动时 macOS 可能询问是否允许 Node.js 接收网络连接，请选择允许。
- 管理入口为 `/admin`，默认用户名 `admin`，默认密码 `admin123`，首次部署后请尽快修改默认管理员密码。
