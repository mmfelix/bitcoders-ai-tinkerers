/**
 * Agent-rendered components for the Wire Desk agent.
 *
 * `defineChannelComponent` turns a component into a tool the agent can call to
 * draw UI itself. During a content decision, a native card is easier to scan
 * than a paragraph, but everyone reads a card.
 *
 * One tree renders as Slack Block Kit, Teams Adaptive Cards, and Discord
 * components. A surface that cannot render a node skips it rather than failing.
 */
import {
  defineChannelComponent,
  Message,
  Header,
  Section,
  Markdown,
  Fields,
  Field,
  Context,
  Divider,
  Actions,
  Button,
  Table,
  Row,
  Cell,
} from "@copilotkit/channels";
import { z } from "zod";
import {
  appendDecision,
  DecisionStoreError,
} from "./store";

/** Severity drives the colour rail, so the channel can triage by glance. */
const SEVERITY = {
  sev1: { accent: "#C4145F", label: "SEV1 · customer-facing" },
  sev2: { accent: "#8A5C10", label: "SEV2 · degraded" },
  sev3: { accent: "#5B6478", label: "SEV3 · internal" },
  resolved: { accent: "#2E7D5B", label: "RESOLVED" },
} as const;

/**
 * The state of the incident, as one glanceable card.
 *
 * Deliberately has no "what happened" prose field. The thread is the narrative;
 * this is the summary a person joining at minute 40 needs.
 */
export const IncidentCard = defineChannelComponent({
  name: "incident_card",
  description:
    "Draw the current state of the incident as a card: severity, what is affected, what is known, and what is being tried. Call this once you have read the thread, and call it again when the picture changes. Prefer it over describing the incident in prose.",
  parameters: z.object({
    severity: z.enum(["sev1", "sev2", "sev3", "resolved"]),
    headline: z.string().describe("What is broken, in under ten words."),
    impact: z.string().describe("Who or what is affected, concretely."),
    started: z.string().describe("When it started, as stated in the thread. 'unknown' is a valid answer."),
    known: z.array(z.string()).max(4).default([]).describe("What the thread has established."),
    trying: z.array(z.string()).max(3).default([]).describe("What is currently being attempted."),
    owner: z.string().optional().describe("Who is driving, if the thread says."),
  }),
  render({ severity, headline, impact, started, known, trying, owner }) {
    const sev = SEVERITY[severity];
    return (
      <Message accent={sev.accent}>
        <Header>{headline}</Header>
        <Context>{sev.label}</Context>
        <Fields>
          <Field label="Impact">{impact}</Field>
          <Field label="Started">{started}</Field>
          {owner && <Field label="Driving">{owner}</Field>}
        </Fields>
        {known.length > 0 && (
          <Section>
            <Markdown>{`*What we know*\n${known.map((k) => `• ${k}`).join("\n")}`}</Markdown>
          </Section>
        )}
        {trying.length > 0 && (
          <Section>
            <Markdown>{`*Being tried*\n${trying.map((t) => `• ${t}`).join("\n")}`}</Markdown>
          </Section>
        )}
      </Message>
    );
  },
});

/**
 * The incident timeline. Handover and the postmortem both run on this, which is
 * why it is worth keeping in the thread rather than someone's notes app.
 */
export const Timeline = defineChannelComponent({
  name: "timeline",
  description:
    "Draw an ordered timeline of what happened when. Call this when there are three or more events worth ordering — it is what on-call handover and the postmortem are written from.",
  parameters: z.object({
    title: z.string().default("Timeline"),
    events: z
      .array(
        z.object({
          at: z.string().describe("Time as the thread states it, e.g. '02:14' or '~20m ago'."),
          what: z.string().describe("What happened, in one line."),
          who: z.string().optional(),
        }),
      )
      .min(1)
      .max(12),
  }),
  render({ title, events }) {
    return (
      <Message>
        <Header>{title}</Header>
        <Table
          columns={[{ header: "When" }, { header: "What" }, { header: "Who" }]}
        >
          {events.map((event) => (
            <Row>
              <Cell>{event.at}</Cell>
              <Cell>{event.what}</Cell>
              <Cell>{event.who ?? "—"}</Cell>
            </Row>
          ))}
        </Table>
        <Divider />
        <Context>{`${events.length} event(s) · newest last`}</Context>
      </Message>
    );
  },
});

export const MasterBriefCard = defineChannelComponent({
  name: "master_brief_card",
  description:
    "Draw the modular content brief: hook, development, closing, and visual note. Call once you have a trend signal or the thread context, before any edition_card.",
  parameters: z.object({
    idea: z.string(),
    sourceTrend: z.string(),
    hook: z.string(),
    development: z.string(),
    closing: z.string(),
    visualNote: z.string(),
  }),
  render({ idea, sourceTrend, hook, development, closing, visualNote }) {
    return (
      <Message accent="#2E7D5B">
        <Header>{idea}</Header>
        <Context>{`Signal: ${sourceTrend}`}</Context>
        <Fields>
          <Field label="Hook">{hook}</Field>
          <Field label="Development">{development}</Field>
          <Field label="Closing">{closing}</Field>
          <Field label="Visual note">{visualNote}</Field>
        </Fields>
      </Message>
    );
  },
});

