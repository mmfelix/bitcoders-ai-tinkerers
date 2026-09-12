import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ChannelDeliveryTerminatedError,
  createChannel,
} from "@copilotkit/channels";
import { startChannelsWithGatewayControl } from "@copilotkit/channels-intelligence";
import {
  ManagedGateway,
  preparedDelivery,
  concreteThread,
} from "./testing/managed-gateway";
import { z } from "zod";
import {
  getFormatStatsTool,
  logDecision,
  proposeAction,
  readThread,
} from "./tools";

/** Only the methods these tools call; the rest of Thread is irrelevant here. */
const stubContext = (thread: Record<string, unknown>) =>
  ({
    thread,
    user: { id: "u1", name: "priya" },
    actor: { id: "a1" },
    platform: "slack",
  }) as never;

async function withToolStore<T>(callback: (storePath: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "wire-desk-tools-"));
  const storePath = join(directory, "nested path", "decisions.json");
  const previous = process.env.WIRE_DESK_STORE_PATH;
  process.env.WIRE_DESK_STORE_PATH = storePath;
  try {
    return await callback(storePath);
  } finally {
    if (previous === undefined) delete process.env.WIRE_DESK_STORE_PATH;
    else process.env.WIRE_DESK_STORE_PATH = previous;
    await rm(directory, { recursive: true, force: true });
  }
}

describe("read_thread", () => {
  it("returns the messages when the surface exposes history", async () => {
    const messages = [
      { id: "1", role: "user", content: "checkout is timing out" },
    ];
    const result = await readThread.handler(
      {},
      stubContext({ getMessages: mock.fn(async () => messages) }),
    );
    assert.deepEqual(result, messages);
  });

  it("degrades into an instruction, not an empty array, when history is unavailable", async () => {
    // getMessages() is capability-gated: it returns [] rather than throwing on
    // surfaces that cannot read history. Handing that [] straight to the model
    // reads as "the thread is empty", and the agent then drafts confidently
    // without the content context it was asked to use.
    const result = await readThread.handler(
      {},
      stubContext({ getMessages: mock.fn(async () => []) }),
    );
    assert.equal(typeof result, "string");
    assert.match(String(result), /cannot see earlier messages/i);
  });
});

describe("log_decision", () => {
  it("validates the SDK boundary and rejects empty decision fields", () => {
    const result = logDecision.parameters.safeParse({
      idea: "",
      sourceTrend: "thread only",
      platform: "threads",
      format: "Thread post",
    });
    assert.equal(result.success, false);
  });

  it("returns the server-timestamped entry only after it is persisted", async () => {
    await withToolStore(async (storePath) => {
      const result = await logDecision.handler(
        {
          idea: "Launch teaser",
          sourceTrend: "thread only",
          platform: "instagram_reel",
          format: "Reel",
        },
        stubContext({}),
      );
      assert.equal(typeof result, "object");
      assert.ok(
        typeof result === "object" &&
          result !== null &&
          "decidedAt" in result,
      );
      assert.match(String((result as { decidedAt: string }).decidedAt), /Z$/);
      assert.deepEqual(JSON.parse(await readFile(storePath, "utf8")), [result]);
    });
  });

  it("does not claim success for invalid direct handler arguments", async () => {
    await withToolStore(async (storePath) => {
      const post = mock.fn(async () => undefined);
      const result = await logDecision.handler(
        {
          idea: "   ",
          sourceTrend: "thread only",
          platform: "threads",
          format: "Thread post",
        },
        stubContext({ post }),
      );
      assert.match(String(result), /incomplete or invalid/i);
      assert.equal(post.mock.callCount(), 1);
      await assert.rejects(readFile(storePath, "utf8"), { code: "ENOENT" });
    });
  });

  it("reports a filesystem failure without returning the persisted entry", async () => {
    await withToolStore(async (storePath) => {
      await writeFile(join(storePath, ".."), "not a directory", "utf8");
      const post = mock.fn(async () => undefined);
      const result = await logDecision.handler(
        {
          idea: "Launch teaser",
          sourceTrend: "thread only",
          platform: "instagram_reel",
          format: "Reel",
        },
        stubContext({ post }),
      );
      assert.match(String(result), /history is unavailable|disk access/i);
      assert.equal(post.mock.callCount(), 1);
    });
  });

  it("does not convert a terminal delivery error into model-visible output", async () => {
    const previous = process.env.WIRE_DESK_STORE_PATH;
    const terminal = new ChannelDeliveryTerminatedError("delivery closed");
    process.env.WIRE_DESK_STORE_PATH = "";
    try {
      await assert.rejects(
        async () =>
          logDecision.handler(
            {
              idea: "Launch teaser",
              sourceTrend: "thread only",
              platform: "threads",
              format: "Thread",
            },
            stubContext({
              post: async () => {
                throw terminal;
              },
            }),
          ),
        (error: unknown) => error === terminal,
      );
    } finally {
      if (previous === undefined) delete process.env.WIRE_DESK_STORE_PATH;
      else process.env.WIRE_DESK_STORE_PATH = previous;
    }
  });
});

