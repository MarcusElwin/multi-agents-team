#!/usr/bin/env bash
# Start the iii engine in the background, then run the MAT worker in the
# foreground. The worker auto-reconnects, so it tolerates the engine taking a
# moment to come up. When the worker exits the container stops and the engine
# (its child) is torn down with it.
set -euo pipefail

iii --use-default-config &

exec pnpm worker
