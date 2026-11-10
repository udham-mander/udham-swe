#!/usr/bin/env bash
# UserPromptSubmit hook for flash-on-done: records when the prompt was sent, so
# the Stop hook can skip replies that came back quickly. Windows only.
#
# Must print nothing: UserPromptSubmit stdout is added to Claude's context.

. "$(dirname "$0")/lib.sh"
flash_is_windows || exit 0
flash_is_disabled && exit 0
data="$(flash_data_dir)" || exit 0

# Hook input is JSON on stdin; pull session_id without needing jq.
sid=$(grep -o '"session_id" *: *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')
[ -n "$sid" ] && date +%s > "$data/turn-$sid"
exit 0
