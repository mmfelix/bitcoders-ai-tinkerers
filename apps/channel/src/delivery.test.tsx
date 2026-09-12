import { it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AbstractAgent } from "@ag-ui/client";
import { EventType, type BaseEvent, type RunAgentInput } from "@ag-ui/core";
import { from, type Observable } from "rxjs";
import { createChannel, MemoryStore } from "@copilotkit/channels";
import { startChannelsWithGatewayControl } from "@copilotkit/channels-intelligence";
import type { searchWeb } from "agent-core";
import { EditionCard, IncidentCard } from "./components";
import { createSearchTool } from "./search";
import { ManagedGateway, preparedDelivery } from "./testing/managed-gateway";
import { z } from "zod";

/** Real AG-UI events exercise the SDK tool loop and Slack renderer together. */
class ResearchAgent extends AbstractAgent {
  private iteration = 0;
  constructor(private readonly withIncident = true) {
    super();
  }
  override clone(): ResearchAgent {
    const clone = new ResearchAgent(this.withIncident);
    clone.threadId = this.threadId;
    clone.setMessages([...this.messages]);
    clone.setState(this.state);
    clone.iteration = this.iteration;
    return clone;
  }
  run(input: RunAgentInput): Observable<BaseEvent> {
    const calls = [
      { name: "search_web", args: { query: "retry storm", results: 1 } },
      {
        name: "incident_card",
        args: {
          severity: "sev2",
          headline: "Retries are amplifying latency",
          impact: "Checkout requests time out",
          started: "09:03 UTC",
          known: ["Connection-pool wait increased"],
          trying: ["Investigating retry policy"],
        },
      },
    ];
    const call = calls[this.iteration++];
    const activeCall =
      this.withIncident || this.iteration === 1 ? call : undefined;
    const events: BaseEvent[] = [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ];
    if (activeCall) {
      const toolCallId = `tool_${this.iteration}`;
      events.push(
        {
          type: EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName: activeCall.name,
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta: JSON.stringify(activeCall.args),
        },
        { type: EventType.TOOL_CALL_END, toolCallId },
      );
    }
    events.push({
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    });
    return from(events);
  }
}

async function runResearch(search: typeof searchWeb, withIncident = true) {
  const gateway = new ManagedGateway();
  const channel = createChannel({
    name: "support",
    identifyUser: "platform",
    showToolStatus: true,
    agent: () => new ResearchAgent(withIncident),
    components: [IncidentCard],
    tools: [createSearchTool(search)],
  });
  let failure: unknown;
  channel.onMessage(async ({ thread }) => {
    try {
      await thread.runAgent();
    } catch (error) {
      failure = error;
      throw error;
    }
  });
  let agentMessages: AbstractAgent["messages"] = [];
  const handle = await startChannelsWithGatewayControl([channel], {
    session: gateway,
    scope: { projectId: 1, channelName: "support" },
    runtimeInstanceId: "rti_research",
    loadHistory: async () => [],
    appApiBaseUrl: "https://api.example",
    apiKey: "cpk-offline-test",
    appApiFetch: async (input) => {
      if (String(input).endsWith("/charge"))
        return Response.json({ charged: true });
      assert.ok(
        String(input).endsWith("/transcript"),
        `Unexpected request: ${input}`,
      );
      return Response.json({
        messages: [],
        truncation: {
          messageLimit: false,
          byteLimit: false,
          omittedMessageCount: 0,
        },
      });
    },
    runCanonical: async (args) => {
      const result = await args.execute(
        {},
        { threadId: args.threadId, runId: args.runId },
      );
      agentMessages = args.agent.messages;
      return result;
    },
  });
  try {
    await gateway.deliver(
      preparedDelivery("research", "slack", {
        kind: "text",
        text: "Research the incident and show a card",
      }),
    );
    return {
      gateway,
      payloads: gateway.packets.map(({ payload }) => payload),
      failure,
      agentMessages,
    };
  } finally {
    await handle.stop();
  }
}

