# Status line

A compact, colored status line for Claude Code:

```
udham-swe (main) │ Opus 5.5 · xhigh │ ctx 26% 259k/1M │ 5h 7% ↻2h13m
```

Works on Windows, macOS and Linux. Requires Node.js 18+.

## Segments

| Segment | Shows | Colors |
|---|---|---|
| `udham-swe (main)` | Current folder and git branch (branch hidden outside a repo; short commit id when detached) | blue / magenta |
| `Opus 5.5 · xhigh` | Model and the effort level of the current turn; `⚡fast` when fast mode is on | effort: low dim → max red |
| `ctx 26% 259k/1M` | Context window used: percent, then tokens used / window size | green → yellow ≥ 60% → red ≥ 80% |
| `5h 7% ↻2h13m` | Plan's 5-hour usage limit and time until it resets | green → yellow ≥ 70% → red ≥ 90% |
| `cache cold` | Only when the prompt cache has expired (the next message costs more) | yellow |

A segment is left out when Claude Code doesn't send its data (e.g. no usage limits on API-key billing).

## Install

1. Install the plugin:
   ```
   /plugin install udham-swe --marketplace udham-mander/udham-swe
   ```
2. Restart Claude Code once, so the plugin's SessionStart hook copies the script into place.
3. Run `/udham-swe:statusline-setup`, or add this to `~/.claude/settings.json` yourself:
   ```json
   "statusLine": {
     "type": "command",
     "command": "node \"$HOME/.claude/plugins/data/udham-swe-udham-swe/statusline.js\""
   }
   ```

## How it works

- The script lives in the plugin at `statusline/statusline.js`. Plugins can't set `statusLine`
  themselves, and the plugin's install folder changes with each version, so a **SessionStart
  hook** (`hooks/sync-statusline.sh`) copies the script to the plugin's data folder, a path that
  stays the same across updates. Your setting points there, so updates apply automatically.
- Claude Code pipes a JSON description of the session to the script on each refresh; the script
  prints one line. All data comes from that input except the git branch.
- **Cheap to run** (~120 ms, nearly all Node startup). The git branch is read straight from
  `.git/HEAD` instead of running `git` (which would add ~120 ms), and handles worktrees and
  submodules where `.git` is a file.

## Customize

Edit the copy in the plugin repo (`statusline/statusline.js`); each segment is one numbered block
in `render()`. Editing the copy in the data folder works too, but the next session start
overwrites it with the plugin's version.

## Remove

Delete the `statusLine` key from `~/.claude/settings.json`.
