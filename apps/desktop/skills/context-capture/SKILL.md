---
name: context-capture
description: Turn the current side conversation into a task or workstream in the project's shared context documents, or into a loose chat note when it belongs to no project yet. Use when a chat drifted into new work worth keeping, when the user says to save this as a task or note, or before checkpointing work that has no task.
---

# context-capture

Conversations often start new work by accident. Capture it so it is not lost when the session or account changes.

## Decide where it goes

Ask the user if it is not obvious:

1. **A task in an existing workstream**: next free number in `<workstream folder>/<slug>/Tasks/` (`Workstreams/` unless these documents use another name).
2. **A new workstream**: when the work has its own goal; create `BRIEF.md`, `STATUS.md`, `DECISIONS.md` and the first task, following the layout in the folder's `README.md`.
3. **A loose chat**: when it belongs to no project. Save it with the AgentHub MCP tool `context_capture` (title and Markdown content); any account can read it back with `context_loose_chats`, and the user can move it into a project in AgentHub. Without MCP, print the note as one Markdown block so the user can paste it into AgentHub ("Chat rời").

## Find the context folder

Use the path from the opening prompt, or the AgentHub MCP tools if available, or ask the user. Never guess.

## Write

- Task file: the title, a `Status: To do` line under it (in the documents' language: `Chờ`, `대기`), goal, acceptance criteria as a `- [ ]` checklist, what was learned in this chat (with provenance: verified / observed / reported), open questions, and an empty "Handoff log".
- Add the task to the workstream's `STATUS.md` task table with the state `To do` (in the documents' language: `Chờ`, `대기`), using the next task number free across all workstreams. Re-read `STATUS.md` right before editing and merge with any newer content.
- Keep it short: what someone needs to continue, not a transcript. Never paste secrets, tokens or personal data.

Use absolute dates and the documents' language. Tell the user which files you created.