it(
  "clears native Slack status before completing a research run with only tool cards",
  { timeout: 10_000 },
  async () => {
    const { gateway, payloads, failure, agentMessages } = await runResearch(
      async () => [
        { title: "Retry guidance", url: "https://example.com/retries" },
      ],
    );
    assert.equal(failure, undefined);
    const cards = payloads.filter(
      (payload) => payload.kind === "slack.message.create",
    );
    assert.equal(cards.length, 2, JSON.stringify({ payloads, agentMessages }));
    assert.match(JSON.stringify(cards[0]), /Search sources/);
    assert.match(JSON.stringify(cards[1]), /Retries are amplifying latency/);
    const statuses = payloads.filter(
      (payload) => payload.kind === "slack.thread.status",
    );
    assert.ok(
      statuses.some((payload) => payload.status !== ""),
      "must exercise the native working indicator",
    );
    assert.equal(
      statuses.at(-1)?.status,
      "",
      "last status effect must clear the working indicator",
    );
    const streamStop = payloads.findIndex(
      (payload) => payload.kind === "slack.stream.stop",
    );
    assert.ok(
      streamStop >= 0 && streamStop < payloads.length - 1,
      "native stream must stop before terminal completion",
    );
    const terminal = payloads.at(-1);
    assert.ok(terminal?.kind === "channel.delivery.terminal");
    assert.equal(terminal.status, "complete");
    assert.deepEqual(
      gateway.packets.map((packet) => packet.seq),
      payloads.map((_, index) => index),
    );
  },
);

class EditionAgent extends AbstractAgent {
  private iteration = 0;

  override clone(): EditionAgent {
    const clone = new EditionAgent();
    clone.threadId = this.threadId;
    clone.setMessages([...this.messages]);
    clone.setState(this.state);
    clone.iteration = this.iteration;
    return clone;
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    const events: BaseEvent[] = [
      {
        type: EventType.RUN_STARTED,
        threadId: input.threadId,
        runId: input.runId,
      },
    ];
    if (this.iteration++ === 0) {
      const toolCallId = "edition_tool_1";
      const args = {
        idea: "Agentic coding diary",
        sourceTrend: "thread only",
        platform: "instagram_reel",
        format: "Reel",
        content: "Three commands that make an agentic coding session clearer.",
      };
      events.push(
        {
          type: EventType.TOOL_CALL_START,
          toolCallId,
          toolCallName: "edition_card",
        },
        {
          type: EventType.TOOL_CALL_ARGS,
          toolCallId,
          delta: JSON.stringify(args),
        },
        { type: EventType.TOOL_CALL_END, toolCallId },
      );
    }
    events.push({
      type: EventType.RUN_FINISHED,
      threadId: input.threadId,
      runId: input.runId,
    });
    return from(events);
  }
}

class RejectFirstEditionUpdateGateway extends ManagedGateway {
  private rejectNextUpdate = true;

  override async join(topic: string, payload: unknown) {
    const channel = await super.join(topic, payload);
    return {
      ...channel,
      push: async (event: string, packet: unknown) => {
        const ack = await channel.push(event, packet);
        const parsed = z
          .object({ payload: z.object({ kind: z.string() }) })
          .parse(packet);
        if (
          parsed.payload.kind === "slack.message.replace" &&
          this.rejectNextUpdate
        ) {
          this.rejectNextUpdate = false;
          return {
            ...ack,
            phase: "failed",
            result: {
              ...ack.result,
              status: "failed",
              error: "provider_failed",
            },
          };
        }
        return ack;
      },
    };
  }
}

function editionActionId(payload: unknown): string {
  const card = z
    .object({
      kind: z.literal("slack.message.create"),
      blocks: z.unknown(),
    })
    .parse(payload);
  const blocks = z
    .array(
      z.object({
        type: z.string(),
        elements: z.array(z.unknown()).optional(),
      }),
    )
    .parse(card.blocks);
  const buttons = blocks
    .flatMap((block) =>
      block.type === "actions" ? (block.elements ?? []) : [],
    )
    .map((element) =>
      z
        .object({
          type: z.literal("button"),
          text: z.object({ text: z.string() }),
          action_id: z.string(),
        })
        .parse(element),
    );
  const button = buttons.find((candidate) =>
    candidate.text.text.includes("Use this Reel"),
  );
  assert.ok(button, "edition card must expose the real Slack action id");
  return button.action_id;
}

