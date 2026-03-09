---
name: postgres-connect
aliases: [pg]
description: Connect to PostgreSQL database with interactive credential prompts. Use '/postgres-connect' or '/pg' to establish a database connection.
argument-hint: "[database] [username] [password]"
allowed-tools: [Bash, AskUserQuestion, Read, Write]
user_invocable: true
---

# PostgreSQL Connection Skill

This skill helps you connect to a PostgreSQL database by prompting for credentials if not provided, then establishing and testing the connection.

## Usage

Invoke with: `/postgres-connect` or `/pg`

Optional arguments:
- `/pg` - Use defaults (localhost:5432, postgres user), prompt for password only
- `/pg <database_name>` - Use defaults, connect to specific database, prompt for password
- `/pg <database_name> <username>` - Use defaults, connect with specific user, prompt for password
- `/pg <database_name> <username> <password>` - Full connection details, NO PROMPTS, direct connection

**Defaults:**
- Host: localhost
- Port: 5432
- Username: postgres

## Examples

| Invocation | Behavior | Prompts |
|------------|----------|---------|
| `/pg` | Connect to 'postgres' db with defaults | Password only |
| `/pg mydb` | Connect to 'mydb' with defaults | Password only, then list & select DB |
| `/pg mydb admin` | Connect to 'mydb' as 'admin' | Password only |
| `/pg mydb admin Pass123` | Direct connection to 'mydb' as 'admin' | None - immediate connection |

## Environment Detection

Before executing any PostgreSQL commands, detect the runtime environment:

1. **Check environment**:
   ```bash
   if grep -qi microsoft /proc/version 2>/dev/null; then
     ENV="wsl"
   elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || -n "$WINDIR" ]]; then
     ENV="windows"
   else
     ENV="linux"
   fi
   ```

2. **Select execution strategy**:
   - **WSL / Linux**: Use `PGPASSWORD=<password> psql ...` inline or `export PGPASSWORD`
   - **Windows (cmd/PowerShell)**: Use batch files (see below)

3. **Check tool availability**:
   - WSL/Linux: `which psql`
   - Windows: `where psql`

## Workflow

1. **Detect environment** (WSL, Windows, or Linux) using the detection logic above
2. **Parse arguments** from skill invocation
3. **Check if psql is available** in PATH
4. **Smart prompting based on arguments:**
   - If password provided (4th arg): Skip all prompts, connect directly
   - If username provided (3rd arg): Only prompt for password
   - If database provided (2nd arg): Only prompt for password
   - If no args: Prompt for password only (use all defaults)
5. **List available databases** (connect to 'postgres' database to show all databases)
6. **Prompt for database selection** from the list of available databases (if not already specified)
7. **Test connection** to selected database
8. **Confirm connection** with minimal success message (connection established only)
9. **Store connection details** in session memory for reuse

## PostgreSQL Command Execution

### WSL / Linux
Use inline environment variables:
```bash
PGPASSWORD="<password>" psql -h localhost -p 5432 -U postgres -d <database> -c "<sql_command>" -t -A
```

For multiple commands:
```bash
export PGPASSWORD="<password>"
psql -h localhost -p 5432 -U postgres -d <database> -c "<sql_command>" -t -A
# ... more commands ...
unset PGPASSWORD
```

### Windows (cmd / PowerShell)
**CRITICAL:** Always use batch files — inline `set PGPASSWORD=... && psql ...` fails silently on Windows.

Create a temporary `.bat` file:
```batch
@echo off
set PGPASSWORD=<password>
psql -h <host> -p <port> -U <username> -d <database> -c "<sql_command>" -t -A -F "|"
```

- Create batch files in `%TEMP%` with unique names
- Call with quoted paths: `"C:\path\to\file.bat"`
- Clean up batch files after use

## Connection Details

The skill will:
- Verify PostgreSQL is installed and accessible
- Prompt for connection details in a single consolidated prompt
- List available databases for selection
- Test the connection to the selected database
- Provide minimal confirmation (e.g., "Connected to database_name")
- Store connection string for subsequent queries
- **IMPORTANT**: Do NOT show table structures, sample data, or additional insights unless explicitly requested by the user

## Session Storage

After successful connection, the following will be stored:
- Connection URI (without exposing password in plain text)
- Database name
- Username
- Host and port

These can be reused for subsequent database operations without re-prompting.

## Security Notes

- Passwords are passed via environment variables, never as command-line arguments visible in process lists
- WSL/Linux: `PGPASSWORD` is unset after use
- Windows: batch files are deleted after execution
- Session storage masks sensitive credentials

## Query Execution Policy

After connection is established:
- **ONLY execute queries explicitly requested by the user**
- Do NOT automatically show table structures, sample data, or database metadata
- Do NOT provide additional insights or context unless asked
- Return only the specific data requested in the query

## PostgreSQL Commands Reference

Common psql meta-commands:
- `\dt` - List tables in current schema
- `\dt+` - List tables with sizes
- `\d table_name` - Describe table structure
- `\dn` - List schemas
- `\du` - List users/roles
- `\l` - List all databases
- `\c database_name` - Switch database
- `\conninfo` - Show connection info
- `\q` - Quit psql

## Implementation

1. **Detect environment** using `/proc/version` check for WSL, `$OSTYPE`/`$WINDIR` for Windows
2. **Check if psql is available** using `which psql` (WSL/Linux) or `where psql` (Windows)
3. **Parse invocation arguments:**
   - Extract database name (2nd arg), username (3rd arg), password (4th arg)
   - Apply defaults: host=localhost, port=5432, username=postgres
4. **Smart prompting:**
   - If all 4 args provided: Skip to step 5 (direct connection)
   - If 3 args provided (db + user): Prompt for password only
   - If 2 args provided (db only): Prompt for password only (use default user)
   - If 1 arg (just command): Prompt for password only (use all defaults)
5. **List databases:**
   - WSL/Linux: `PGPASSWORD="<pw>" psql -h localhost -p 5432 -U postgres -d postgres -c "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;" -t -A`
   - Windows: Create batch file with the same query
6. **Display available databases** and prompt user to select one (if database not specified in args)
7. **Test connection** to selected/specified database
8. **If successful**, confirm connection with minimal output (e.g., "Connected to database_name")
9. **Store connection details** for session reuse
10. **Execute ONLY the user's requested query** - do not show table structures, sample records, or additional insights unless explicitly requested
