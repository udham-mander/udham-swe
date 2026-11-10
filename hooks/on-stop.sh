#!/usr/bin/env bash
# Stop hook for flash-on-done: hands the hook input to flash-window.ps1, which
# decides whether to flash. Windows only; exits silently anywhere else.

. "$(dirname "$0")/lib.sh"
flash_is_windows || exit 0
flash_is_disabled && exit 0
command -v powershell.exe >/dev/null 2>&1 || exit 0
data="$(flash_data_dir)" || exit 0

# Optional tuning via environment variables (e.g. the "env" block of
# ~/.claude/settings.json). Unset ones keep the script's defaults.
args=()
add() { [ -n "$2" ] && args+=("$1" "$2"); }
add -Color          "$UDHAM_FLASH_COLOR"
add -Opacity        "$UDHAM_FLASH_OPACITY"
add -Flashes        "$UDHAM_FLASH_FLASHES"
add -RepeatSeconds  "$UDHAM_FLASH_REPEAT_SECONDS"
add -MaxMinutes     "$UDHAM_FLASH_MAX_MINUTES"
add -MinTurnSeconds "$UDHAM_FLASH_MIN_TURN_SECONDS"
add -IdleSeconds    "$UDHAM_FLASH_IDLE_SECONDS"

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden \
  -File "$(cygpath -w "$(dirname "$0")/flash-window.ps1")" \
  -DataDir "$(cygpath -w "$data")" "${args[@]}"
exit 0
