#!/bin/bash
# frps 一键部署脚本（Ubuntu 云服务器）
# 用法：ssh 登录服务器后执行：
#   curl -fsSL https://raw.githubusercontent.com/AnxiaoSong/course-schedule/main/deploy/frps-setup.sh | sudo bash
set -e

VER="0.71.0"
ARCH="amd64"
URL="https://github.com/fatedier/frp/releases/download/v${VER}/frp_${VER}_linux_${ARCH}.tar.gz"
MIRROR="https://ghfast.top/${URL}"

cd /tmp
echo "==> 下载 frp v${VER} ..."
curl -fsSL "$URL" -o frp.tar.gz || curl -fsSL "$MIRROR" -o frp.tar.gz

echo "==> 解压到 /opt/frp ..."
rm -rf /opt/frp "/tmp/frp_${VER}_linux_${ARCH}"
tar -xzf frp.tar.gz -C /opt
mv "/opt/frp_${VER}_linux_${ARCH}" /opt/frp
rm -f frp.tar.gz

echo "==> 生成随机 token ..."
TOKEN=$(head -c 16 /dev/urandom | md5sum | cut -d' ' -f1)

cat > /opt/frp/frps.toml << EOF
bindPort = 7000
auth.method = "token"
auth.token = "${TOKEN}"
EOF

cat > /etc/systemd/system/frps.service << 'EOF'
[Unit]
Description=frp server
After=network.target

[Service]
ExecStart=/opt/frp/frps -c /opt/frp/frps.toml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now frps

echo ""
echo "=============================================="
echo "  frps 部署完成，已开机自启"
echo "  服务端口: 7000（frpc 连接用）"
echo "  对外端口: 8080（学生访问用，需在云控制台安全组放行 7000 和 8080 TCP）"
echo ""
echo "  ★ 请复制以下 token，填入本地 start-cloud.bat 首次运行提示中："
echo "  TOKEN=${TOKEN}"
echo "=============================================="
