import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const DEFAULT_STORE_PATH = fileURLToPath(
  new URL("../.data/decisions.json", import.meta.url),
);

const nonEmptyText = z.string().refine((value) => value.trim().length > 0, {
  message: "must not be empty",
});

function parseTimestamp(value: string): bigint | undefined {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  if (!match) return undefined;

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fractionText,
    zone,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText ?? "0");
  const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(zone);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return undefined;
  }

  if (
    offsetMatch &&
    (Number(offsetMatch[2]) > 23 || Number(offsetMatch[3]) > 59)
  ) {
    return undefined;
  }

  if (!Number.isFinite(Date.parse(value))) return undefined;

  const offsetSeconds = offsetMatch
    ? (offsetMatch[1] === "-" ? 1 : -1) *
      (Number(offsetMatch[2]) * 60 * 60 + Number(offsetMatch[3]) * 60)
    : 0;
  const localSeconds =
    daysFromCivil(year, month, day) * 86_400n +
    BigInt(hour * 3_600 + minute * 60 + second + offsetSeconds);
  const fractionNanoseconds = BigInt(
    (fractionText ?? "").padEnd(9, "0") || "0",
  );
  return localSeconds * 1_000_000_000n + fractionNanoseconds;
}

function isValidTimestamp(value: string): boolean {
  return parseTimestamp(value) !== undefined;
}

