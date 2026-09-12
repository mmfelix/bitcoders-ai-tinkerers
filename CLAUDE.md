# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the **Agents, Everywhere** hackathon starter kit — a monorepo containing three runnable agent templates for building agents that live where people work. Each template demonstrates context-aware agents in different surfaces:

- **apps/channel** — Slack thread agent using CopilotKit Channels + Exa search
- **apps/web** — Next.js web app agent using CopilotKit React + Ambiguous AI
- **apps/mobile** — React Native mobile agent using Expo + CopilotKit

All three templates share a common agent implementation in `packages/agent-core`.

## Essential Commands

### Root workspace (Slack and web)
```bash
# Install dependencies (use pnpm, not npm)
pnpm install

# Run verification (typechecks + offline tests)
pnpm run verify

# Slack template
pnpm run dev:slack
pnpm run channel:setup -- --no-clipboard    # Install channels-setup skill
pnpm run channel:status                      # Check Channel connection

# Web template
pnpm run dev:web
```

### Mobile app (separate install)
```bash
cd apps/mobile
npm ci                  # Mobile uses npm, not pnpm
npm test
npm run typecheck
npx expo export         # Verify Metro export
```

## Architecture

### Monorepo Structure

This is a **pnpm workspace** with hoisted dependencies. The workspace includes:
- `packages/agent-core` — shared agent factory, model config, prompts, and capabilities used by all three templates
- `apps/channel`, `apps/web` — use the workspace root's pnpm install
- `apps/mobile` — **separate install** because Expo pins its React Native stack independently

### Shared Agent Core

All three templates point to the same agent implementation in `packages/agent-core/src/`:
- `agent.ts` — agent factory using CopilotKit's BuiltInAgent
- `model.ts` — model provider configuration (OpenAI, OpenRouter)
- `prompt.ts` — shared system prompt
- `capabilities/` — shared tool definitions and schemas
- `mobile-finance-prompt.ts` — mobile-specific prompt variant

When customizing for a project, **replace domain-specific schemas, tools, and prompts** while preserving the infrastructure patterns.

### Template-Specific Files

**Slack (apps/channel):**
- `src/channel.tsx` — Channel lifecycle (mention, subscribe, respond)
- `src/agent.ts` — Channel-only run adapter for fresh inner agent runs
- `src/tools.tsx` — `read_thread` tool for thread context
- `src/search.tsx` — Exa-backed `search_web` tool
- `src/components.tsx` — Native Slack cards via Channels JSX

**Web (apps/web):**
- `src/app/page.tsx` — Main app and selected record state
- `src/components/app-control.tsx` — Frontend tools and `useAgentContext`
- `src/components/workplace-followups.tsx` — Approval UI
- `src/app/api/followups/route.ts` — Server approval boundary
- `src/lib/server/workplace.ts` — Ambiguous AI MCP adapter

**Mobile (apps/mobile):**
- `App.tsx` — Main app entry point
- `src/chat.tsx` — CopilotKit React Native chat interface
- `src/tools.tsx` — Mobile-specific tools with native UI
- `src/finance.ts` — Sample finance data and state

## Critical Technical Constraints

### Dependency Deduplication — MUST STAY DEDUPED

**`@ag-ui/client` must have exactly one copy in the dependency tree.** Two copies produce two `AbstractAgent` types and every `createChannel({ agent })` fails with a confusing "separate declarations of a private property `_debug`" error.

The root `package.json` and `pnpm-workspace.yaml` pin it via `overrides`:
```json
"overrides": { "@ag-ui/client": "0.0.59" }
```

**If you bump `@copilotkit/runtime`, immediately run `pnpm why @ag-ui/client -r` and update the override to match the version Runtime declares.**

### Channels/Runtime Versioning

`@copilotkit/channels` and `@copilotkit/runtime` are a **tested pair**. Bump them together, keep them exact-versioned. Currently:
- `@copilotkit/channels@0.6.x`
- `@copilotkit/runtime@1.70.3`

### CopilotKit Channels API — NEVER INVENT

**Before editing `apps/channel/`, read `.agents/skills/build-channels-agent/SKILL.md`.** This carries the verified Channels API surface.

The most common failure mode: inventing plausible-looking Channels APIs that don't exist. Key facts:

- Files with JSX must be `.tsx` with `jsxImportSource: "@copilotkit/channels"` in tsconfig
- Factory is `createChannel`, tools are `defineChannelTool`, commands are `defineChannelCommand`, context is `ChannelToolContext`
- **The word "bot" does not appear in this API.** No `createBot`, `defineBotTool`, or `BotToolContext`
- Handlers return `void`. `thread.post()` returns `MessageRef`, so arrow bodies fail — use block bodies with `await`
- `maxSteps` defaults to 1 on `BuiltInAgent`. Agents with tools need `maxSteps: 10` or higher
- **Never add `identifyUser` to `CopilotRuntime`** — it belongs on `createChannel` only
- Never invent a component or prop. The vocabulary is fixed — see `references/ui-components.md` in the skill

