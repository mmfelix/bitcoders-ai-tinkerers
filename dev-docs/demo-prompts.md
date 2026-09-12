# A complete incident demo

The point is to show work informed by its surroundings and a result visible where the interaction began. Choose either the Slack workflow or the browser workflow, then add only the sponsor capabilities you need.

These are reference interactions to learn from. Build your own project and its core functionality during the event, and distinguish that work from inherited starter code. See [build eligibility](../SUBMISSION.md#build-eligibility).

## Slack: context, sources, card, follow-up

Prerequisites: [Slack setup](setup.md), your selected model provider, Exa for research, and an isolated Ambiguous AI demo workspace for the external-task step. [using-sponsor-tools.md](../using-sponsor-tools.md) give the exact configuration.

### 1. Establish the surrounding context

Before mentioning the bot, put these messages into a thread:

> checkout is timing out for EU customers
>
> started around 02:14, right after the web deploy
>
> rolled web back, did not help — still seeing 4s+ on /checkout
>
> queue depth on payments-worker is climbing

Then ask:

> @agent catch me up on this incident. Read this thread and show an incident card.

Expected: `read_thread` followed by `incident_card`. Check that it includes the failed rollback and growing queue, without your prompt restating them. Ask for a timeline to exercise `timeline`.

### 2. Research with visible sources

> @agent use web search to find documented causes of payment-worker retry storms and safe investigation steps. Include source links and separate published guidance from what this thread proves.

Expected: `search_web` via Exa and inspectable URLs. Search results do not prove the cause of this sample incident. No log reader is included.

### 3. Approve a concrete follow-up

> @agent propose creating one task in our Ambiguous workspace: “Investigate payments-worker retry spike.” Include the failed rollback, rising queue depth, and useful source links. Ask for approval before creating it; do not send mail or change production.

Review the proposed action and approve only the intended demo-workspace write. The managed proposal card records the decision but executes nothing and does not resume the agent. In a separate message, explicitly ask it to create that demo-workspace task and return its record URL. Production proposals remain demonstration-only.

Expected: a **real task record**, with a returned URL you can open from the thread. Verify its title and contents in the workspace. A card or “done” sentence without an actual record is not a successful task demo. MCP tools come from the live workspace; this route is not live-account-verified by the kit's offline checks.

The prompt and `propose_action` guide approval behavior but do not enforce approval around every external MCP call. Use a demo workspace. For an enforced authorization example, run the standalone [Auth0 recipe](auth0/README.md).

## Content: signal, brief, edition, log

This is the Wire Desk demo — the same `apps/channel` app, retargeted from incident response to content drafting. See [SPEC_WIRE_DESK.md](../docs/SPEC_WIRE_DESK.md) (sections 9–11) and [PLAN_HACKATHON.md](../docs/PLAN_HACKATHON.md) for the full design and build checklist.

Prerequisites: [Slack setup](setup.md), your selected model provider, Exa for trend signal.

### 1. Establish the surrounding context

Before mentioning the bot, put these messages into a thread:

> been getting a ton of DMs asking how I actually use Claude Code day to day
>
> feels like everyone's arguing about agentic coding right now, might be worth riding that
>
> we haven't posted anything since the product launch video two weeks ago

Then ask:

> @wiredesk we should make something out of this. Read the thread, check what's actually trending on agentic coding workflows right now, and draft a brief.

Expected: `read_thread`, then `search_web` (Exa) with visible source-link buttons, then `master_brief_card`, then one `edition_card` per relevant platform (at least a Reel, a Threads post, and a blog edition). Check that the brief's hook/development/closing reflect the DM question and the launch-video gap from the thread — not generic content advice.

### 2. Approve a format

Click **Use this Reel** on the Reels edition.

Expected: the card updates in place to "Saved to the archive: **Reel** for ...". No message is posted to any external platform — this only writes to the local decision log. Verify by checking `apps/channel/.data/decisions.json` directly: it must contain a new entry with today's date and platform `instagram_reel`. A changed card alone is not proof; the file write is.

### 3. Ask the follow-up question

> @wiredesk what format am I actually choosing most in the recorded history?

Expected: `get_format_stats` then `format_stats_card`, listing Reel with a count that matches exactly how many times it has been clicked in the recorded history — never an invented industry-average or performance answer. Run this once against a fresh/empty log first and confirm it says plainly there is no history yet, instead of guessing.

### 4. Show a failure path

Unset `EXA_API_KEY` (or use an invalid key) and repeat step 1's mention. Expected: either `search_web` is not registered at all (gated by `isSearchConfigured()` in `channel.tsx`), or if a live key fails mid-run, the thread sees a plain "Web search failed" message before the agent still drafts `master_brief_card` from `read_thread` alone. This is the Technical Execution failure/cancellation evidence [SUBMISSION.md](../SUBMISSION.md#evidence-for-the-judging-criteria) asks for.

## Browser: ambient context and approved workplace actions

```bash
npm run dev:web
```

Open `http://localhost:3100` and select an incident. Try:

> What is happening with the selected incident? Show an incident card and a timeline.

> Propose a follow-up for this incident to investigate the retry spike. Show me the exact task before it is saved.

> Select the other incident and tell me what changed.

Expected: `incident_card`, `timeline`, `propose_followup`, `retrieve_followup`, `refresh_followups`, and `select_incident` as appropriate. The context is derived from the displayed sample data and the Ambiguous records retrieved for the selected incident. The agent prepares a proposal; the page approval button performs the write. `propose_action` provides a separate sample approval UI but does not execute a production action. Web chat does not register Exa search; use Slack or the standalone recipes for that step.

### Add a persistent workplace record

With Ambiguous AI configured, follow [the web template](../apps/web/README.md#try-the-flow): propose an exact task in your demo workspace, approve it with the page button, and open the returned record link if Ambiguous provides one. Refresh the page and retrieve the same ID.

## Record a focused video

1. Show the surface and existing context.
2. Ask a question that relies on that context.
3. Show the native assessment and one complete action or returned research result.
4. Open the actual record or source link.
5. Explain what the surrounding context made possible.

A second surface is optional. State what is sample data, what changed locally, and what reached a real service. See [SUBMISSION.md](../SUBMISSION.md) for the event checklist.

Before recording, use the [four-criterion evidence checklist](../SUBMISSION.md#evidence-for-the-judging-criteria). Show your original interaction, one verified outcome, appropriate user control, and a relevant failure or cancellation case. Sponsor usage should explain how the result became possible.
