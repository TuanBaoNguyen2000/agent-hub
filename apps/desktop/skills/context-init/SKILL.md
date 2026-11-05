---
name: context-init
description: Create the shared context documents for a project or a new workstream (README, PROJECT_CONTEXT, code survey notes, workstream BRIEF, STATUS, DECISIONS, tasks with acceptance criteria) from a brief, GDD or spec and the codebase. Use when the context folder is empty, when the user starts a new project or a new stream of work, or asks to set up context documents.
---

# context-init

Set up the documents every later session reads with `context-resume`. Quality here decides how well other accounts and agents can continue, so ask rather than invent.

## Find the context folder

Use the path from the opening prompt, or the AgentHub MCP tools if available, or ask the user. If the folder already has documents, only add a new workstream, in the workstream folder they already use (`Workstreams/`, or another name such as `Playables/`); never overwrite existing files.

## Gather input

- The brief: GDD, spec, Notion export, PDF, images, links the user gives. Keep links to the originals; do not copy whole sources.
- The codebase: read-only survey of structure, build and test commands, conventions, risky areas. Never change code in this skill.
- Documents the project already has, when the opening prompt lists them ("Existing docs"): read them, link to them from `PROJECT_CONTEXT.md` or the workstream `BRIEF.md` with a short summary of each, and do not copy them. Ask the user which of them are still current.
- Ask the user about anything the brief leaves open or contradicts. List the questions together rather than one at a time.

## Layout

```text
<context folder>/
├── README.md            # How this folder is organised, for people
├── PROJECT_CONTEXT.md   # Environment, build/test commands, terms, project-wide pitfalls
├── <TOPIC>.md           # Optional code survey notes (architecture, a subsystem)
└── Workstreams/
    └── <slug>/
        ├── BRIEF.md       # The original request, with links to sources
        ├── STATUS.md      # Entry point: in progress, blockers, next step, task table
        ├── DECISIONS.md   # Append-only: decision, reason, rejected options
        └── Tasks/
            └── TASK-001-<slug>.md
```

Each task file has: goal, acceptance criteria (testable), notes, and an empty "Handoff log" section where `context-checkpoint` adds entries newest first.

Use lowercase-hyphen slugs and three-digit task numbers. Write in the language the prompt asks for (English by default). Use absolute dates.

## Instruction files

Only when the context folder is inside the repository: propose a short `AGENTS.md` that points to the folder, and a `CLAUDE.md` that contains only `@AGENTS.md`. If either file exists, propose a few lines to insert. Show the diff and wait for approval. Never copy project knowledge into these files. When the folder is outside the repository, do not create or change them.

## Finish

List the files you created and the open questions. Suggest the first task to start with.
