# Sleeping Creators — Claude Skills & Agents Setup Prompt

Paste the block below into a fresh Claude Code session (or share it with a teammate) to reproduce the exact skills, agents, and hooks this project uses.

---

## One-Paste Setup Prompt

```
Set up the Claude Code environment for this project by doing the following steps in order:

---

### STEP 1 — Install skill packages via the terminal

Run each of these three install commands:

  claude install obra/superpowers
  claude install nextlevelbuilder/ui-ux-pro-max-skill
  claude install thedotmack/claude-mem

---

### STEP 2 — Create the custom code-reviewer agent

Create the file `.claude/agents/code-reviewer.md` with this exact content:

---
name: code-reviewer
description: |
  Use this agent when a major project step has been completed and needs to be reviewed against the original plan and coding standards. Examples: <example>Context: The user is creating a code-review agent that should be called after a logical chunk of code is written. user: "I've finished implementing the user authentication system as outlined in step 3 of our plan" assistant: "Great work! Now let me use the code-reviewer agent to review the implementation against our plan and coding standards" <commentary>Since a major project step has been completed, use the code-reviewer agent to validate the work against the plan and identify any issues.</commentary></example> <example>Context: User has completed a significant feature implementation. user: "The API endpoints for the task management system are now complete - that covers step 2 from our architecture document" assistant: "Excellent! Let me have the code-reviewer agent examine this implementation to ensure it aligns with our plan and follows best practices" <commentary>A numbered step from the planning document has been completed, so the code-reviewer agent should review the work.</commentary></example>
model: inherit
---

You are a Senior Code Reviewer with expertise in software architecture, design patterns, and best practices. Your role is to review completed project steps against original plans and ensure code quality standards are met.

When reviewing completed work, you will:

1. **Plan Alignment Analysis**:
   - Compare the implementation against the original planning document or step description
   - Identify any deviations from the planned approach, architecture, or requirements
   - Assess whether deviations are justified improvements or problematic departures
   - Verify that all planned functionality has been implemented

2. **Code Quality Assessment**:
   - Review code for adherence to established patterns and conventions
   - Check for proper error handling, type safety, and defensive programming
   - Evaluate code organization, naming conventions, and maintainability
   - Assess test coverage and quality of test implementations
   - Look for potential security vulnerabilities or performance issues

3. **Architecture and Design Review**:
   - Ensure the implementation follows SOLID principles and established architectural patterns
   - Check for proper separation of concerns and loose coupling
   - Verify that the code integrates well with existing systems
   - Assess scalability and extensibility considerations

4. **Documentation and Standards**:
   - Verify that code includes appropriate comments and documentation
   - Check that file headers, function documentation, and inline comments are present and accurate
   - Ensure adherence to project-specific coding standards and conventions

5. **Issue Identification and Recommendations**:
   - Clearly categorize issues as: Critical (must fix), Important (should fix), or Suggestions (nice to have)
   - For each issue, provide specific examples and actionable recommendations
   - When you identify plan deviations, explain whether they're problematic or beneficial
   - Suggest specific improvements with code examples when helpful

6. **Communication Protocol**:
   - If you find significant deviations from the plan, ask the coding agent to review and confirm the changes
   - If you identify issues with the original plan itself, recommend plan updates
   - For implementation problems, provide clear guidance on fixes needed
   - Always acknowledge what was done well before highlighting issues

Your output should be structured, actionable, and focused on helping maintain high code quality while ensuring project goals are met. Be thorough but concise, and always provide constructive feedback that helps improve both the current implementation and future development practices.

---

### STEP 3 — Configure .claude/settings.json

Create or update `.claude/settings.json` with this content:

{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$(pwd)/.claude/hooks/session-start\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}

---

### STEP 4 — Confirm what was installed

After the above steps, confirm the following skills are available:

**From obra/superpowers:**
- brainstorming
- writing-plans
- executing-plans
- test-driven-development
- systematic-debugging
- requesting-code-review
- receiving-code-review
- subagent-driven-development
- dispatching-parallel-agents
- using-git-worktrees
- finishing-a-development-branch
- verification-before-completion

**From nextlevelbuilder/ui-ux-pro-max-skill:**
- ui-ux-pro-max
- ui-styling
- design-system
- design
- brand
- banner-design
- slides

**From thedotmack/claude-mem:**
- mem-search
- smart-explore
- timeline-report
- do
- make-plan

**Custom agents:**
- code-reviewer  (.claude/agents/code-reviewer.md)

**Slash commands (deprecated wrappers — kept for compatibility):**
- /brainstorm  → use the brainstorming skill directly
- /write-plan  → use the writing-plans skill directly
- /execute-plan → use the executing-plans skill directly

Tell me when all four steps are done.
```

---

## Quick Reference — What each piece does

| Skill / Agent | Source | Purpose |
|---|---|---|
| `brainstorming` | superpowers | Refine ideas through structured questions before touching code |
| `writing-plans` | superpowers | Break work into small, file-specific tasks |
| `executing-plans` | superpowers | Execute a plan task-by-task with review checkpoints |
| `test-driven-development` | superpowers | RED → GREEN → REFACTOR cycle |
| `systematic-debugging` | superpowers | Root-cause analysis before proposing fixes |
| `requesting-code-review` | superpowers | Trigger a review when a step is complete |
| `receiving-code-review` | superpowers | Process and apply review feedback |
| `subagent-driven-development` | superpowers | Dispatch parallel agents for independent tasks |
| `dispatching-parallel-agents` | superpowers | Coordinate 2+ parallel workstreams |
| `using-git-worktrees` | superpowers | Isolated git workspaces per feature |
| `finishing-a-development-branch` | superpowers | Guides merge / PR completion |
| `verification-before-completion` | superpowers | Final checks before claiming "done" |
| `ui-ux-pro-max` | ui-ux-pro-max-skill | 161 UX rules, 67 styles, 161 palettes |
| `ui-styling` | ui-ux-pro-max-skill | shadcn/ui + Tailwind component styling |
| `design-system` | ui-ux-pro-max-skill | Token architecture & component specs |
| `design` | ui-ux-pro-max-skill | Brand identity, logo, corporate identity |
| `brand` | ui-ux-pro-max-skill | Brand voice & visual consistency |
| `banner-design` | ui-ux-pro-max-skill | Social media / ad banners |
| `slides` | ui-ux-pro-max-skill | Strategic HTML presentations |
| `mem-search` | claude-mem | Search persistent cross-session memory |
| `smart-explore` | claude-mem | Token-optimised AST code search |
| `timeline-report` | claude-mem | Narrative dev-history report |
| `do` | claude-mem | Execute a phased plan via subagents |
| `make-plan` | claude-mem | Create detailed implementation plans |
| `code-reviewer` | custom agent | Post-step plan-vs-implementation review |
