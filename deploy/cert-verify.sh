#!/bin/bash
echo "== 公网证书验证 =="
echo | openssl s_client -connect ai-song.online:443 -servername ai-song.online 2>/dev/null | openssl x509 -noout -subject -issuer -dates
echo "== 全链路 =="
echo "student  -> $(curl -sS -m 10 -o /dev/null -w '%{http_code}' https://ai-song.online/student)"
echo "root     -> $(curl -sS -m 10 -o /dev/null -w '%{http_code}' https://ai-song.online/)"
