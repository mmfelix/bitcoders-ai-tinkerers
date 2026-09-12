# Slack thread agent

**OpenAI + CopilotKit Channels + Exa**

Build Wire Desk: an agent that reads an existing content conversation, researches public trend signal, and drafts a modular brief with platform-specific editions in the same Slack thread. It records an explicit format choice locally, but never publishes or sends content.

[![Slack thread agent demo](../../assets/demos/slack.gif)](../../assets/demos/slack.mp4)

_Scroll through a completed Slack thread: incident context, Exa source cards, and the final answer. The preview is sped up; click it for the full MP4._

## Get started

Complete the [root clone/install steps](../../README.md#get-started), then configure `.env` with [OpenAI](../../using-sponsor-tools.md#openai), [CopilotKit Intelligence](../../using-sponsor-tools.md#copilotkit), and [Exa](../../using-sponsor-tools.md#exa):

```dotenv
MODEL_PROVIDER=openai
OPENAI_API_KEY=your-key
MODEL=gpt-5.6-sol
CHANNEL_CODE=your-channel-code
INTELLIGENCE_API_KEY=your-project-key
EXA_API_KEY=your-key
EXA_SEARCH_TYPE=fast
# Optional Wire Desk decision archive; defaults to apps/channel/.data/decisions.json
# WIRE_DESK_STORE_PATH=/absolute/path/to/decisions.json
```

Choose an OpenAI model available to your account. Start the official onboarding handoff:

```bash
npm run channel:setup -- --no-clipboard
```

This installs the maintained `channels-setup` skill and prints a prompt. Give that prompt to your coding agent in this checkout and specify **Slack**, using the existing `apps/channel` app. Have the agent follow the skill through sign-in, project/Channel configuration, Slack installation, and a real reply. The command alone does not create the Channel. Keep existing `.env` values; the listener reads `CHANNEL_CODE` and `INTELLIGENCE_API_KEY`. The [shared onboarding notes](../../README.md#copilotkit-onboarding) explain CLI credential naming; the [setup guide](../../dev-docs/setup.md) and [screenshot walkthrough](../../dev-docs/channels-sdk-walkthrough/README.md) provide manual reference.

```bash
npm run dev:slack
```

Invite the bot to a Slack channel and mention it in a populated content-planning thread. CopilotKit Intelligence manages the Slack connection; this listener needs no public tunnel or Slack app token on the managed path.

## Try the flow

1. Add a content idea, audience signal, and publishing gap to a Slack thread before mentioning the agent.
2. Ask it to read the thread, research public signal, and draft a brief. Verify the native brief and editions use the earlier messages.
3. Click one edition's format button. Verify the card updates in place and the isolated JSON archive gains exactly one entry.
4. Ask which format is most chosen in the recorded history. Verify the counts come from the archive, including the explicit empty-history response.

Use the [Wire Desk demo prompts](../../dev-docs/demo-prompts.md#content-signal-brief-edition-log) for exact content inputs. Any external write remains out of scope; the approval card records a local decision without publishing.

## Wire Desk decision archive

The Wire Desk content workflow stores explicit format choices in a local JSON archive. By default this is `apps/channel/.data/decisions.json`; set `WIRE_DESK_STORE_PATH` to use an isolated private or demo archive. Relative overrides resolve from the process working directory, so use an absolute path for tests and rehearsals.

The archive is validated on every read and write. Missing history is an empty first run, but malformed JSON, an empty physical file, or an invalid entry is reported as unavailable and is never replaced automatically. Restore the file manually or configure a new path. The writer uses a private temporary file and an atomic rename to avoid truncating a valid archive, but it does not lock concurrent read-modify-write operations; run one listener and make demo writes sequentially. Concurrent writers can lose updates.

## Customize these files

| Piece | File |
|---|---|
| Agent and model | [Shared agent factory](../../packages/agent-core/src/agent.ts), using CopilotKit's built-in agent |
| Channel lifecycle | [src/channel.tsx](src/channel.tsx): mention, subscribe, respond to subscribed messages |
| Channel-only run adapter | [src/agent.ts](src/agent.ts): keeps outer transcript/state while using fresh inner agent runs |
| Thread context and research | [src/tools.tsx](src/tools.tsx) and [src/search.tsx](src/search.tsx): `read_thread` and Exa-backed `search_web` |
| Native cards | [src/components.tsx](src/components.tsx): brief, edition, and format-history cards via Channels JSX |
| Prompt | [Wire Desk prompt](../../packages/agent-core/src/wire-desk-prompt.ts) |

OpenRouter can be used as the model gateway through the shared provider settings in [using-sponsor-tools.md](../../using-sponsor-tools.md#openrouter). Teams or another messaging platform can reuse the Channels pattern, but this starter app is wired for managed Slack.

## Give this to your coding agent

```text
Read the root hackathon overview, rules, sponsor guide, and AGENTS.md.
Read .agents/skills/build-channels-agent/SKILL.md before changing Slack code.
If Slack is not connected, run npm run channel:setup -- --no-clipboard
from the repository root and follow its prompt using the channels-setup
skill. Select Slack and connect the existing apps/channel app.
Adapt apps/channel to our project's user and conversation. Preserve
read_thread, use Exa when research helps, and render results with Channels JSX.
Replace incident-specific schemas, tools, and prompts with our own workflow.
Demonstrate that earlier messages change the answer and return source links.
Run npm run verify and document the live Slack checks separately.
```

## Verify and limits

Run `npm run verify` for root/channel typechecks and offline tests. Live Slack delivery, Exa search, and model responses require your own accounts and should be documented separately from local tests.

Keep the pinned Channels/runtime pair and the `@ag-ui/client` override. The [Channels skill](../../.agents/skills/build-channels-agent/SKILL.md) supplies the verified API vocabulary. [Channels guide](https://copilotkit.ai/channels-guide.md) · [OpenTag reference app](https://github.com/CopilotKit/OpenTag)
