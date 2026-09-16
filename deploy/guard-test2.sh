#!/bin/bash
B=https://ai-song.online
T=3e602f6124df64d1596c6d7fd8113c97c522806239260949
code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$B/student")
echo "student -> $code"
code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$B/monitor")
echo "monitor(no token) -> $code"
code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$B/monitor?t=$T")
echo "monitor(query token) -> $code"
code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -H "X-Token: $T" "$B/monitor")
echo "monitor(header token) -> $code"
code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' -H "X-Token: $T" "$B/api/list")
echo "api/list(header token) -> $code"
code=$(curl -sS -m 10 -o /dev/null -w '%{http_code}' "$B/api/auth")
echo "api/auth(remote) -> $code"