const EDITION_PLATFORM = z.enum([
  "instagram_reel",
  "instagram_carousel",
  "threads",
  "facebook",
  "blog",
  "x",
]);

type EditionPlatform = z.infer<typeof EDITION_PLATFORM>;

const PLATFORM_LIMITS: Record<EditionPlatform, string> = {
  instagram_reel: "15-30s script; hook in the first second",
  instagram_carousel:
    "2200 character caption; hook in the first line before 'more'",
  threads: "500 characters; one idea with no forced CTA",
  facebook: "No hard limit; engagement usually drops after about 80 words",
  blog: "800-1500 words; SEO title under 60 characters",
  x: "280 characters per post, or a thread for more than two beats",
};

function editionSaveFailure(error: unknown): string {
  if (
    error instanceof DecisionStoreError &&
    error.code === "invalid-history"
  ) {
    return "Could not save this choice because the local decision history is invalid. Restore it or configure WIRE_DESK_STORE_PATH, then try again.";
  }
  if (
    error instanceof DecisionStoreError &&
    error.code === "configuration"
  ) {
    return "Could not save this choice because WIRE_DESK_STORE_PATH is invalid. Configure a local archive path, then try again.";
  }
  return "Could not save this choice. No decision was recorded; check the local archive and try again.";
}

export const EditionCard = defineChannelComponent({
  name: "edition_card",
  description:
    "Draw one per-platform content edition adapted to that platform's real constraints. Call after master_brief_card, never as a shortened copy-paste.",
  parameters: z.object({
    idea: z.string(),
    sourceTrend: z.string(),
    platform: EDITION_PLATFORM,
    format: z.string(),
    content: z.string(),
  }),
  render({ idea, sourceTrend, platform, format, content }) {
    // These states are intentionally local to this card instance. A successful
    // append must not be repeated when a failed Slack update is retried.
    let persisted = false;
    let updated = false;
    let previousReport = Promise.resolve();

    return (
      <Message>
        <Header>{format}</Header>
        <Context>{PLATFORM_LIMITS[platform]}</Context>
        <Context>{`Signal: ${sourceTrend}`}</Context>
        <Section>
          <Markdown>{content}</Markdown>
        </Section>
        <Actions>
          <Button
            key="use-format"
            style="primary"
            onClick={async (ctx) => {
              const report = async () => {
                if (updated) return;
                if (!persisted) {
                  try {
                    await appendDecision({
                      idea,
                      sourceTrend,
                      platform,
                      format,
                      decidedAt: new Date().toISOString(),
                    });
                    persisted = true;
                  } catch (error) {
                    await ctx.thread.post(editionSaveFailure(error));
                    return;
                  }
                }
                if (updated) return;
                await ctx.thread.update(
                  ctx.message.ref,
                  `Saved to the archive: **${format}** for "${idea}".`,
                );
                updated = true;
              };
              previousReport = previousReport.then(report, report);
              await previousReport;
            }}
          >
            {`Use this ${format}`}
          </Button>
        </Actions>
      </Message>
    );
  },
});

export const FormatStatsCard = defineChannelComponent({
  name: "format_stats_card",
  description:
    "Draw the recorded format history with exact counts and last-used timestamps. Never invent statistics or describe performance metrics.",
  parameters: z.object({
    stats: z
      .array(
        z.object({
          format: z.string(),
          platform: z.string(),
          count: z.number(),
          lastUsed: z.string(),
        }),
      )
      .default([]),
  }),
  render({ stats }) {
    return (
      <Message>
        <Header>Format usage history</Header>
        {stats.length === 0 ? (
          <Context>No decisions logged yet.</Context>
        ) : (
          <Table
            columns={[
              { header: "Format" },
              { header: "Platform" },
              { header: "Chosen" },
              { header: "Last used" },
            ]}
          >
            {stats.map((stat) => (
              <Row>
                <Cell>{stat.format}</Cell>
                <Cell>{stat.platform}</Cell>
                <Cell>{String(stat.count)}</Cell>
                <Cell>{stat.lastUsed}</Cell>
              </Row>
            ))}
          </Table>
        )}
      </Message>
    );
  },
});

/**
 * The welcome message. A bot that says nothing when invited looks broken; one
 * that says what it will do on its own gets used.
 */
export function welcomeMessage(platform: string) {
  return (
    <Message accent="#2E7D5B">
      <Header>Wire Desk, in the thread</Header>
      <Section>
        <Markdown>
          {"When you have a content idea, @-mention me. I read what has already been said in this " +
            platform +
            " thread first, then turn it into an adaptable brief."}
        </Markdown>
      </Section>
      <Fields>
        <Field label="I will">Draft a brief, adapt it per platform, log your choices</Field>
        <Field label="I won't">Publish or send anything</Field>
      </Fields>
      <Actions>
        <Button
          key="draft-brief"
          value="catchup"
          style="primary"
          onClick={async ({ thread }) => {
            await thread.runAgent({
              prompt:
                "Read this thread, identify the content signal, and draft a master brief with relevant platform editions.",
            });
          }}
        >
          Draft from this thread
        </Button>
      </Actions>
    </Message>
  );
}
