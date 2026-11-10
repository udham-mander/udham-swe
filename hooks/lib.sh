# Shared helpers for the flash-on-done hooks. Sourced, not executed.
# Uses bash built-ins where possible: in Git Bash every external program costs
# ~100 ms to start.

# True only on native Windows (Git Bash / MSYS / Cygwin). macOS ("darwin*"),
# Linux and WSL ("linux*") report other values, so the hooks exit silently there.
flash_is_windows() {
  case "$OSTYPE" in
    msys*|cygwin*) return 0 ;;
    *) return 1 ;;
  esac
}

# Opt-out switch, for turning the feature off without uninstalling the plugin.
flash_is_disabled() {
  [ "${UDHAM_FLASH_DISABLE:-0}" = "1" ]
}

# Per-machine state (prompt timestamps, compiled helper DLL). Kept outside the
# plugin folder, which Claude Code may replace when the plugin updates.
# Git Bash accepts C:/... paths, so backslashes are swapped instead of running cygpath.
flash_data_dir() {
  local d="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/udham-swe-data}/flash"
  d="${d//\\//}"
  [ -d "$d" ] || mkdir -p "$d" 2>/dev/null || return 1
  printf '%s' "$d"
}