describe("get_format_stats", () => {
  it("tells the agent plainly when there is no decision history", async () => {
    await withToolStore(async () => {
      const result = await getFormatStatsTool.handler({}, stubContext({}));
      assert.match(String(result), /no decisions logged/i);
    });
  });

  it("reports corrupt history instead of presenting an empty ranking", async () => {
    await withToolStore(async (storePath) => {
      await mkdir(join(storePath, ".."), { recursive: true });
      await writeFile(storePath, "{\"broken\":", "utf8");
      const post = mock.fn(async () => undefined);
      const result = await getFormatStatsTool.handler(
        {},
        stubContext({ post }),
      );
      assert.match(String(result), /history is invalid/i);
      assert.equal(post.mock.callCount(), 1);
    });
  });

  it("returns the persisted ranking as raw tool data", async () => {
    await withToolStore(async () => {
      await logDecision.handler(
        {
          idea: "Launch teaser",
          sourceTrend: "thread only",
          platform: "threads",
          format: "Thread",
        },
        stubContext({}),
      );
      await logDecision.handler(
        {
          idea: "Launch teaser two",
          sourceTrend: "thread only",
          platform: "threads",
          format: "Thread",
        },
        stubContext({}),
      );
      const result = await getFormatStatsTool.handler({}, stubContext({}));
      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      assert.equal(result[0]?.platform, "threads");
      assert.equal(result[0]?.format, "Thread");
      assert.equal(result[0]?.count, 2);
      assert.equal(typeof result[0]?.lastUsed, "string");
    });
  });
});

describe("propose_action", () => {
  const args = {
    action: "Roll back web to the previous release",
    blastRadius: "All web traffic for ~90 seconds during the swap",
    reversible: true,
  };

  for (const choice of ["Approve", "Hold"]) {
    it(
      `posts a real managed card and reports ${choice} on a later delivery`,
      { timeout: 10_000 },
      async () => {
        const gateway = new ManagedGateway();
        const channel = createChannel({
          name: "support",
          identifyUser: "platform",
        });
        let result: unknown;
        channel.onMessage(async ({ thread }) => {
          try {
            assert.equal(thread.supportsBlockingChoice, false);
            result = await proposeAction.handler(
              { ...args, reversible: false },
              {
                thread: concreteThread(thread),
                user: { id: "u1", name: "Priya" },
                actor: { id: "a1", kind: "human" },
                platform: "slack",
              },
            );
          } catch (error) {
            result = String(error);
            throw error;
          }
        });
        const runCanonical = mock.fn();
        const handle = await startChannelsWithGatewayControl([channel], {
          session: gateway,
          scope: { projectId: 1, channelName: "support" },
          runtimeInstanceId: "rti_proposal",
          runCanonical: async (args) => {
            // Neither the proposal handler nor the click resumes an agent.
            runCanonical();
            return args.execute({});
          },
          loadHistory: async () => [],
        });
        try {
          const proposalDelivery = preparedDelivery("proposal", "slack", {
            kind: "text",
            text: "Propose a rollback",
          });
          await gateway.deliver(proposalDelivery);
          assert.match(
            String(result),
            /decision pending/,
            JSON.stringify(gateway.packets),
          );
          assert.match(
            String(result),
            /Do not take the action, call write tools, or offer a workaround/,
          );
          const payloads = gateway.packets.map(({ payload }) => payload);
          const card = payloads.find(
            (payload) => payload.kind === "slack.message.create",
          );
          assert.ok(
            card,
            "managed adapter must post the proposal before ending the delivery",
          );
          assert.match(JSON.stringify(card), /NOT easily reversible/);
          assert.match(JSON.stringify(card), /All web traffic/);
          assert.match(JSON.stringify(card), /Approve/);
          assert.match(JSON.stringify(card), /Hold/);
          // Read the real Slack action ID generated by Channels, then deliver it
          // through the gateway in a separate (nonblocking) interaction turn.
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
          const button = buttons.find(
            (element) => element.text.text === choice,
          );
          assert.ok(button);
          const clickDelivery = preparedDelivery("proposal_click", "slack", {
            kind: "interaction",
            actionId: button.action_id,
            messageRef: { id: "pref_v1_proposal_message_123" },
          });
          await gateway.deliver({
            ...proposalDelivery,
            deliveryId: clickDelivery.deliveryId,
            turn: clickDelivery.turn,
          });
          const update = gateway.packets
            .map(({ payload }) => payload)
            .find((payload) => payload.kind === "slack.message.replace");
          assert.ok(
            update,
            "click must replace the proposal with the decision",
          );
          assert.match(JSON.stringify(update), /No action was executed/);
          assert.match(
            JSON.stringify(update),
            choice === "Approve"
              ? /Approved proposal/
              : /Do not take the action or offer a workaround/,
          );
          // The SDK keeps both action IDs registered after replacing the card.
          // Replay the first choice, then deliver a stale opposite choice: neither
          // may overwrite the first recorded decision (including an initial Hold).
          const oppositeButton = buttons.find(
            (element) => element.text.text !== choice,
          );
          assert.ok(oppositeButton);
          for (const [index, actionId] of [
            button.action_id,
            oppositeButton.action_id,
          ].entries()) {
            const replayDelivery = preparedDelivery(
              `proposal_replay_${index}`,
              "slack",
              {
                kind: "interaction",
                actionId,
                messageRef: { id: "pref_v1_proposal_message_123" },
              },
            );
            await gateway.deliver({
              ...proposalDelivery,
              deliveryId: replayDelivery.deliveryId,
              turn: replayDelivery.turn,
            });
          }
          const updates = gateway.packets
            .map(({ payload }) => payload)
            .filter((payload) => payload.kind === "slack.message.replace");
          assert.equal(
            updates.length,
            1,
            "duplicate and opposite clicks must preserve the first decision",
          );
          assert.equal(
            runCanonical.mock.callCount(),
            0,
            "click reporting must not automatically resume the agent",
          );
        } finally {
          await handle.stop();
        }
      },
    );
  }
});
