#!/bin/bash
# 安全重启后端：用 pidfile，避免 pgrep 匹配到调用者自身命令
PIDF=/tmp/vcms.pid
DIR=/root/.openclaw/workspace-gogo/video-cms/server
if [ -f "$PIDF" ]; then
  OLD=$(cat "$PIDF")
  if kill -0 "$OLD" 2>/dev/null; then kill "$OLD" 2>/dev/null; sleep 1; fi
fi
cd "$DIR"
nohup env PORT=5150 DATABASE_URL="postgresql://vcms:vcms_pass_2026@127.0.0.1:5155/video_cms?schema=public" node dist/index.js > /tmp/vcms.log 2>&1 < /dev/null &
echo $! > "$PIDF"
disown
sleep 3
curl -s http://127.0.0.1:5150/health >/dev/null 2>&1 && echo "server up (pid $(cat $PIDF))" || echo "DOWN"
