# Codex Instructions: bitcoders-ai-tinkerers

This repository is built for the **Agents, Everywhere: Bots, Channels, & More** AI Tinkerers Hackathon.

## Workspace Overview

The project provides three template applications built around CopilotKit and AI agent workflows:
1. **`apps/channel/` (Slack Template):**
   - Built on CopilotKit Channels + Exa.
   - Listens to Slack thread history, invokes search/reasoning tools, and posts native structured cards.
   - Skill documentation: `.agents/skills/build-channels-agent/SKILL.md`.
2. **`apps/web/` (Web Template):**
   - Built on Next.js + CopilotKit React + Ambiguous AI.
   - Provides an in-app workspace agent with frontend tools, streamed UI components, and human approval steps.
3. **`apps/mobile/` (Mobile Template):**
   - Built on React Native / Expo + CopilotKit React Native.
   - Uses an isolated mobile runtime served by `apps/web` with local state approvals.
4. **`packages/agent-core/`:**
   - Shared data models, types, and model normalization utilities across apps.

---

## Critical Rules & Guardrails

- **`@ag-ui/client` must stay deduped:** The root `package.json` pins it via `overrides` to the exact version `@copilotkit/runtime` declares. Two copies produce two `AbstractAgent` types and break `createChannel({ agent })`.
- **`@copilotkit/channels` & `@copilotkit/runtime`:** Always keep them as an exact matching version pair.
- **JSX in Channels must be `.tsx`:** `tsconfig.json` must specify `jsxImportSource: "@copilotkit/channels"`.
- **`maxSteps` on `BuiltInAgent`:** Must be > 1 for any agent utilizing tools (otherwise it halts before receiving tool output).
- **Handlers return `void`:** `thread.post()` returns a `MessageRef`; use a block body with `await`.
- **Never invent components or props:** Keep to the verified vocabulary in `.agents/skills/build-channels-agent/references/ui-components.md`.
- **Write Boundaries:** Any destructive external action must require human-in-the-loop approval before executing.

---

## Verification Commands

Always run these verification commands to ensure zero regressions:

```bash
# Verify root packages (Slack channel, Web app, Agent core)
pnpm run verify

# Verify mobile package
cd apps/mobile && pnpm test && pnpm run typecheck
```

---

## MCP Servers Available

- **`copilotkit`:** `https://mcp.copilotkit.ai/mcp`
- **`exa`:** `https://mcp.exa.ai/mcp`
- Registered globally in `~/.codex/config.toml` and locally in `.mcp.json`.

---

## Hackathon Judging Strategy

To achieve a 5/5 score across all judging criteria (Core Requirements, Innovation & Theme Alignment, Technical Execution, and Usefulness):
- Avoid generic chatbot wrappers; embed the agent natively into the environment.
- Read [`docs/ESTRATEGIA_JUECES_AI_TINKERERS.md`](file:///home/felixjr/Documentos/Projects/repositories/bitcoders-ai-tinkerers/docs/ESTRATEGIA_JUECES_AI_TINKERERS.md) for full rubric deconstruction and recommended architectures.