### JSX in Channels is NOT React

The `.tsx` files in `apps/channel/` use CopilotKit Channels JSX, not React. This renders native Slack/Teams/Discord UI. Don't import React patterns or hooks.

## Integration Patterns

### Environment Configuration

All templates read from root `.env` (copied from `.env.example`):
- `MODEL_PROVIDER` — `openai` or `openrouter`
- `OPENAI_API_KEY` / `OPENROUTER_API_KEY`
- `MODEL` — model identifier (e.g., `gpt-5.6-sol` or `openai/gpt-5.6-sol`)
- `INTELLIGENCE_API_KEY` — CopilotKit Intelligence project key
- `CHANNEL_CODE` — Slack Channel identifier
- `EXA_API_KEY` — web search tool (optional, Slack template)
- `AMBIGUOUS_API_KEY` — workplace records (optional, web template)

**Never commit `.env` or put keys in frontend code.**

### CopilotKit Onboarding

Each template has a specific onboarding path:

**Slack:** Run `pnpm run channel:setup -- --no-clipboard` to install the `channels-setup` skill, then follow its emitted prompt. This provisions the managed Channel and Slack app. The command itself does not create the Channel — the agent follows through sign-in, project selection, and Slack installation.

**Web/Mobile:** To add CopilotKit Intelligence (managed conversations with Rich Threads), use the official onboarding workflow at https://docs.copilotkit.ai/. Preserve the existing app, agent, model provider, tools, and approval behavior.

Read the full guidance in [README.md#copilotkit-onboarding](README.md#copilotkit-onboarding).

### Approval Boundaries

Each template enforces human-in-the-loop approval before external writes:

- **Slack:** Approval cards record decisions without executing production actions (infrastructure example)
- **Web:** Approval button in the page saves the reviewed Ambiguous task via server endpoint
- **Mobile:** Approval changes local in-memory sample data

**Do not expose raw write tools to the agent when page/button approval is required.** Web chat can propose tasks but the server writes only after user clicks "Approve & save to Ambiguous".

## Hard-Won Rules

From `AGENTS.md`:

1. **Files containing JSX must be `.tsx`** with correct tsconfig `jsxImportSource`
2. **`maxSteps` defaults to 1** — agents with tools need more (e.g., 10+)
3. **Handlers return `void`** — use block bodies with `await`, not arrow bodies
4. **Never invent a component or prop** — the Channels vocabulary is fixed
5. **Run `pnpm run verify` before claiming anything works**

## Hackathon Context

This is a starter kit for a specific hackathon. Key files for context:
- `hackathon-overview.md` — challenge, surfaces, judging criteria
- `hackathon-rules.md` — build eligibility, inherited code, deliverables
- `using-sponsor-tools.md` — sponsor setup (OpenAI, CopilotKit, OpenRouter, Exa, Auth0, Ambiguous AI)
- `SUBMISSION.md` — submission checklist
- `dev-docs/demo-prompts.md` — reproducible workflows for each template

**The goal: adapt one template into the team's own project.** Replace the sample incident/finance domain with a different user, problem, dataset, and interaction. The supplied scenarios are infrastructure examples, not the end product.

## Verification Strategy

**Offline checks:**
```bash
pnpm run verify           # Root: typechecks + tests for channel and web
cd apps/mobile && npm test && npm run typecheck
```

**Live integration checks** (document separately):
- Slack: mention bot in populated thread, verify context from earlier messages, check Exa source links
- Web: create/approve/decline task, refresh browser, verify Ambiguous record retrieval
- Mobile: approve expense, verify local state change

Offline tests do not make live sponsor calls. Test the end-to-end flow in the actual environment.

## Common Pitfalls

1. **Installing over the checkout** — adapt the chosen template, don't scaffold a new starter on top
2. **Bumping deps without checking @ag-ui/client** — verify deduplication after upgrades
3. **Inventing Channels APIs from memory** — always check the skill's verified vocabulary
4. **Skipping live verification** — typechecks pass but the Slack delivery or Ambiguous write might fail
5. **Exposing raw write tools** — maintain approval boundaries for external actions
6. **Using generic npm** — root workspace requires pnpm; mobile uses npm but is a separate install

## Resources

- CopilotKit docs: https://docs.copilotkit.ai/
- Channels guide: https://copilotkit.ai/channels-guide.md
- Channels reference app: https://github.com/CopilotKit/OpenTag
- Event details: https://aitinkerers.org/hackathons/global/agents-everywhere
