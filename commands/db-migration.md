---
name: db-migration
aliases: [migrate]
description: Execute DgSecure Controller database migrations with automated backup, verification, and rollback support. Use '/db-migration' or '/migrate' to run database schema migrations.
argument-hint: "<target_version> [database] [password]"
allowed-tools: [Bash, AskUserQuestion, Read, Write, Edit]
user_invocable: true
---

# Database Migration Skill

Automates PostgreSQL database migrations for DgSecure Controller using the DgScriptExecutor tool. Handles schema placeholder substitution, procedural block execution, backup creation, and comprehensive verification.

## Usage

Invoke with: `/db-migration` or `/migrate`

Optional arguments:
- `/migrate` - Prompt for all parameters interactively
- `/migrate <target_version>` - Migrate to specific version (e.g., `/migrate 10.0.0`)
- `/migrate <target_version> <database>` - Specify version and database name
- `/migrate <target_version> <database> <password>` - Full specification, no prompts

**Defaults:**
- Host: localhost
- Port: 5432
- Username: postgres
- Database: dg_10_mig
- Config: ddl-tests/src/main/resources/postgres.json

## Examples

| Invocation | Behavior |
|------------|----------|
| `/migrate` | Interactive mode - prompt for all parameters |
| `/migrate 10.0.0` | Migrate to 10.0.0, prompt for database and password |
| `/migrate 10.0.0 dg_10_mig` | Migrate dg_10_mig to 10.0.0, prompt for password |
| `/migrate 10.0.0 dg_10_mig MyP@ssword` | Full automatic migration, no prompts |

## Environment Detection

Before executing any PostgreSQL or system commands, detect the runtime environment:

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
   - **Windows (cmd/PowerShell)**: Use batch files (see Windows-Specific section below)

3. **Check tool availability**:
   - WSL/Linux: `which psql`, `which java`
   - Windows: `where psql`, `where java`

## Workflow

### Phase 1: Pre-Migration Checks
1. **Detect environment** (WSL, Windows, or Linux) using the detection logic above
2. **Verify working directory** - Must be in dgsecure-controller project root
3. **Check psql availability** - Verify PostgreSQL client is installed
4. **Verify DgScriptExecutor JAR** - Check if `installer/build/installerDist/contrib/sql-script-executor.jar` exists
5. **Prompt for parameters** if not provided:
   - Target version (e.g., 10.0.0)
   - Database name (default: dg_10_mig)
   - Database password
6. **Verify current database version** - Query `dg_dataguise_info` table

### Phase 2: Backup
7. **Create timestamped backup** using pg_dump
   - Format: `dg_<database>_backup_YYYYMMDD_HHMMSS.sql`
   - Location: Current directory
   - Verify backup file created successfully

### Phase 3: Configuration
8. **Read current postgres.json** - Backup original values
9. **Update postgres.json** for migration:
   - Set `"migration": "true"`
   - Set `"dgDatabase": "<target_database>"`
   - Set `"adminPassword": "<provided_password>"`
   - Preserve all schema mappings

### Phase 4: Execution
10. **Execute DgScriptExecutor** with migration flag:
    ```bash
    java -jar installer/build/installerDist/contrib/sql-script-executor.jar \
      -config ddl-tests/src/main/resources/postgres.json \
      -migration true \
      -filepath ddl/migrations \
      -sv "@@product_version@@:<target_version>"
    ```
11. **Monitor execution output** - Display script execution progress

### Phase 5: Verification
12. **Verify database version** - Confirm version updated to target
13. **Run artifact verification queries** - Check for expected database objects:
    - Sequences created
    - Triggers created
    - Tables/columns modified
    - Data migrated
14. **Display verification results** - Show checklist with pass/fail status

### Phase 6: Cleanup
15. **Revert postgres.json** - Restore original `"migration": "false"` and `"dgDatabase"` values
16. **Provide summary** - Migration status, time taken, artifacts verified
17. **Save execution log** - Create migration log file with timestamp

