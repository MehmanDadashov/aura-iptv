#!/bin/bash
# Auto-restart wrapper for IPTV server
cd /root/iptv_node
while true; do
  node server.js
  echo "Server crashed, restarting in 2s..."
  sleep 2
done