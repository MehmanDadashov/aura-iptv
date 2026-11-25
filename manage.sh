#!/bin/bash
cd /root/iptv_node
if screen -ls | grep -q aura-server; then
  echo "Server already running in screen"
else
  screen -dmS aura-server bash -c "node server.js > /tmp/server.log 2>&1"
  echo "Server started in screen session 'aura-server'"
fi