## PostgreSQL Command Execution

### WSL / Linux
Use inline environment variables or export:
```bash
PGPASSWORD="<password>" psql -h localhost -p 5432 -U postgres -d <database> -c "<sql_command>" -t -A
```

Or for multiple commands:
```bash
export PGPASSWORD="<password>"
psql -h localhost -p 5432 -U postgres -d <database> -c "<sql_command>" -t -A
unset PGPASSWORD
```

### Windows (cmd / PowerShell)
**CRITICAL:** Always use batch files — inline `set PGPASSWORD=... && psql ...` fails silently on Windows.

```batch
@echo off
set PGPASSWORD=<password>
psql -h localhost -p 5432 -U postgres -d <database> -c "<sql_command>" -t -A
```

- Create batch files in `%TEMP%` with unique names: `migration_<step>_<timestamp>.bat`
- Call with quoted paths: `"C:\path\to\file.bat"`

## Migration Script Patterns

### Schema Placeholder Substitution
The DgScriptExecutor automatically replaces these placeholders:
- `@@DatabaseName@@` → Database name from postgres.json
- `@@dgcontroller@@` → Controller schema name
- `@@dghdfsinfo@@` → HDFS info schema name
- `@@dgdashboard@@` → Dashboard schema name (dgstar)
- `@@product_version@@` → Version from `-sv` parameter

### Block Execution
Scripts use `-- start block` and `-- end block` markers for procedural code:
```sql
-- start block
CREATE OR REPLACE PROCEDURE my_procedure()
LANGUAGE 'plpgsql'
AS $$
BEGIN
    -- procedure body with semicolons
END$$;
-- end block
```
- Blocks are executed as atomic units
- Internal semicolons are ignored
- Functions, procedures, and DO blocks must use markers

### Idempotency Patterns
Migration scripts must be re-runnable:
- `CREATE OR REPLACE PROCEDURE/FUNCTION`
- `DROP TABLE IF EXISTS`
- `DROP COLUMN IF EXISTS`
- `INSERT ... ON CONFLICT DO NOTHING`
- `IF EXISTS (SELECT ... INFORMATION_SCHEMA)` checks

## Verification Checklist

After migration, the skill automatically verifies:

**For 10.0.0 migration:**
- [ ] Database version = 10.0.0
- [ ] revinfo_seq sequence created
- [ ] 10 regex patterns (IDs 499-508) exist
- [ ] 5 numeric regex masking rules (IDs 480-484) created
- [ ] Columns 'is_global' and 'global_domain' dropped
- [ ] 5 target immutability triggers created

**Generic checks:**
- [ ] Version number updated in dg_dataguise_info
- [ ] No SQL errors in execution output
- [ ] Application can connect to database

## Error Handling

### Error: "DgScriptExecutor JAR not found"
**Cause:** Installer module not built
**Solution:** Run `./gradlew :installer:assemble` to build JAR

### Error: "No output from DgScriptExecutor"
**Cause:** Missing `-migration true` flag or wrong filepath
**Solution:** Ensure using `-migration true` with parent directory path

### Error: "Schema placeholders not substituted"
**Cause:** postgres.json schema mappings incorrect
**Solution:** Verify schemas section in postgres.json matches database

### Error: "Partial migration state"
**Cause:** Previous migration interrupted
**Solution:** Re-run migration (scripts are idempotent)

### Error: "Authentication failed"
**Cause:** Incorrect password or user permissions
**Solution:** Verify credentials and user has DDL privileges

## Rollback Procedure

If migration fails, the skill will offer to rollback:

```bash
# Drop current database
dropdb -h localhost -p 5432 -U postgres <database_name>

# Recreate database
createdb -h localhost -p 5432 -U postgres <database_name>

# Restore from backup
psql -h localhost -p 5432 -U postgres -d <database_name> < backup_file.sql
```

