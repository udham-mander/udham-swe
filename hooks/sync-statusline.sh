#!/usr/bin/env bash
# SessionStart hook: copies the plugin's status line script to a stable path
# ($CLAUDE_PLUGIN_DATA/statusline.js), because the plugin's own folder changes
# with every version. The user's statusLine setting points at the stable copy,
# so plugin updates reach it automatically. Cross-platform.
#
# Must print nothing: SessionStart stdout is added to Claude's context.

src="$(dirname "$0")/../statusline/statusline.js"
dst="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/udham-swe-data}"
dst="${dst//\\//}"   # Git Bash accepts C:/... paths; avoids spawning cygpath

[ -f "$src" ] || exit 0
mkdir -p "$dst" 2>/dev/null || exit 0
cmp -s "$src" "$dst/statusline.js" || cp "$src" "$dst/statusline.js" 2>/dev/null
exit 0
