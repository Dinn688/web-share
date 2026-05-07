# 域享产品介绍与部署说明

## 产品定位

域享是一款面向局域网、内网办公、学校机房、会议现场和多设备协作场景的轻量文件分享系统。用户只需要打开浏览器访问同一个内网地址，就可以完成文件上传、下载、公开共享和私密传输，不需要安装客户端，也不需要普通用户登录账号。

它适合不能稳定访问外网、不方便使用公网网盘，或需要在电脑、手机、平板之间快速流转资料的环境。

## 核心功能

### 1. 共享中心

共享中心用于公开分发文件。上传者把文件拖入页面或点击上传，局域网内其他用户打开同一地址后即可查看和下载。

典型用途：

- 课件、安装包、会议资料分发。
- 办公文档、压缩包、设计稿临时共享。
- 手机照片、视频、录音上传到电脑处理。

主要能力：

- 支持单文件和多文件上传。
- 支持大文件分片上传。
- 支持上传进度展示。
- 支持文件搜索、排序、单个下载、批量下载。
- 支持删除公开共享文件。

### 2. 私密对端传输

私密对端传输用于不希望进入公共共享区的文件。发送方上传文件后生成传输码，接收方输入正确传输码后才能查看和下载。

主要能力：

- 发送方生成传输码。
- 接收方凭传输码接收文件。
- 可用于合同草稿、作品源文件、内部资料等定向交付。
- 支持下载后销毁，减少文件长期暴露。

### 3. 管理后台

管理员可进入后台查看和管理系统文件、存储配额和密码。

- 后台地址：`http://服务器IP:端口/admin`
- 默认用户名：`admin`
- 默认密码：`admin123`

首次部署后请尽快在后台修改默认密码。后台会话默认有效期为 8 小时。

### 4. 内网访问限制

服务默认只允许本机和常见私有网段访问，适合部署在局域网内部。若用户无法访问，请确认设备连接到同一个内部网络，并检查服务器防火墙端口是否放行。

### 5. 端口自动切换

默认端口为 `5832`。如果端口被占用，服务会从当前端口开始自动尝试后续端口，例如 `5833`、`5834`，最多尝试 20 个端口。

实际访问地址以启动日志为准，也可访问 `/api/system/info` 查看当前成功监听的端口。

## 运行依赖

必需依赖：

- Node.js 18 或以上。
- npm，通常随 Node.js 一起安装。

项目 npm 依赖：

- `express`：Web 服务框架。
- `archiver`：批量下载压缩包生成。
- `mime-types`：文件 MIME 类型识别。

支持平台：

- Windows 10/11 或 Windows Server。
- Linux，例如 Ubuntu、Debian、CentOS、Rocky Linux。
- macOS。

## 配置项

配置可通过环境变量或发布包中的配置文件修改。

- `HOST`：监听地址，默认 `0.0.0.0`。
- `PORT`：起始端口，默认 `5832`。
- `PORT_RETRY_LIMIT`：端口占用后的最大递增尝试次数，默认 `20`。
- `DATA_DIR`：数据目录，默认 `./data`。
- `UPLOAD_CHUNK_LIMIT_MB`：单个上传分片大小限制，默认 `16`。
- `DEFAULT_MAX_SHARED_STORAGE_MB`：共享文件最大存储容量，默认 `10240`。

发布包配置文件位置：

- Windows：`config/windows.env.ps1`
- Linux：`config/linux.env`
- macOS：`config/macos.env`

## 本地开发运行

```bash
npm install
npm start
```

启动后控制台会输出本机访问地址和内网访问地址，例如：

```text
域享 已启动
本机访问: http://127.0.0.1:5832
内网访问: http://192.168.1.20:5832
```

开发时可使用：

```bash
npm run dev
```

## 发布包构建

在项目根目录执行：

```bash
npm run package
```

构建完成后会生成：

- `output/软件包/linshare-1.0.0-windows.zip`
- `output/软件包/linshare-1.0.0-linux.tar.gz`
- `output/软件包/linshare-1.0.0-macos.tar.gz`
- `output/软件包/SHA256SUMS.txt`

`SHA256SUMS.txt` 用于校验发布包完整性。

## Windows 部署

1. 安装 Node.js 18 或以上。
2. 解压 `linshare-1.0.0-windows.zip`。
3. 双击 `start.bat`。
4. 脚本会先检测 Node.js、npm 和依赖安装情况。
5. 检测通过后服务会在后台运行，并自动关闭命令行窗口。

日志位置：

- `logs/server.log`

修改配置：

- 编辑 `config/windows.env.ps1`。

如果启动检查失败，窗口会保留错误提示，按提示安装 Node.js 或修复 npm 后重新运行。

## Linux 部署

1. 安装 Node.js 18 或以上。
2. 解压 `linshare-1.0.0-linux.tar.gz`。
3. 进入解压后的目录。
4. 执行：

```bash
chmod +x start.sh scripts/*.sh
./start.sh
```

脚本会检测 Node.js、npm 和依赖安装情况。检测通过后服务会使用后台方式运行，并把日志写入：

- `logs/server.log`
- `logs/server.pid`

安装为 systemd 服务：

```bash
sudo ./scripts/install-systemd.sh
```

查看状态：

```bash
./scripts/status.sh
```

卸载 systemd 服务：

```bash
sudo ./scripts/uninstall-systemd.sh
```

## macOS 部署

1. 安装 Node.js 18 或以上。
2. 解压 `linshare-1.0.0-macos.tar.gz`。
3. 双击 `start.command`，或在终端执行：

```bash
chmod +x start.command scripts/*.sh
./start.command
```

检测通过后服务会后台运行，并写入：

- `logs/server.log`
- `logs/server.pid`

安装为 LaunchAgent：

```bash
./scripts/install-launchd.sh
```

查看状态：

```bash
./scripts/status.sh
```

卸载 LaunchAgent：

```bash
./scripts/uninstall-launchd.sh
```

## 数据与日志

默认数据目录为 `data/`：

- `data/db.json`：文件、传输、设置和操作日志元数据。
- `data/files/`：共享中心上传文件。
- `data/peer-files/`：私密对端传输文件。
- `data/temp/`：分片上传临时文件。

默认运行日志目录为 `logs/`：

- `logs/server.log`：后台启动后的主服务日志。
- `logs/server.pid`：Linux/macOS 后台进程 PID。
- systemd 或 launchd 部署时还可能生成对应平台的服务日志。

## 常见问题

无法打开页面：

- 确认服务器和访问设备在同一局域网。
- 检查启动日志中的实际端口。
- 检查防火墙是否放行该端口。

端口被占用：

- 无需手动处理，服务会自动尝试后续端口。
- 以 `logs/server.log` 或控制台输出的实际地址为准。

提示 Node.js 不存在或版本过低：

- 安装 Node.js 18 LTS 或更新版本。
- 安装后重新打开命令行或重新运行启动脚本。

后台无法登录：

- 默认账号为 `admin`，默认密码为 `admin123`。
- 如果已修改密码，请使用新密码。
- 如需重置密码，可在停服后备份并处理 `data/db.json` 中的管理员配置。