async function startEditionDelivery(
  gateway: ManagedGateway,
  storePath: string,
  runtimeInstanceId: string,
) {
  const previousPath = process.env.WIRE_DESK_STORE_PATH;
  process.env.WIRE_DESK_STORE_PATH = storePath;
  const channel = createChannel({
    name: "support",
    identifyUser: "platform",
    agent: () => new EditionAgent(),
    store: { adapter: new MemoryStore() },
    components: [EditionCard],
  });
  const runCanonical = { count: 0 };
  const handlerFailure: { value: unknown } = { value: undefined };
  channel.onMessage(async ({ thread }) => {
    try {
      await thread.runAgent();
    } catch (error) {
      handlerFailure.value = error;
      throw error;
    }
  });
  const handle = await startChannelsWithGatewayControl([channel], {
    session: gateway,
    scope: { projectId: 1, channelName: "support" },
    runtimeInstanceId,
    loadHistory: async () => [],
    appApiBaseUrl: "https://api.example",
    apiKey: "cpk-offline-test",
    appApiFetch: async (input) => {
      if (String(input).endsWith("/charge")) {
        return Response.json({ charged: true });
      }
      return Response.json({
        messages: [],
        truncation: {
          messageLimit: false,
          byteLimit: false,
          omittedMessageCount: 0,
        },
      });
    },
    runCanonical: async (args) => {
      runCanonical.count += 1;
      const result = await args.execute(
        {},
        { threadId: args.threadId, runId: args.runId },
      );
      return result;
    },
  });
  const restore = () => {
    if (previousPath === undefined) delete process.env.WIRE_DESK_STORE_PATH;
    else process.env.WIRE_DESK_STORE_PATH = previousPath;
  };
  return {
    handle,
    runCanonical,
    handlerFailure,
    restore,
  };
}

async function deliverEditionClick(
  gateway: ManagedGateway,
  initialDelivery: ReturnType<typeof preparedDelivery>,
  actionId: string,
  label: string,
) {
  const click = preparedDelivery(label, "slack", {
    kind: "interaction",
    actionId,
    messageRef: { id: "pref_v1_edition_message_123" },
  });
  await gateway.deliver({
    ...initialDelivery,
    deliveryId: click.deliveryId,
    turn: click.turn,
  });
}

