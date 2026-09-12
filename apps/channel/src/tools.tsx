/**
 * The Wire Desk agent's tools.
 *
 * A channel tool handler receives the LIVE thread, which is what makes the
 * proposal below possible: it posts a card and returns. A later click reports
 * the decision; it does not resume the agent or execute an action.
 *
 * The return value is what the *agent* reads back, not what the user sees.
 * Return raw data (it is JSON-stringified for you) or a short natural-language
 * confirmation — never `{ ok: true }`, and never hand-stringify.
 */
import {
  defineChannelTool,
  Message,
  Header,
  Section,
  Markdown,
  Context,
  Actions,
  Button,
  isChannelDeliveryTerminatedError,
} from "@copilotkit/channels";
import type { InteractionContext } from "@copilotkit/channels";
export { searchTheWeb } from "./search";
import { z } from "zod";
import {
  appendDecision,
  decisionInputSchema,
  DecisionStoreError,
  getFormatStats as readFormatStats,
  type DecisionLogEntry,
} from "./store";

/**
 * Read the content context already present in the conversation.
 */
export const readThread = defineChannelTool({
  name: "read_thread",
  description:
    "Read the recent messages in this conversation. Call this FIRST on any content question — the thread contains the team's topic, audience, constraints, and prior decisions. Do not ask people to repeat context that is already here.",
  parameters: z.object({}).strict(),
  async handler(_args, { thread }) {
    const messages = await thread.getMessages();
    if (messages.length === 0) {
      return "This surface does not expose conversation history, or the thread is empty. Say that you cannot see earlier messages and ask for the shortest possible summary.";
    }
    return messages;
  },
});

const NO_DECISIONS_MESSAGE =
  "No decisions logged yet. Say plainly there is no history to compare against instead of guessing a favourite format.";

function storeFailureMessage(error: unknown, operation: string): string {
  if (error instanceof DecisionStoreError) {
    if (error.code === "invalid-entry") {
      return `Could not ${operation}: the choice details are incomplete or invalid, so no decision was saved.`;
    }
    if (error.code === "invalid-history") {
      return `Could not ${operation}: the local decision history is invalid. Restore the archive or configure a new WIRE_DESK_STORE_PATH, then retry.`;
    }
    if (error.code === "configuration") {
      return `Could not ${operation}: WIRE_DESK_STORE_PATH is invalid. Configure a non-empty local archive path, then retry.`;
    }
  }
  return `Could not ${operation}: the local decision history is unavailable. Check WIRE_DESK_STORE_PATH and disk access, then retry.`;
}

async function reportStoreFailure(
  thread: unknown,
  message: string,
): Promise<string> {
  const post =
    typeof thread === "object" && thread !== null
      ? (thread as { post?: unknown }).post
      : undefined;
  if (typeof post === "function") {
    try {
      await (post as (content: string) => Promise<unknown>).call(thread, message);
    } catch (error) {
      if (isChannelDeliveryTerminatedError(error)) throw error;
      // The model still receives the safe failure text if the provider rejects
      // the explanatory message.
    }
  }
  return message;
}

/** Record an explicit human format choice in the local decision archive. */
export const logDecision = defineChannelTool({
  name: "log_decision",
  description:
    "Record which format the team explicitly chose for a content idea stated in plain text. Never call this speculatively. Edition approval cards persist their own click directly and must not call this tool again.",
  parameters: decisionInputSchema,
  async handler(
    { idea, sourceTrend, platform, format },
    { thread },
  ): Promise<DecisionLogEntry | string> {
    const entry: DecisionLogEntry = {
      idea,
      sourceTrend,
      platform,
      format,
      decidedAt: new Date().toISOString(),
    };
    try {
      await appendDecision(entry);
      return entry;
    } catch (error) {
      return reportStoreFailure(
        thread,
        storeFailureMessage(error, "record this decision"),
      );
    }
  },
});

/** Return persisted usage counts for the agent's stats card. */
export const getFormatStatsTool = defineChannelTool({
  name: "get_format_stats",
  description:
    "Return how often each format/platform has actually been chosen, most-used first. Call before drafting a new brief, or when asked what format the team uses most.",
  parameters: z.object({}),
  async handler(_args, { thread }) {
    try {
      const stats = await readFormatStats();
      return stats.length ? stats : NO_DECISIONS_MESSAGE;
    } catch (error) {
      return reportStoreFailure(
        thread,
        storeFailureMessage(error, "read format history"),
      );
    }
  },
});

/**
 * Managed delivery cannot block on awaitChoice. Post a proposal and let a later
 * interaction report the decision. This demo has no production executor.
 * Inline handlers require one listener instance that stays running until click.
 */
export const proposeAction = defineChannelTool({
  name: "propose_action",
  description:
    "Post an action proposal for human review. This returns pending immediately. Stop after posting: do not execute the action or call write tools. A later click reports a decision only; it does not execute anything or resume you.",
  parameters: z.object({
    action: z.string().describe("The proposed action, in one plain sentence."),
    blastRadius: z
      .string()
      .describe(
        "What this affects if it goes wrong. Be specific and pessimistic.",
      ),
    reversible: z
      .boolean()
      .describe("Whether this can be undone in under a minute."),
  }),
  async handler({ action, blastRadius, reversible }, { thread }) {
    // The SDK retains inline action handlers after a message replacement. Queue
    // clicks and settle only after a successful update, so stale/opposite clicks
    // cannot overwrite a decision and a failed update remains retryable.
    let settled = false;
    let previousReport = Promise.resolve();
    const reportDecision = (
      approved: boolean,
      ctx: InteractionContext<boolean>,
    ) => {
      const report = async () => {
        if (settled) return;
        const decision = approved
          ? "Approved proposal. No action was executed."
          : "Held by the responder. No action was executed. Do not take the action or offer a workaround.";
        // Use the interaction's thread, whose delivery is live now.
        await ctx.thread.update(
          ctx.message.ref,
          `${decision}\n\nProposal: ${action}`,
        );
        settled = true;
      };
      previousReport = previousReport.then(report, report);
      return previousReport;
    };
    await thread.post(
      <Message accent="#C4145F">
        <Header>Review action proposal</Header>
        <Section>
          <Markdown>{`**${action}**\n\nBlast radius: ${blastRadius}`}</Markdown>
        </Section>
        <Context>
          {reversible
            ? "Reversible in under a minute"
            : "NOT easily reversible"}
        </Context>
        <Context>
          Demo proposal only. Clicking records a decision; it executes nothing.
        </Context>
        <Actions>
          <Button
            value={true}
            style="primary"
            onClick={async (ctx) => {
              await reportDecision(true, ctx);
            }}
          >
            Approve
          </Button>
          <Button
            value={false}
            style="danger"
            onClick={async (ctx) => {
              await reportDecision(false, ctx);
            }}
          >
            Hold
          </Button>
        </Actions>
      </Message>,
    );

    return "Proposal posted; decision pending. Stop here. Do not take the action, call write tools, or offer a workaround. A later click only reports the decision; no action is executed and the agent does not automatically resume.";
  },
});
