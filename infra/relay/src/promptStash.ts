import {
  RELAY_PROMPT_STASH_MAX_BYTES,
  RELAY_PROMPT_STASH_MAX_ENTRIES,
  type RelayPromptStashCreate,
  type RelayPromptStashSaveResult,
} from "@t3tools/contracts/relay";
import { and, count, desc, eq, sql } from "drizzle-orm";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import { RelayDb } from "./db.ts";
import { relayPromptStash } from "./persistence/schema.ts";

export const list = Effect.fnUntraced(function* (userId: string) {
  const db = yield* RelayDb;
  return yield* db
    .select({
      id: relayPromptStash.id,
      prompt: relayPromptStash.prompt,
      createdAt: relayPromptStash.createdAt,
    })
    .from(relayPromptStash)
    .where(eq(relayPromptStash.userId, userId))
    .orderBy(desc(relayPromptStash.createdAt), desc(relayPromptStash.id))
    .limit(RELAY_PROMPT_STASH_MAX_ENTRIES);
});

export const save = Effect.fnUntraced(function* (userId: string, entry: RelayPromptStashCreate) {
  if (
    !entry.prompt.trim() ||
    entry.prompt.includes("\0") ||
    /[\uD800-\uDFFF]/u.test(entry.prompt) ||
    new TextEncoder().encode(entry.prompt).byteLength > RELAY_PROMPT_STASH_MAX_BYTES
  ) {
    return "invalid" as const;
  }
  const db = yield* RelayDb;
  return yield* db.$client.withTransaction(
    Effect.gen(function* () {
      yield* db.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`prompt-stash:${userId}`}, 0))`,
      );
      const [existing] = yield* db
        .select({ prompt: relayPromptStash.prompt })
        .from(relayPromptStash)
        .where(and(eq(relayPromptStash.userId, userId), eq(relayPromptStash.id, entry.id)));
      if (existing) return existing.prompt === entry.prompt ? "saved" : "invalid";
      const [size] = yield* db
        .select({ entries: count() })
        .from(relayPromptStash)
        .where(eq(relayPromptStash.userId, userId));
      if (size && size.entries >= RELAY_PROMPT_STASH_MAX_ENTRIES) return "full";
      yield* db.insert(relayPromptStash).values({
        ...entry,
        userId,
        createdAt: DateTime.formatIso(yield* DateTime.now),
      });
      return "saved";
    }).pipe(Effect.map((result): RelayPromptStashSaveResult => result)),
  );
});

export const remove = Effect.fnUntraced(function* (userId: string, id: string) {
  const db = yield* RelayDb;
  yield* db
    .delete(relayPromptStash)
    .where(and(eq(relayPromptStash.userId, userId), eq(relayPromptStash.id, id)));
});
