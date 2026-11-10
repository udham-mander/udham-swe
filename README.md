# udham-swe

Personal SWE AI toolkit — skills, commands, prompts, and workflows for use with Claude Code, Codex, Copilot, or any AI-powered development harness.

## What's Included

| Resource | Alias | Description |
|----------|-------|-------------|
| `review-branch` | `rb` | Thorough PR/branch code review with deep dive analysis |
| `db-migration` | `migrate` | Run DgSecure Controller database migrations with backup & verification |
| `postgres-connect` | `pg` | Connect to PostgreSQL with interactive credential prompts |
| `statusline-setup` | — | Point your status line at the plugin's [status line](docs/statusline.md) script |

### Hooks

| Hook | Platform | Description |
|------|----------|-------------|
| [`flash-on-done`](docs/flash-on-done.md) | Windows only | Flashes the Windows Terminal window when Claude finishes a long reply, repeating until you return. No-op on macOS/Linux/WSL. |
| [status line sync](docs/statusline.md) | All | On session start, copies the status line script to a stable path so updates apply automatically. |

### Status line

```
udham-swe (main) │ Opus 5.5 · xhigh │ ctx 26% 259k/1M │ 5h 7% ↻2h13m
```

Folder + git branch, model + effort, context used, and the 5-hour usage limit with its reset countdown. Requires Node.js 18+. Set it up with `/udham-swe:statusline-setup` — see [docs/statusline.md](docs/statusline.md).

## Installation

### Claude Code Plugin

At the Claude Code prompt:

```
/plugin install udham-swe --marketplace udham-mander/udham-swe
```

Answer `y` to add the marketplace, then choose a scope. To update later, run `/plugin` and update the marketplace.

For local development, run straight from a clone:

```bash
git clone https://github.com/udham-mander/udham-swe.git
claude --plugin-dir /path/to/udham-swe
```

### Other AI Harnesses (Codex, Copilot, etc.)

The command markdown files in `commands/` are portable prompt definitions. You can:

1. **Copy into your harness's custom instructions or prompt library**
2. **Reference as context files** — point your AI tool at the relevant `.md` file
3. **Use as system prompts** — the workflow steps and output formats work with any LLM-based coding assistant

```
commands/
├── review-branch.md       # PR review workflow & output format
├── db-migration.md        # Migration automation workflow
└── postgres-connect.md    # Database connection workflow
```

## Requirements

- **For database commands** (`db-migration`, `postgres-connect`): PostgreSQL client (`psql`) in PATH
- **For migrations**: Java runtime (for DgScriptExecutor JAR)
- **For `flash-on-done`**: Windows 10/11, Windows Terminal, Windows PowerShell 5.1, Git Bash ([details](docs/flash-on-done.md#requirements))

## Platform Support

Database commands auto-detect the runtime environment and adapt:

- **WSL** — detected via `/proc/version`
- **Linux** — native support
- **Windows** — uses batch files for reliable PostgreSQL credential handling

The `flash-on-done` hook is **Windows only**: its scripts check the OS first and exit silently on macOS, Linux and WSL, so installing the plugin there is safe.

## Quick Examples

```
# Review a PR branch
/rb feature/add-user-auth

# Connect to PostgreSQL
/pg mydb postgres

# Run a database migration
/migrate 10.0.0 dg_10_mig
```

## Contributing

This is a personal toolkit that grows over time. Feel free to fork and adapt for your own workflows.

## Author

Udham Mander — manderudham@gmail.com
