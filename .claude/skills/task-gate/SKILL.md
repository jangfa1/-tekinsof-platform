---
name: task-gate
description: Use before marking any build task done, when resuming the build, or when asked "is this step finished?" — runs the task's verify array from tasks.json, then the standing gate, then commits and tags the checkpoint.
---

# Task gate

## When to use
- Finishing a task from `blueprints/tekinsof-plataforma-comercial/tasks.json`.
- Resuming after a crash with a task left `in_progress`.

## Steps
1. Read `blueprints/tekinsof-plataforma-comercial/tasks.json` fresh from disk.
2. Run every command of the task's `verify` array, in order, from the repository root. Stop at the first failure and fix the code — never the command.
3. Run the standing gate: `pnpm typecheck && pnpm lint && pnpm test`.
4. Set the task `status` to `done` in `tasks.json`.
5. `git add -A && git commit -m "<task id>: <title>"` then `git tag <checkpoint>` (copy the `checkpoint` field verbatim).

## Verify
```bash
git tag -l 'step-*'   # expect: lists the tag just created
```

## Do not
- Edit a `verify` command or skip one because a file is missing — a missing file is unfinished work.
- Invent a tag name; it is the task's `checkpoint` field.