it(
  "persists one real EditionCard click, updates Slack, and never reruns the agent",
  { timeout: 10_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "wire-desk-edition-"));
    const storePath = join(root, "private archive", "decisions.json");
    const gateway = new ManagedGateway();
    const { handle, runCanonical, handlerFailure, restore } =
      await startEditionDelivery(
        gateway,
        storePath,
        "rti_edition_success",
      );
    try {
      const initialDelivery = preparedDelivery("edition", "slack", {
        kind: "text",
        text: "Draft from this content thread",
      });
      await gateway.deliver(initialDelivery);
      const card = gateway.packets
        .map(({ payload }) => payload)
        .find(
          (payload) =>
            payload.kind === "slack.message.create" &&
            JSON.stringify(payload).includes("Use this Reel"),
        );
      assert.ok(card, "the managed delivery must render an EditionCard");
      assert.equal(handlerFailure.value, undefined);
      const actionId = editionActionId(card);
      await deliverEditionClick(
        gateway,
        initialDelivery,
        actionId,
        "edition_click",
      );
      await deliverEditionClick(
        gateway,
        initialDelivery,
        actionId,
        "edition_duplicate_click",
      );

      const history = JSON.parse(await readFile(storePath, "utf8"));
      assert.equal(history.length, 1);
      assert.equal(history[0].format, "Reel");
      const updates = gateway.packets
        .map(({ payload }) => payload)
        .filter((payload) => payload.kind === "slack.message.replace");
      assert.equal(updates.length, 1);
      assert.match(JSON.stringify(updates[0]), /Saved to the archive/);
      assert.equal(runCanonical.count, 1);
    } finally {
      await handle.stop();
      restore();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it(
  "retries an update without appending twice after Slack rejects the first update",
  { timeout: 10_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "wire-desk-update-retry-"));
    const storePath = join(root, "decisions.json");
    const gateway = new RejectFirstEditionUpdateGateway();
    const { handle, runCanonical, restore } =
      await startEditionDelivery(
        gateway,
        storePath,
        "rti_edition_update_retry",
      );
    try {
      const initialDelivery = preparedDelivery("edition_retry", "slack", {
        kind: "text",
        text: "Draft this thread",
      });
      await gateway.deliver(initialDelivery);
      const card = gateway.packets
        .map(({ payload }) => payload)
        .find(
          (payload) =>
            payload.kind === "slack.message.create" &&
            JSON.stringify(payload).includes("Use this Reel"),
        );
      assert.ok(card, "the managed delivery must render an EditionCard");
      const actionId = editionActionId(card);
      await deliverEditionClick(
        gateway,
        initialDelivery,
        actionId,
        "edition_update_failure",
      ).catch(() => undefined);
      await deliverEditionClick(
        gateway,
        initialDelivery,
        actionId,
        "edition_update_retry",
      );

      const history = JSON.parse(await readFile(storePath, "utf8"));
      assert.equal(history.length, 1);
      const updates = gateway.packets
        .map(({ payload }) => payload)
        .filter((payload) => payload.kind === "slack.message.replace");
      assert.equal(updates.length, 2);
      assert.equal(runCanonical.count, 1);
    } finally {
      await handle.stop();
      restore();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it(
  "allows an append failure to be retried without a false confirmation",
  { timeout: 10_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "wire-desk-append-retry-"));
    const blockedParent = join(root, "blocked");
    const storePath = join(blockedParent, "decisions.json");
    await writeFile(blockedParent, "not a directory", "utf8");
    const validPath = join(root, "recovered", "decisions.json");
    const gateway = new ManagedGateway();
    const { handle, runCanonical, restore } =
      await startEditionDelivery(
        gateway,
        storePath,
        "rti_edition_append_retry",
      );
    try {
      const initialDelivery = preparedDelivery("edition_append_retry", "slack", {
        kind: "text",
        text: "Draft this thread",
      });
      await gateway.deliver(initialDelivery);
      const card = gateway.packets
        .map(({ payload }) => payload)
        .find(
          (payload) =>
            payload.kind === "slack.message.create" &&
            JSON.stringify(payload).includes("Use this Reel"),
        );
      assert.ok(card, "the managed delivery must render an EditionCard");
      const actionId = editionActionId(card);
      await deliverEditionClick(
        gateway,
        initialDelivery,
        actionId,
        "edition_append_failure",
      );
      assert.ok(
        gateway.packets.some(
          ({ payload }) =>
            payload.kind === "slack.message.create" &&
            JSON.stringify(payload).includes("Could not save this choice"),
        ),
      );
      await rm(blockedParent, { force: true });
      process.env.WIRE_DESK_STORE_PATH = validPath;
      await deliverEditionClick(
        gateway,
        initialDelivery,
        actionId,
        "edition_append_retry_success",
      );
      const history = JSON.parse(await readFile(validPath, "utf8"));
      assert.equal(history.length, 1);
      assert.equal(
        gateway.packets.filter(
          ({ payload }) => payload.kind === "slack.message.replace",
        ).length,
        1,
      );
      assert.equal(runCanonical.count, 1);
    } finally {
      await handle.stop();
      restore();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it(
  "shows search failure when the agent catches a tool error and finishes without prose",
  { timeout: 10_000 },
  async () => {
    const { payloads, failure, agentMessages } = await runResearch(async () => {
      throw new Error("Exa is unavailable");
    }, false);
    assert.equal(
      failure,
      undefined,
      "the SDK catches ordinary tool errors inside the agent loop",
    );
    const cards = payloads.filter(
      (payload) => payload.kind === "slack.message.create",
    );
    assert.equal(
      cards.length,
      1,
      "the user must see the search failure even when the agent says nothing",
    );
    assert.match(JSON.stringify(cards[0]), /Web search failed/);
    assert.ok(!JSON.stringify(cards[0]).includes("Search sources"));
    assert.ok(
      agentMessages.some(
        (message) =>
          message.role === "tool" &&
          String(message.content).includes("Exa is unavailable"),
      ),
      "the model must still receive the original failure",
    );
    const terminal = payloads.at(-1);
    assert.ok(terminal?.kind === "channel.delivery.terminal");
    assert.equal(
      terminal.status,
      "complete",
      "delivery completion must not be confused with successful research",
    );
  },
);
