import { createChannel } from "@copilotkit/channels";
import { isSearchConfigured } from "agent-core";
import { makeChannelAgent } from "./agent";
import { required } from "./env";
import {
  EditionCard,
  FormatStatsCard,
  MasterBriefCard,
  welcomeMessage,
} from "./components";
import {
  getFormatStatsTool,
  logDecision,
  readThread,
  searchTheWeb,
} from "./tools";

// Tools are registered only when their credential is present, so the agent is
// never handed a tool that will fail when it calls it.
export const wireDeskTools = [
  readThread,
  logDecision,
  getFormatStatsTool,
  ...(isSearchConfigured() ? [searchTheWeb] : []),
];

export const wireDeskComponents = [
  MasterBriefCard,
  EditionCard,
  FormatStatsCard,
];

export const channel = createChannel({
  // Must equal the Channel Code in Intelligence, character for character. A
  // mismatch leaves the Channel at "Waiting for runtime" and is validated at
  // startup, not here.
  name: required("CHANNEL_CODE"),

  // Required. "platform" derives the canonical user from provider + workspace +
  // platform user id. Do NOT move this onto CopilotRuntime — that one is for
  // web requests and must be absent on a Channels-only runtime.
  identifyUser: "platform",

  agent: makeChannelAgent,
  tools: wireDeskTools,
  components: wireDeskComponents,

  // Injected into the agent's prompt on every run.
  context: [
    {
      description: "Rendering",
      value:
        "You can draw native UI by calling master_brief_card, edition_card, or format_stats_card. Prefer them over prose whenever the answer has structure.",
    },
    {
      description: "Scope",
      value:
        "This demo drafts and records local format choices. It never publishes, schedules, or sends content to a real platform.",
    },
    {
      description: "Surface",
      value:
        "This is a chat thread in a channel people are actively working in. Assume others are reading and that some joined late.",
    },
  ],

});

// A mention subscribes the conversation, so the agent then follows along instead
// of needing to be @-mentioned every single turn.
channel.onMention(async ({ thread }) => {
  await thread.subscribe();
  await thread.runAgent();
});

// Non-mentioned turns only ever reach onMessage — gate them on the flag or the
// agent will answer every message in every channel it has been invited to.
channel.onMessage(async ({ thread }) => {
  if (await thread.isSubscribed()) {
    await thread.runAgent();
  }
});

channel.onWelcome(async ({ thread, platform }) => {
  await thread.post(welcomeMessage(platform));
});
