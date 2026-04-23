#!/usr/bin/env bash
# Auto-start AIO-System dev servers
cd "$(dirname "$0")"
npx concurrently -n server,client "npm run dev:server" "cd client && npx vite --host" &>/tmp/aio-dev.log &
echo "AIO-System dev servers started (PID: $!)"