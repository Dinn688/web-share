# Linux 部署说明

## 适用场景

这个包适合部署到 Ubuntu、Debian、Rocky Linux、CentOS、AlmaLinux 等常见 Linux 服务器。默认起始端口是 `5832`，脚本会后台运行，也可用 `systemd` 托管为系统服务。

## 目录内容

- `server.js`：服务入口
- `public/`：前端页面和静态资源
- `package.json`、`package-lock.json`：Node.js 依赖声明
- `config/linux.env`：Linux 运行配置
- `start.sh`：环境检查后后台运行脚本
- `scripts/install-systemd.sh`：安装 systemd 服务
- `scripts/uninstall-systemd.sh`：卸载 systemd 服务
- `scripts/status.sh`：查看服务状态和本机健康检查

## 环境要求

安装 Node.js 18 或更高版本，推荐 Node.js 20 LTS。

Ubuntu / Debian 示例：

```bash
sudo apt update
sudo apt install -y nodejs npm
```

Rocky Linux / CentOS 示例：

```bash
sudo dnf install -y nodejs npm
```

确认版本：

```bash
node -v
npm -v
```

## 快速启动

```bash
tar -xzf linshare-1.0.0-linux.tar.gz
cd linshare-1.0.0-linux
chmod +x start.sh scripts/*.sh
./start.sh
```

浏览器访问：

```text
http://服务器IP:5832/
```

如果端口被占用，服务会自动尝试后续端口，请以 `logs/server.log` 中输出的实际地址为准。

## 安装为 systemd 服务

在部署目录执行：

```bash
chmod +x start.sh scripts/*.sh
sudo ./scripts/install-systemd.sh
```

安装完成后会创建并启动 `web-share.service`。

常用命令：

```bash
sudo systemctl status web-share.service --no-pager
sudo systemctl restart web-share.service
sudo journalctl -u web-share.service -f
```

## 修改端口和数据目录

编辑 `config/linux.env`：

```bash
HOST=0.0.0.0
PORT=5832
PORT_RETRY_LIMIT=20
DATA_DIR=./data
UPLOAD_CHUNK_LIMIT_MB=16
DEFAULT_MAX_SHARED_STORAGE_MB=10240
```

说明：

- `HOST=0.0.0.0` 表示允许局域网设备访问。
- `PORT=5832` 是默认起始端口，端口被占用时会自动尝试后续端口。
- `PORT_RETRY_LIMIT=20` 表示最多向后尝试 20 个端口。
- `DATA_DIR=./data` 表示上传文件和数据库保存在部署目录下的 `data/`。

修改配置后重启：

```bash
sudo systemctl restart web-share.service
```

## 防火墙

安装脚本会尝试自动放行 HTTP。若仍无法访问，请手动放行端口。

firewalld：

```bash
sudo firewall-cmd --add-service=http --permanent
sudo firewall-cmd --reload
```

ufw：

```bash
sudo ufw allow 5832/tcp
```

## 卸载服务

```bash
sudo ./scripts/uninstall-systemd.sh
```

该命令只移除 systemd 服务，不会删除 `data/` 里的文件。

## 日志和排查

- 服务日志：`sudo journalctl -u web-share.service -f`
- 脚本后台运行日志：`logs/server.log`
- 脚本后台运行 PID：`logs/server.pid`
- 健康检查：`./scripts/status.sh`
- 如果端口被占用，服务会自动切换到后续端口。
- 管理入口为 `/admin`，默认用户名 `admin`，默认密码 `admin123`，首次部署后请尽快修改默认管理员密码。
