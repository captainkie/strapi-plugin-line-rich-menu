#!/usr/bin/env sh
#
# The LINE mock runs as a second process inside this same
# container, bound to 127.0.0.1, instead of as a second Render service. Two free Render
# services sleep *independently*: a visitor wakes Strapi, clicks Publish, and Strapi's first
# outbound call reaches a mock that is still cold — roughly a minute of nothing, then a
# timeout. The visitor's reasonable conclusion is that the plugin is broken. One container,
# one sleep/wake cycle, no cross-service race — and one fewer draw on the free-hour pool
# that Render shares across every service in a workspace (see docs/DEMO.md).
#
# The mock is started in the background first, then this script `exec`s Strapi so it becomes
# PID 1. If the mock dies, PID 1 (Strapi) is untouched and the container keeps running —
# only publishing a menu breaks, because LINE_API_BASE_URL / LINE_API_DATA_BASE_URL are the
# only things that ever call out to it. No process supervisor is built for this on purpose;
# see docs/DEMO.md ("Why the demo talks to a mock").
set -e

LINE_MOCK_PORT="${LINE_MOCK_PORT:-4011}"

(
  cd /repo/tools/line-mock
  export PORT="$LINE_MOCK_PORT" HOST=127.0.0.1
  exec node_modules/.bin/tsx src/server.ts
) >/tmp/line-mock.log 2>&1 &

cd /app
exec node_modules/.bin/strapi start
