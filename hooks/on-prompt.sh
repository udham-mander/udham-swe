#!/usr/bin/env bash
# UserPromptSubmit hook for flash-on-done: records when the prompt was sent, so
# the Stop hook can skip replies that came back quickly. Windows only.
# Registered as async, and built from bash built-ins, so it never delays a prompt.
#
# Must print nothing: UserPromptSubmit stdout is added to Claude's context.

. "$(dirname "$0")/lib.sh"
flash_is_windows || exit 0
flash_is_disabled && exit 0
data="$(flash_data_dir)" || exit 0

# Hook input is JSON on stdin; pull session_id with a bash regex (no jq/grep/sed).
IFS= read -r -d '' input
re='"session_id"[[:space:]]*:[[:space:]]*"([^"]+)"'
if [[ $input =~ $re ]]; then
  printf '%(%s)T' -1 > "$data/turn-${BASH_REMATCH[1]}"
fi

# Housekeeping: one file per session accumulates otherwise. Active sessions
# rewrite theirs on every prompt, so anything untouched for 7+ days is stale.
find "$data" -maxdepth 1 -type f -name 'turn-*' -mtime +7 -delete 2>/dev/null
exit 0
