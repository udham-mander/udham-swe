# udham-swe

Personal SWE AI toolkit — skills, commands, prompts, and workflows for use with Claude Code, Codex, Copilot, or any AI-powered development harness.

## What's Included

| Resource | Alias | Description |
|----------|-------|-------------|
| `review-branch` | `rb` | Thorough PR/branch code review with deep dive analysis |
| `pk-repo-cloner` | — | Clone PK Bitbucket repositories |
| `db-migration` | `migrate` | Run DgSecure Controller database migrations with backup & verification |
| `postgres-connect` | `pg` | Connect to PostgreSQL with interactive credential prompts |

## Installation

### Claude Code Plugin

```bash
git clone https://github.com/udham-mander/udham-swe.git
claude --plugin-dir /path/to/udham-swe
```

Or add permanently to your settings (`~/.claude/settings.json`):

```json
{
  "plugins": [
    "/path/to/udham-swe"
  ]
}
```

### Other AI Harnesses (Codex, Copilot, etc.)

The command markdown files in `commands/` are portable prompt definitions. You can:

1. **Copy into your harness's custom instructions or prompt library**
2. **Reference as context files** — point your AI tool at the relevant `.md` file
3. **Use as system prompts** — the workflow steps and output formats work with any LLM-based coding assistant

```
commands/
├── review-branch.md       # PR review workflow & output format
├── pk-repo-cloner.md  # Repo cloning instructions
├── db-migration.md        # Migration automation workflow
└── postgres-connect.md    # Database connection workflow
```

## Requirements

- **For database commands** (`db-migration`, `postgres-connect`): PostgreSQL client (`psql`) in PATH
- **For migrations**: Java runtime (for DgScriptExecutor JAR)
- **For repo cloning**: Git with SSH keys configured for Bitbucket

## Platform Support

Database commands auto-detect the runtime environment and adapt:

- **WSL** — detected via `/proc/version`
- **Linux** — native support
- **Windows** — uses batch files for reliable PostgreSQL credential handling

## Quick Examples

```
# Review a PR branch
/rb feature/add-user-auth

# Clone a PK repo
/pk-repo-cloner dgsecure-dbms

# Connect to PostgreSQL
/pg mydb postgres

# Run a database migration
/migrate 10.0.0 dg_10_mig
```

## Contributing

This is a personal toolkit that grows over time. Feel free to fork and adapt for your own workflows.

## Author

Udham Mander — manderudham@gmail.com