function daysFromCivil(year: number, month: number, day: number): bigint {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const monthOfYear = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthOfYear + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  return BigInt(era * 146097 + dayOfEra - 719468);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export interface DecisionLogEntry {
  idea: string;
  sourceTrend: string;
  platform: string;
  format: string;
  decidedAt: string;
}

export const decisionLogEntrySchema = z
  .object({
    idea: nonEmptyText,
    sourceTrend: nonEmptyText,
    platform: nonEmptyText,
    format: nonEmptyText,
    decidedAt: nonEmptyText.refine(isValidTimestamp, {
      message: "must be a valid ISO timestamp with a timezone",
    }),
  })
  .strict();

export const decisionInputSchema = decisionLogEntrySchema.omit({
  decidedAt: true,
});

export interface FormatStat {
  format: string;
  platform: string;
  count: number;
  lastUsed: string;
}

export type DecisionStoreErrorCode =
  | "configuration"
  | "invalid-entry"
  | "invalid-history"
  | "filesystem"
  | "write";

export class DecisionStoreError extends Error {
  constructor(
    readonly code: DecisionStoreErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DecisionStoreError";
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function resolveStorePath(): string {
  const configured = process.env.WIRE_DESK_STORE_PATH;
  if (configured === undefined) return DEFAULT_STORE_PATH;
  if (configured.trim().length === 0) {
    throw new DecisionStoreError(
      "configuration",
      "WIRE_DESK_STORE_PATH must be a non-empty path.",
    );
  }
  return isAbsolute(configured)
    ? configured
    : resolve(process.cwd(), configured);
}

function parseEntry(entry: unknown): DecisionLogEntry {
  const result = decisionLogEntrySchema.safeParse(entry);
  if (!result.success) {
    throw new DecisionStoreError(
      "invalid-entry",
      "Decision entry is invalid.",
    );
  }
  return result.data;
}

function invalidHistory(): DecisionStoreError {
  return new DecisionStoreError(
    "invalid-history",
    "Decision history is invalid or unavailable.",
  );
}

async function readAllStrict(storePath: string): Promise<DecisionLogEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(storePath, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") return [];
    throw new DecisionStoreError(
      "filesystem",
      "Decision history could not be read.",
    );
  }

  if (raw.trim().length === 0) throw invalidHistory();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidHistory();
  }

  const result = decisionLogEntrySchema.array().safeParse(parsed);
  if (!result.success) throw invalidHistory();
  return result.data;
}

async function writeAtomically(
  storePath: string,
  entries: DecisionLogEntry[],
): Promise<void> {
  const directory = dirname(storePath);
  const temporaryPath = join(
    directory,
    `.decisions.${process.pid}.${randomUUID()}.tmp`,
  );
  let temporaryCreated = false;
  let temporaryFile: Awaited<ReturnType<typeof fs.open>> | undefined;

  try {
    await fs.mkdir(directory, { recursive: true });
    // Opening with exclusive creation tells us when this operation owns the
    // temporary. No locking is attempted, so concurrent read-modify-write
    // operations can still lose updates.
    temporaryFile = await fs.open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    await temporaryFile.writeFile(JSON.stringify(entries, null, 2), "utf8");
    await temporaryFile.close();
    temporaryFile = undefined;
    await fs.rename(temporaryPath, storePath);
  } catch {
    await temporaryFile?.close().catch(() => undefined);
    if (temporaryCreated) {
      await fs.unlink(temporaryPath).catch(() => undefined);
    }
    throw new DecisionStoreError(
      "write",
      "Decision history could not be saved.",
    );
  }
}

/**
 * Read the archive while degrading only malformed history to an empty result.
 * Filesystem and configuration failures remain errors so they cannot be
 * mistaken for a first run.
 */
export async function readDecisions(): Promise<DecisionLogEntry[]> {
  const storePath = resolveStorePath();
  try {
    return await readAllStrict(storePath);
  } catch (error) {
    if (
      error instanceof DecisionStoreError &&
      error.code === "invalid-history"
    ) {
      console.warn(
        "Wire Desk decision history is invalid. Restore the archive or configure a new WIRE_DESK_STORE_PATH.",
      );
      return [];
    }
    throw error;
  }
}

export async function appendDecision(
  entry: DecisionLogEntry,
): Promise<DecisionLogEntry[]> {
  const storePath = resolveStorePath();
  const validatedEntry = parseEntry(entry);
  const current = await readAllStrict(storePath);
  const next = [...current, validatedEntry];
  await writeAtomically(storePath, next);
  return next;
}

interface Aggregate extends FormatStat {
  lastUsedAt: bigint;
  firstSeen: number;
}

export async function getFormatStats(): Promise<FormatStat[]> {
  const storePath = resolveStorePath();
  const entries = await readAllStrict(storePath);
  const byPlatform = new Map<string, Map<string, Aggregate>>();
  let firstSeen = 0;

  for (const entry of entries) {
    let byFormat = byPlatform.get(entry.platform);
    if (!byFormat) {
      byFormat = new Map();
      byPlatform.set(entry.platform, byFormat);
    }

    const occurredAt = parseTimestamp(entry.decidedAt);
    if (occurredAt === undefined) {
      throw new DecisionStoreError(
        "invalid-history",
        "Decision history is invalid or unavailable.",
      );
    }
    const current = byFormat.get(entry.format);
    if (!current) {
      byFormat.set(entry.format, {
        format: entry.format,
        platform: entry.platform,
        count: 1,
        lastUsed: entry.decidedAt,
        lastUsedAt: occurredAt,
        firstSeen: firstSeen++,
      });
      continue;
    }

    current.count += 1;
    // Equal instants use a deterministic original timestamp so aggregation is
    // independent of append order while still preserving the chosen source.
    if (
      occurredAt > current.lastUsedAt ||
      (occurredAt === current.lastUsedAt && entry.decidedAt < current.lastUsed)
    ) {
      current.lastUsed = entry.decidedAt;
      current.lastUsedAt = occurredAt;
    }
  }

  const aggregates = [...byPlatform.values()].flatMap((byFormat) => [
    ...byFormat.values(),
  ]);
  aggregates.sort(
    (left, right) =>
      right.count - left.count || left.firstSeen - right.firstSeen,
  );
  return aggregates.map(
    ({ lastUsedAt: _lastUsedAt, firstSeen: _firstSeen, ...stat }) => stat,
  );
}
