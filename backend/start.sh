#!/usr/bin/env sh
set -eu

PORT_VALUE="${PORT:-8090}"

exec /pb/pocketbase serve --http="0.0.0.0:${PORT_VALUE}" --dir="/pb/pb_data"
