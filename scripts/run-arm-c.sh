#!/usr/bin/env bash
exec "$(dirname "$0")/run-arm-invoker.sh" "${1:?usage: run-arm-c.sh P1|P2|P3|P4}" C
