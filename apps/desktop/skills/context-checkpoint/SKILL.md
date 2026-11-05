---
name: context-checkpoint
description: Write a checkpoint of the current session into the project's shared context documents (task handoff log, workstream STATUS, DECISIONS, pitfalls) so another account or agent can continue. Use at the end of a session, after a milestone, before switching account or provider, when usage limits are close, or when the user says to save, checkpoint or hand off.
---

# context-checkpoint

Another account or agent will continue from what you write here, possibly with a different provider and without this conversation. Write so that a newcomer can pick up in five minutes.

## Find the context folder

Use the path from the opening prompt, or the AgentHub MCP tools (`context_read`, `context_write`, `context_append_handoff`) if available, or ask the user. Never guess.

## Project without context documents

When `context_projects` shows the project with `documents: false`, or the prompt says it has no documents, there is no folder to update. Write one handoff instead, with the same sections as the entry below (Done, Remaining, Gotchas, How to verify, Git), and save it with the AgentHub MCP tool `context_save_handoff`. Without MCP, print it as one Markdown block and tell the user to paste it into AgentHub ("Thêm handoff" on the project page). Then stop: the rest of this skill is for projects with documents.

## Gather facts first

- Run read-only Git commands: current branch, `git status --short`, last commits. Never checkout, reset, stash or clean.
- Re-read the task file and `STATUS.md` you are about to change, right before changing them. If they changed since you read them earlier, merge with the newer content instead of overwriting it.

## Write

1. **Handoff entry** at the top of the task's log (`<workstream folder>/<slug>/Tasks/TASK-NNN-*.md`, section "Handoff log"; the workstream folder is `Workstreams/` unless these documents use another name, such as `Playables/`), newest first:

   ```markdown
   ### <YYYY-MM-DD HH:MM> — <account or provider> / <agent>
   - **Done:** what changed, with file paths. Mark each claim verified / observed / reported.
   - **Remaining:** next concrete steps, in order.
   - **Gotchas:** traps found, wrong turns to avoid.
   - **How to verify:** exact commands or manual steps.
   - **Git:** branch, last commit, uncommitted files.
   ```

2. **`STATUS.md`** of the workstream: what is in progress, blockers, next step, and the task table. Keep it readable in 30 seconds; it is an entry point, not a log. In the task table, keep the task id (with its title) in the first column and its state in the second, one row per task. Use exactly one of four states, in the documents' language: `To do`, `In progress`, `Blocked`, `Done` (Vietnamese: `Chờ`, `Đang làm`, `Bị chặn`, `Xong`; Korean: `대기`, `진행 중`, `막힘`, `완료`). AgentHub shows and edits this table, and the user may change states or add tasks from AgentHub too. Only write `Done` when the user or a test confirmed the work; an entry "Verified by user in AgentHub" in the handoff log is such a confirmation.
3. **`DECISIONS.md`**: append (never rewrite) any decision made this session: what, why, which alternatives were rejected.
4. **`PROJECT_CONTEXT.md`**: add a pitfall only when it applies to the whole project.

If there is no task yet for this work, create one with `context-capture` first.

## Provenance

- **verified**: a test passed or the user confirmed it.
- **observed**: you saw it in files, Git or tool output.
- **reported**: you or someone said it, nobody checked.

A Git diff only shows which files changed; it does not prove the feature works. Never mark a task done on reported evidence.

## Finish

Tell the user which files you changed. Use absolute dates and the documents' language. Do not commit the documents unless the user asks; if they live inside the repository, the user decides.
