---
name: statusline-setup
description: Point Claude Code's status line at the udham-swe status line script (folder + git branch, model + effort, context used, 5-hour limit with reset countdown). Use '/statusline-setup' to install or repair it.
allowed-tools: [Bash, Read, Edit]
user_invocable: true
---

# Status line setup

Configure the user's status line to use the script shipped with this plugin.

## Steps

1. **Check Node.js.** Run `node --version`. If it fails, tell the user Node.js 18+ is required and stop.

2. **Find the stable copy of the script.** The plugin's SessionStart hook copies it to the plugin data folder. Check, in order:
   - `$HOME/.claude/plugins/data/udham-swe-udham-swe/statusline.js`
   - `$HOME/.claude/udham-swe-data/statusline.js`

   If neither exists (the plugin was just installed and no session has started since), copy `${CLAUDE_PLUGIN_ROOT}/statusline/statusline.js` to the first path yourself (create the folder). If `CLAUDE_PLUGIN_ROOT` is not set, find the script under `$HOME/.claude/plugins/cache/` (`*/udham-swe/*/statusline/statusline.js`, newest version).

3. **Test it** by piping a sample payload and showing the user the output:
   ```bash
   printf '%s' '{"workspace":{"current_dir":"'"$PWD"'"},"model":{"display_name":"Opus"},"effort":{"level":"high"},"context_window":{"used_percentage":30,"total_input_tokens":60000,"context_window_size":200000}}' | node "<path from step 2>"
   ```

4. **Update `~/.claude/settings.json`.** Read it first. Set (or replace) only the `statusLine` key, keeping everything else:
   ```json
   "statusLine": {
     "type": "command",
     "command": "node \"$HOME/.claude/plugins/data/udham-swe-udham-swe/statusline.js\""
   }
   ```
   Use the path found in step 2. If a different `statusLine` already exists, show it to the user and confirm before replacing it.

5. **Validate** that the settings file still parses as JSON, then tell the user the status line updates on its next refresh (or after a restart). Point them to `docs/statusline.md` in the plugin for what each segment means.
