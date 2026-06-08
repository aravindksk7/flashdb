# FlashDB Copilot Instructions

This repository uses Ruflo (claude-flow) for multi-agent coordination and memory.

## Primary Roles
- Copilot/Codex: executor (implementation, tests, refactors)
- Ruflo MCP: coordinator (routing, swarm, memory, hooks)

## Required Workflow
1. Read AGENTS.md at repository root before major tasks.
2. For multi-file or complex work, call Ruflo MCP tools first (for example: swarm_init, hooks_route, memory_search).
3. Continue implementation immediately after MCP coordination calls. Do not stop after routing.
4. Store reusable outcomes with memory_store when a pattern is successful.

## MCP Server Names
Both server names are available for compatibility:
- ruflo
- claude-flow

Prefer ruflo when selecting a server by name.

## Execution Guidance
- Keep implementation files under src, tests under tests.
- Validate input at system boundaries.
- Do not commit credentials or secrets.
- Run build and tests after code changes.

## Useful Commands
- npm run build
- npm test
- npx @claude-flow/cli hooks route --task "<task>"
- npx @claude-flow/cli memory search --query "<query>"