**WARNING:** Rollback discards all changes since backup. Ensure backup is current.

## Configuration Files

### postgres.json Structure
**Location:** `ddl-tests/src/main/resources/postgres.json`

**Required fields:**
```json
{
  "migration": "true",
  "databaseType": "postgres",
  "host": "localhost",
  "port": 5432,
  "adminUserName": "postgres",
  "adminPassword": "***",
  "sslFlag": "false",
  "verifyCert": "false",
  "filePath": "ddl/installation",
  "defaultDatabase": "postgres",
  "dgDatabase": "dg_10_mig",
  "schemas": {
    "dgcontroller": "dgcontroller",
    "dgcontrol": "dsm_control",
    "dghdfsinfo": "dghdfsinfo",
    "dgdashboard": "dgstar",
    "dgreport": "dsm_report"
  }
}
```

**IMPORTANT:** After migration, revert:
- `"migration": "false"`
- `"dgDatabase"` to original value

## Migration Directory Structure

```
ddl/
├── migrations/
│   ├── 8_0_0_to_8_1_0/postgres/
│   ├── 8_1_0_to_8_2_0/postgres/
│   ├── ...
│   ├── 9_2_0_to_10_0_0/postgres/
│   │   ├── 00_Pgs_ddl_Version.sql
│   │   ├── 01_Pg_DgController.sql
│   │   ├── 09_Pg_cups.sql
│   │   ├── 10_Pg_DgControllerRegex.sql
│   │   ├── 11_Pg_DgControllerMaskingOptions.sql
│   │   ├── 12_Pg_DgHdfsInfo.sql
│   │   └── 13_Pg_DgControllerRegexNumeric.sql
│   └── 10_0_0_to_10_1_0/postgres/
```

Scripts execute in numerical/alphabetical order within each version directory.

## Advanced Options

### Skip Backup (Not Recommended)
If you're confident and want to skip backup:
```
/migrate 10.0.0 dg_10_mig password --skip-backup
```
**WARNING:** Only use for development databases.

### Dry Run Mode
Test migration without executing:
```
/migrate 10.0.0 dg_10_mig password --dry-run
```
- Verifies parameters
- Checks JAR existence
- Shows scripts that would execute
- Does NOT modify database

### Specific Version Migration
To run only specific version scripts (not all previous):
```
/migrate 10.0.0 dg_10_mig password --specific-version 9.2.0
```
Executes only 9_2_0_to_10_0_0 scripts.

### Verbose Mode
Show detailed execution output:
```
/migrate 10.0.0 dg_10_mig password --verbose
```
Displays full DgScriptExecutor output with SQL statement logging.

## Security Best Practices

1. **Password Handling**
   - WSL/Linux: Use `PGPASSWORD` env var, unset after use
   - Windows: Use batch files, passwords set via `set PGPASSWORD`
   - Never log passwords to console or files
   - Clear credentials after execution

2. **Backup Security**
   - Backup files contain full database dump
   - Store backups securely (contain sensitive data)
   - Delete old backups after successful migration

3. **Configuration Security**
   - postgres.json contains encrypted credentials
   - Use encrypt-decrypt-db-credentials tool for password management
   - Never commit unencrypted passwords to git

## Migration Skill Invocation

When user runs `/migrate` or `/db-migration`:
1. Detect environment (WSL/Windows/Linux)
2. Parse arguments and apply defaults
3. If missing parameters, use AskUserQuestion for interactive prompts
4. Execute pre-migration checks (directory, tools, JAR)
5. Show migration plan and ask for confirmation
6. Execute migration workflow (backup → configure → migrate → verify → cleanup)
7. Display detailed results and next steps
8. Offer rollback if any errors occurred

**Do NOT:**
- Run migration without user confirmation
- Skip backup unless explicitly requested
- Proceed if pre-migration checks fail
- Leave postgres.json in migration mode
- Delete backup files automatically
