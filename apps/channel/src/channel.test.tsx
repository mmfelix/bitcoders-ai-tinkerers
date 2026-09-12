import { it } from "node:test";
import assert from "node:assert/strict";

it("registers the Wire Desk tools and cards without incident actions", async () => {
  const previousChannelCode = process.env.CHANNEL_CODE;
  const previousExaKey = process.env.EXA_API_KEY;
  delete process.env.EXA_API_KEY;
  process.env.CHANNEL_CODE = "wire-desk-test";
  try {
    const module = await import("./channel");
    assert.deepEqual(
      module.wireDeskTools.map((tool) => tool.name),
      ["read_thread", "log_decision", "get_format_stats"],
    );
    assert.deepEqual(
      module.wireDeskComponents.map((component) => component.name),
      ["master_brief_card", "edition_card", "format_stats_card"],
    );
    assert.ok(
      !module.wireDeskTools.some((tool) => tool.name === "propose_action"),
    );
  } finally {
    if (previousChannelCode === undefined) delete process.env.CHANNEL_CODE;
    else process.env.CHANNEL_CODE = previousChannelCode;
    if (previousExaKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = previousExaKey;
  }
});
