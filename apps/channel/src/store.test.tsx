import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  appendDecision,
  DecisionStoreError,
  getFormatStats,
  readDecisions,
  type DecisionLogEntry,
} from "./store";

const execFileAsync = promisify(execFile);

const entry = (
  overrides: Partial<DecisionLogEntry> = {},
): DecisionLogEntry => ({
  idea: "launch teaser",
  sourceTrend: "thread only",
  platform: "instagram_reel",
  format: "Reel",
  decidedAt: "2026-09-10T10:00:00Z",
  ...overrides,
});

async function withStore<T>(callback: (storePath: string) => Promise<T>) {
  const directory = await mkdtemp(join(tmpdir(), "wire-desk-store-"));
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

describe("Wire Desk decision store", () => {
  it("treats an absent file as empty and creates it on the first append", async () => {
    await withStore(async (storePath) => {
      assert.deepEqual(await readDecisions(), []);
      const history = await appendDecision(entry());
      assert.deepEqual(history, [entry()]);
      assert.deepEqual(JSON.parse(await readFile(storePath, "utf8")), [entry()]);
    });
  });

  it("treats a valid physical empty array as empty history", async () => {
    await withStore(async (storePath) => {
      await mkdir(join(storePath, ".."), { recursive: true });
      await writeFile(storePath, "[]", "utf8");
      assert.deepEqual(await readDecisions(), []);
      assert.deepEqual(await getFormatStats(), []);
      assert.equal((await appendDecision(entry())).length, 1);
    });
  });

  it("round-trips persisted data from a new process", async () => {
    await withStore(async (storePath) => {
      const saved = entry({
        idea: "Lanzamiento: beta 🚀",
        sourceTrend: "thread / creator",
        platform: "video:short",
        format: "Reel: 30s",
      });
      await appendDecision(saved);

      const child = await execFileAsync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "const raw = await (await import('node:fs/promises')).readFile(process.env.WIRE_DESK_STORE_PATH, 'utf8'); process.stdout.write(raw);",
        ],
        {
          env: { ...process.env, WIRE_DESK_STORE_PATH: storePath },
        },
      );
      assert.deepEqual(JSON.parse(child.stdout), [saved]);
    });
  });

  it("rejects an empty path override instead of using the real archive", async () => {
    const previous = process.env.WIRE_DESK_STORE_PATH;
    process.env.WIRE_DESK_STORE_PATH = "";
    try {
      await assert.rejects(readDecisions(), (error: unknown) => {
        return (
          error instanceof DecisionStoreError &&
          error.code === "configuration"
        );
      });
    } finally {
      if (previous === undefined) delete process.env.WIRE_DESK_STORE_PATH;
      else process.env.WIRE_DESK_STORE_PATH = previous;
    }
  });

  it("resolves relative overrides from the current working directory per operation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wire-desk-relative-"));
    const previousPath = process.env.WIRE_DESK_STORE_PATH;
    const previousCwd = process.cwd();
    process.chdir(directory);
    process.env.WIRE_DESK_STORE_PATH = join("relative archive", "decisions.json");
    try {
      await appendDecision(entry({ idea: "relative path" }));
      assert.deepEqual(await readDecisions(), [entry({ idea: "relative path" })]);
      process.env.WIRE_DESK_STORE_PATH = join("second archive", "decisions.json");
      await appendDecision(entry({ idea: "second path" }));
      assert.deepEqual(await readDecisions(), [entry({ idea: "second path" })]);
    } finally {
      process.chdir(previousCwd);
      if (previousPath === undefined) delete process.env.WIRE_DESK_STORE_PATH;
      else process.env.WIRE_DESK_STORE_PATH = previousPath;
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps malformed history intact and degrades public reads", async () => {
    await withStore(async (storePath) => {
      const malformed = '{"truncated":';
      const parent = join(storePath, "..");
      await mkdir(parent, { recursive: true });
      await writeFile(storePath, malformed, "utf8");

      assert.deepEqual(await readDecisions(), []);
      assert.equal(await readFile(storePath, "utf8"), malformed);
      await assert.rejects(appendDecision(entry()), /invalid|unavailable/i);
      assert.equal(await readFile(storePath, "utf8"), malformed);
    });
  });

  it("rejects empty physical files, non-arrays, and invalid entries", async () => {
    for (const malformed of [
      "",
      JSON.stringify({ idea: "not an array" }),
      JSON.stringify([null]),
      JSON.stringify([entry({ decidedAt: "not a date" })]),
    ]) {
      await withStore(async (storePath) => {
        await mkdir(join(storePath, ".."), { recursive: true });
        await writeFile(storePath, malformed, "utf8");
        assert.deepEqual(await readDecisions(), []);
        await assert.rejects(getFormatStats(), /invalid|unavailable/i);
      });
    }
  });

  it("aggregates exact platform/format tuples with stable ranking and chronological lastUsed", async () => {
    await withStore(async () => {
      await appendDecision(
        entry({
          platform: "a:b",
          format: "c",
          decidedAt: "2026-09-12T12:00:00+02:00",
        }),
      );
      await appendDecision(
        entry({
          platform: "a",
          format: "b:c",
          decidedAt: "2026-09-12T11:00:00Z",
        }),
      );
      await appendDecision(
        entry({
          platform: "a:b",
          format: "c",
          decidedAt: "2026-09-12T10:00:00Z",
        }),
      );
      await appendDecision(
        entry({
          platform: "a:b",
          format: "c",
          decidedAt: "2026-09-12T12:00:00+02:00",
        }),
      );

      const stats = await getFormatStats();
      assert.deepEqual(stats, [
        {
          platform: "a:b",
          format: "c",
          count: 3,
          lastUsed: "2026-09-12T10:00:00Z",
        },
        {
          platform: "a",
          format: "b:c",
          count: 1,
          lastUsed: "2026-09-12T11:00:00Z",
        },
      ]);
      assert.equal(stats.reduce((sum, stat) => sum + stat.count, 0), 4);
    });
  });

  it("compares fractional seconds beyond JavaScript millisecond precision", async () => {
    await withStore(async () => {
      await appendDecision(
        entry({ decidedAt: "2026-09-12T10:00:00.0001Z" }),
      );
      await appendDecision(
        entry({ decidedAt: "2026-09-12T10:00:00.0002Z" }),
      );
      assert.equal(
        (await getFormatStats())[0]?.lastUsed,
        "2026-09-12T10:00:00.0002Z",
      );
    });
  });

  it("keeps the newest instant when entries are appended out of chronological order", async () => {
    await withStore(async () => {
      await appendDecision(entry({ decidedAt: "2026-09-12T11:00:00Z" }));
      await appendDecision(entry({ decidedAt: "2026-09-12T09:00:00Z" }));
      assert.equal(
        (await getFormatStats())[0]?.lastUsed,
        "2026-09-12T11:00:00Z",
      );
    });
  });

  it("preserves first appearance for count ties", async () => {
    await withStore(async () => {
      await appendDecision(entry({ platform: "threads", format: "Thread" }));
      await appendDecision(entry({ platform: "blog", format: "Article" }));
      const stats = await getFormatStats();
      assert.deepEqual(
        stats.map(({ platform, format }) => ({ platform, format })),
        [
          { platform: "threads", format: "Thread" },
          { platform: "blog", format: "Article" },
        ],
      );
    });
  });

  it("rejects invalid new entries before creating or changing the archive", async () => {
    await withStore(async (storePath) => {
      await assert.rejects(
        appendDecision(entry({ idea: "   " })),
        (error: unknown) =>
          error instanceof DecisionStoreError && error.code === "invalid-entry",
      );
      await assert.rejects(readFile(storePath, "utf8"), { code: "ENOENT" });
    });
  });

  it("distinguishes filesystem failures from an empty archive", async () => {
    await withStore(async (storePath) => {
      const parentFile = join(storePath, "..");
      await writeFile(parentFile, "not a directory", "utf8");
      await assert.rejects(readDecisions(), (error: unknown) => {
        return (
          error instanceof DecisionStoreError && error.code === "filesystem"
        );
      });
    });
  });
});
