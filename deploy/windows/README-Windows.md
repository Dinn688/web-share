# Windows 部署说明

## 适用场景

这个包适合在 Windows 10/11 或 Windows Server 上运行“邻享 / LinShare”文件共享服务。默认端口是 `5832`，普通用户可直接启动；如果要使用 `80` 端口，请用管理员权限运行并修改配置。

## 目录内容

- `server.js`：服务入口
- `public/`：前端页面和静态资源
- `package.json`、`package-lock.json`：Node.js 依赖声明
- `config/windows.env.ps1`：Windows 运行配置
- `start.bat`：启动检查后后台运行脚本
- `scripts/install-autostart.ps1`：注册开机/登录自启动任务
- `scripts/uninstall-autostart.ps1`：移除自启动任务

## 环境要求

1. 安装 Node.js 18 或更高版本，推荐 Node.js 20 LTS。
2. 在命令行执行 `node -v` 和 `npm -v`，确认可以输出版本号。

## 快速启动

1. 解压部署包，例如解压到 `D:\apps\linshare`。
2. 双击 `start.bat`，首次启动会自动检测 Node.js、npm 并执行 `npm ci --omit=dev` 安装依赖。
3. 检测通过后服务会在后台运行，命令行窗口会自动关闭。
4. 浏览器访问：

```text
http://本机IP:5832/
```

如果在本机访问，可使用：

```text
http://127.0.0.1:5832/
```

## 修改端口和数据目录

编辑 `config/windows.env.ps1`：

```powershell
$env:HOST = "0.0.0.0"
$env:PORT = "5832"
$env:PORT_RETRY_LIMIT = "20"
$env:DATA_DIR = ".\data"
$env:UPLOAD_CHUNK_LIMIT_MB = "16"
$env:DEFAULT_MAX_SHARED_STORAGE_MB = "10240"
```

说明：

- `HOST=0.0.0.0` 表示允许局域网设备访问。
- `PORT=5832` 是默认起始端口，端口被占用时会自动尝试后续端口。
- `PORT_RETRY_LIMIT=20` 表示最多向后尝试 20 个端口。
- `DATA_DIR=.\data` 表示上传文件和数据库保存在当前目录的 `data/` 下。

如需使用 `80` 端口，请把 `$env:PORT` 改为 `"80"`，并用管理员权限启动。

## 设置登录自启动

以 PowerShell 运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\install-autostart.ps1
```

这会创建名为 `WebShare` 的计划任务，并在当前用户登录时自动启动服务。

如需创建系统启动任务，请用管理员权限运行：

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\install-autostart.ps1 -AtStartup
```

## 停止和移除自启动

移除计划任务：

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\uninstall-autostart.ps1
```

如果是后台运行，可在任务管理器中结束对应 `node.exe` 进程，或通过自启动任务管理脚本移除计划任务后重启电脑。

## 日志和排查

- 后台启动和自启动任务日志位于 `logs\server.log`。
- 如果局域网设备无法访问，请检查 Windows 防火墙是否放行当前端口。
- 管理入口为 `/admin`，默认用户名 `admin`，默认密码 `admin123`，首次部署后请尽快修改默认管理员密码。
