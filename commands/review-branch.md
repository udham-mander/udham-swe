---
name: review-branch
aliases: [rb]
description: Review a pull request by branch name. Fetches the branch, determines its base, and provides a thorough code review. Use when the user wants to review a PR or branch changes.
argument-hint: "<branch-name>"
user_invocable: true
---

Review a pull request branch and provide a thorough code review.

## Instructions

1. **Determine the branch name** from the argument passed to the skill (e.g., `/review-branch feature/my-branch`).
   - If no branch name is provided, ask the user which branch to review.

2. **Fetch and prepare**:
   - Run `git fetch origin` to ensure all remote refs are up to date.
   - Check if the branch exists locally or on the remote (`origin/<branch>`).
   - If it doesn't exist, inform the user and stop.

3. **Determine the base branch**:
   - Build a candidate list of base branches by combining:
     - Well-known branches: `main`, `master`, `develop`
     - All `release/*` branches from the remote (e.g., `git branch -r --list 'origin/release/*'`)
   - For each candidate that exists, run `git merge-base origin/<base> origin/<branch>` to find the common ancestor.
   - Pick the candidate whose merge-base is the **most recent commit** (use `git log -1 --format=%ct <merge-base>` to compare timestamps).
   - Tell the user which base branch was detected (e.g., "This branch appears to be based on `release/9.2.0`").

4. **Gather context**:
   - Run `git log --oneline <merge-base>..origin/<branch>` to list all commits in the PR.
   - Run `git diff <merge-base>..origin/<branch>` to get the full diff.
   - Run `git diff --stat <merge-base>..origin/<branch>` to get a summary of changed files.
   - Read the full source files that were changed to understand surrounding context.

5. **Analyze and review** the changes. Evaluate the following aspects:

   ### Code Quality
   - Check for bugs, logic errors, or edge cases.
   - Look for code duplication or missed opportunities to reuse existing code.
   - Check naming conventions and readability.

   ### Architecture & Design
   - Verify changes follow the project's architectural patterns (check CLAUDE.md and Architecture.md if available).
   - Check dependency direction (domain modules should not depend on `controller`).
   - Look for proper layer separation (controllers, services, persistence).

   ### Security
   - Check for common vulnerabilities (injection, XSS, auth issues, secrets in code).
   - Verify input validation at system boundaries.

   ### Testing
   - Check if new/changed code has corresponding tests.
   - Evaluate test quality - are edge cases covered?
   - Flag any untested code paths.

   ### Style & Conventions
   - For Kotlin: check if `ktlintFormat` likely needs to be run.
   - For Java: check Javadoc completeness, `@NullMarked` usage.
   - For Angular: check component patterns, typing.

   ### Potential Issues
   - Database migration concerns (backwards compatibility, performance).
   - Breaking API changes.
   - Performance implications.

6. **Present the review** using the exact output format below.

7. **2nd Pass — Deep Dive on Suggestions**:
   After presenting the review, do a second pass over every suggestion and should-fix finding. For each one:
   - Read additional surrounding source code, callers, tests, or related files as needed to fully understand the context.
   - Investigate whether the concern is valid or a false positive given the broader codebase.
   - If valid, provide a concrete code example or diff showing exactly how to fix it.
   - If investigation reveals the concern is a false positive, explicitly retract it with an explanation.
   - Present this as a "### Deep Dive" section after the Verdict.

## Output Format

Use this structure for the review output:

```
## PR Review: `<branch-name>`

**Branch:** `origin/<branch>` → `<base-branch>` | **N file(s)**, +X/-Y

### Summary

1-2 sentences describing what the PR does and why.

### Findings

Table of findings, followed by code snippets for findings that need visual context.

| # | Severity | Location | Finding | Recommendation |
|---|----------|----------|---------|----------------|
| 1 | ⚠️ | `File:line` | Description of issue | Suggested fix |
| 2 | 💡 | `File:line` | Suggestion | Suggested improvement |
| 3 | 🔍 | `File:line` | Minor nit | Suggested tweak |

After the table, show code snippets ONLY for findings that need them:

**#1:**
<short diff or code snippet showing the problem>

**#2:**
<short diff or code snippet showing the problem>

(skip snippets for self-explanatory findings)

Severity legend: ⚠️ = should fix, 💡 = suggestion, 🔍 = nit

### Verdict

✅ **Approve** / ✅ **Approve with comments** / ❌ **Request changes**
Brief rationale.

### Deep Dive

For each ⚠️ and 💡 finding, a detailed investigation:

**#N: <Finding title>**
- **Investigation**: What additional code/context was examined (files, callers, related logic).
- **Conclusion**: Confirmed issue / False positive / Partially valid.
- **Suggested fix** (if confirmed):
  ```diff
  - old code
  + new code
  ```
  Or explanation of why no change is needed if retracted.
```

## Important Notes

- Be constructive and specific - explain *why* something is an issue, not just *that* it is.
- Acknowledge good patterns and well-written code where appropriate.
- If the diff is very large, focus on the most impactful changes first.
- Consider the project conventions defined in CLAUDE.md when reviewing.
- Do NOT push, commit, or modify any code. This is a read-only review.
- Do NOT include a "Changes" section — go straight from Summary to Findings.
- Show code/diff ONLY in the Findings section, and only for findings that need visual context.
