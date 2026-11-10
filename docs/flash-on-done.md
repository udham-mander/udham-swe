# flash-on-done

Flashes your **Windows Terminal** window when Claude Code finishes a reply, and keeps
flashing every few seconds until you come back — so you can switch to other work
during long tasks without missing the moment Claude is done.

> **Windows only.** On macOS, Linux and WSL the hooks exit immediately and do nothing.

## What it does

When Claude finishes a reply, a translucent green overlay blinks over the terminal
window hosting that session (3 quick blinks per burst).

| Rule | Default |
|---|---|
| Skip replies that came back quickly | under **5 s** |
| Skip if you're already active (mouse, touchpad or keyboard) | input in the last **5 s** |
| Repeat the burst | every **5 s** |
| Stop repeating | on any mouse/touchpad/keyboard input, after **30 min**, or if the window closes |

The overlay is click-through and never takes focus, so it won't interrupt typing.
A minimized window is skipped until restored.

## Requirements

- Windows 10 or 11
- [Windows Terminal](https://aka.ms/terminal) (the overlay targets its window)
- Windows PowerShell 5.1 (`powershell.exe`, built into Windows)
- Git Bash — Claude Code on Windows runs hook commands with it by default

## Install

The hook ships with the `udham-swe` plugin and is active once the plugin is installed:

```
/plugin install udham-swe --marketplace udham-mander/udham-swe
```

Answer `y` to add the marketplace, then pick a scope. For local development:

```bash
claude --plugin-dir /path/to/udham-swe
```

## Configuration

Set any of these in the `env` block of `~/.claude/settings.json` (or your shell
environment) and restart Claude Code. Unset values use the defaults.

| Variable | Default | Meaning |
|---|---|---|
| `UDHAM_FLASH_DISABLE` | `0` | `1` turns the feature off without uninstalling the plugin |
| `UDHAM_FLASH_COLOR` | `LimeGreen` | Any [.NET color name](https://learn.microsoft.com/dotnet/api/system.drawing.knowncolor) (`Orange`, `DodgerBlue`, `Red`, …) |
| `UDHAM_FLASH_OPACITY` | `0.35` | Overlay opacity, `0`–`1` |
| `UDHAM_FLASH_FLASHES` | `3` | Blinks per burst |
| `UDHAM_FLASH_REPEAT_SECONDS` | `5` | Seconds between bursts |
| `UDHAM_FLASH_MAX_MINUTES` | `30` | Give up after this long |
| `UDHAM_FLASH_MIN_TURN_SECONDS` | `5` | Skip replies faster than this |
| `UDHAM_FLASH_IDLE_SECONDS` | `5` | Skip if there was input within this window |

Example:

```json
{
  "env": {
    "UDHAM_FLASH_COLOR": "Orange",
    "UDHAM_FLASH_MIN_TURN_SECONDS": "30"
  }
}
```

## How it works

```
UserPromptSubmit ─► on-prompt.sh ─► writes <data>/turn-<session_id> (unix time)

Stop ─► on-stop.sh ─► flash-window.ps1 (hook mode)
                         ├─ reply shorter than MIN_TURN_SECONDS?  → exit
                         ├─ input within IDLE_SECONDS?            → exit
                         └─ start a hidden copy of itself (-Loop) → exit
                                  └─ flash, wait, repeat until input / timeout
```

- **Two hooks, one timestamp file.** The Stop hook isn't told when the turn began, so the
  UserPromptSubmit hook records it, keyed by session id so parallel sessions don't collide.
- **Detached loop.** Claude Code ends hooks after their `timeout`; the repeating flash
  runs in a separate hidden process, so it isn't cut short.
- **One loop per session.** A named mutex stops a new reply from stacking a second loop.
- **Which window.** The script walks up the process tree to the `WindowsTerminal.exe`
  hosting the session; if that walk breaks (Git Bash can drop intermediate processes),
  it uses any running Windows Terminal. Terminal normally hosts every window in one
  process, so it then overlays the **foreground** Terminal window, or the first visible
  one. With several Terminal windows open, a background session may flash a different
  Terminal window than its own.
- **Idle detection** uses Win32 `GetLastInputInfo`, which counts keyboard as well as
  mouse/touchpad input — Windows doesn't expose a mouse-only history.
- **Fast start.** The C# helper is compiled once into `flash-native.dll` and cached;
  it recompiles automatically when `flash-window.ps1` changes.
- **Windows-only gate.** Both shell shims check `uname` first and exit `0` on anything
  other than Git Bash/MSYS/Cygwin, so other platforms see no errors and no files.

State (timestamps, cached DLL) is stored in `$CLAUDE_PLUGIN_DATA/flash` when Claude Code
provides it, otherwise `~/.claude/udham-swe-data/flash` — never inside the plugin folder,
which can be replaced on update.

### Files

| File | Role |
|---|---|
| `hooks/hooks.json` | Registers the UserPromptSubmit and Stop hooks |
| `hooks/lib.sh` | Shared helpers: Windows check, opt-out, data folder |
| `hooks/on-prompt.sh` | Records prompt time |
| `hooks/on-stop.sh` | Maps `UDHAM_FLASH_*` variables to script parameters and launches PowerShell |
| `hooks/flash-window.ps1` | Skip rules, detached loop, overlay window |

## Troubleshooting

| Symptom | Check |
|---|---|
| Never flashes | Run `/hooks` and confirm the plugin's Stop hook is listed; make sure `UDHAM_FLASH_DISABLE` isn't `1` |
| Never flashes for short tasks | Expected: replies under `UDHAM_FLASH_MIN_TURN_SECONDS` are skipped |
| Doesn't flash while you're nearby | Expected: any input in the last `UDHAM_FLASH_IDLE_SECONDS` skips it |
| Overlay is offset or wrong size | Report it with your display scaling; the script sets DPI awareness to match |
| Flashes a different Terminal window | Known limitation with several Terminal windows open: the foreground (or first) Terminal window is used — see *Which window* above |
| Running Claude in VS Code / another terminal | Not supported — the overlay targets Windows Terminal |

To test it by hand (should blink 3 times if you don't touch anything):

```powershell
'{}' | powershell -NoProfile -ExecutionPolicy Bypass -File hooks\flash-window.ps1 -IdleSeconds 0 -MaxMinutes 1
```

## Uninstall

Remove the plugin (`/plugin` → udham-swe → uninstall), or keep it and set
`UDHAM_FLASH_DISABLE=1`. Leftover state can be deleted from
`~/.claude/udham-swe-data/flash`.
