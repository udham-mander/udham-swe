# Shared helpers for the flash-on-done hooks. Sourced, not executed.

# True only on native Windows (Git Bash / MSYS / Cygwin). macOS, Linux and WSL
# report other names, so the hooks exit silently there.
flash_is_windows() {
  case "$(uname -s 2>/dev/null)" in
    MINGW*|MSYS*|CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

# Opt-out switch, for turning the feature off without uninstalling the plugin.
flash_is_disabled() {
  [ "${UDHAM_FLASH_DISABLE:-0}" = "1" ]
}

# Per-machine state (prompt timestamps, compiled helper DLL). Kept outside the
# plugin folder, which Claude Code may replace when the plugin updates.
flash_data_dir() {
  local d="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/udham-swe-data}/flash"
  command -v cygpath >/dev/null 2>&1 && d="$(cygpath -u "$d")"
  mkdir -p "$d" 2>/dev/null && printf '%s' "$d"
}
