# AGENTS.md

Project guidelines for AI coding agents working in this repository.

## Rules

- Keep responses short and practical.
- Do not consume extra tokens with long explanations unless asked.
- Use `nvm` before running Node.js or pnpm commands.
- Prefer the project Node version from `.nvmrc` when it exists.
- Do not automatically create commits.
- Do not automatically push branches or open PRs.
- Ask before doing destructive actions.
- Prefer small, focused changes.
- Run relevant checks after changes when possible.
- Always work directly in `/home/hllink/projects/MockDock` unless the user explicitly asks for a different location.
- Do not implement changes in external worktrees or outside this repository checkout unless the user explicitly asks for it.
- Follow the existing project structure and keep backend and frontend separated.

## Commands

- Start shell sessions with `nvm use` before Node-related work.
- Prefer `pnpm` for package management.

## Notes

- This project is a monorepo.
- Backend lives in `apps/server`.
- Frontend lives in `apps/web`.
- Shared code should stay in `packages/`.
