---
name: pk-repo-cloner
description: Clone a PK Bitbucket repository. Use when the user needs to clone, download, or set up a PK project from Bitbucket.
argument-hint: "<repo-name>"
user_invocable: true
---

Clone the specified PK Bitbucket repository.

## Instructions

1. **Determine the repository name** from the user's request or the argument passed to the skill (e.g., `/pk-repo-cloner dgsecure-dbms`)
2. **If no repository name is provided**, ask the user which repository to clone
3. **Choose the target directory** - use the current working directory unless specified otherwise
4. **Check prerequisites**:
   - Git is installed and accessible
   - The target directory is writable
   - Prefer SSH cloning when SSH keys appear configured, otherwise fall back to HTTPS
5. **Execute the clone command**:
   ```bash
   git clone git@bitbucket.org:pkware-engineering/{repo-name}.git
   ```
6. **Verify the clone** was successful by checking the cloned directory exists
7. **Post-clone**: Confirm success, display location, and mention README/CLAUDE.md if present

## Common PK Repositories

- `dgsecure-dbms` - Database security platform (Discovery and Masking IDPs)
- `dme` - Discovery Masking Engine
- `dsm` - Data Security Manager

## Error Handling

- If authentication fails, suggest checking SSH keys or Bitbucket credentials
- If repository not found, verify the repository name spelling
- If network issues occur, suggest checking VPN connection if applicable
- If cloning into an existing directory, warn about potential conflicts

## Important Notes

- Always confirm the repository name with the user if ambiguous
- Do not store or expose credentials in command output
- Respect any branch or tag specifications from the user
