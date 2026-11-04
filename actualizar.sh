#!/bin/zsh
# Genera los informes del día y abre el dashboard.
cd "$(dirname "$0")"
python3 engine/motor.py "$@" || exit 1
[[ "$1" != "--sin-abrir" ]] && open site/index.html
exit 0
