#!/bin/bash
exec > /tmp/frps-install.log 2>&1
set -e
echo "=== start $(date) ==="

sudo rm -f /tmp/frp.tar.gz
URLS=(
  "https://github.com/fatedier/frp/releases/download/v0.71.0/frp_0.71.0_linux_amd64.tar.gz"
  "https://ghfast.top/https://github.com/fatedier/frp/releases/download/v0.71.0/frp_0.71.0_linux_amd64.tar.gz"
  "https://gh-proxy.com/https://github.com/fatedier/frp/releases/download/v0.71.0/frp_0.71.0_linux_amd64.tar.gz"
  "https://ghproxy.net/https://github.com/fatedier/frp/releases/download/v0.71.0/frp_0.71.0_linux_amd64.tar.gz"
)
OK=""
for url in "${URLS[@]}"; do
  echo "try $url"
  if curl -fsSL --max-time 400 "$url" -o /tmp/frp.tar.gz; then
    if tar tzf /tmp/frp.tar.gz > /dev/null 2>&1; then
      OK=1
      echo "download ok size=$(stat -c%s /tmp/frp.tar.gz)"
      break
    fi
    echo "corrupt, retry next"
  fi
done
[ -n "$OK" ] || { echo "ALL_DOWNLOADS_FAILED"; exit 1; }

sudo rm -rf /opt/frp /tmp/frp_0.71.0_linux_amd64
sudo tar -xzf /tmp/frp.tar.gz -C /opt
sudo mv /opt/frp_0.71.0_linux_amd64 /opt/frp

TOKEN=$(head -c 16 /dev/urandom | md5sum | cut -d' ' -f1)
printf 'bindPort = 7000\nauth.method = "token"\nauth.token = "%s"\n' "$TOKEN" | sudo tee /opt/frp/frps.toml > /dev/null

cat << 'EOF' | sudo tee /etc/systemd/system/frps.service > /dev/null
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

sudo systemctl daemon-reload
sudo systemctl enable --now frps
sleep 2
echo "ACTIVE=$(systemctl is-active frps)"
echo "TOKEN=$TOKEN"
ss -tlnp | grep 7000 || echo "PORT_7000_NOT_LISTENING"
echo "=== FINISH ==="
