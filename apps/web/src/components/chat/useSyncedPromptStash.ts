import { useAtomValue } from "@effect/atom-react";
import {
  ManagedRelay,
  managedRelaySessionAtom,
  type ManagedRelaySession,
} from "@t3tools/client-runtime/relay";
import type { RelayPromptStashCreate, RelayPromptStashEntry } from "@t3tools/contracts/relay";
import { decodeRelayJwt } from "@t3tools/shared/relayJwt";
import * as Effect from "effect/Effect";
import { msg } from "gt-react";
import { useEffect, useRef, useState } from "react";
import { useStableCallback } from "../../hooks/useStableCallback";
import { m } from "../../i18n/messages";
import { runtime } from "../../lib/runtime";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { toastManager } from "../ui/toast";

function isCurrentSession(session: ManagedRelaySession | null) {
  return session !== null && appAtomRegistry.get(managedRelaySessionAtom) === session;
}

async function runStashRequest<A>(
  session: ManagedRelaySession | null,
  call: (
    client: ManagedRelay.ManagedRelayClient["Service"],
    clerkToken: string,
  ) => Effect.Effect<A, ManagedRelay.ManagedRelayClientError>,
): Promise<A | undefined> {
  if (!session || !isCurrentSession(session)) return undefined;
  const result = await runtime.runPromiseExit(
    Effect.gen(function* () {
      const client = yield* ManagedRelay.ManagedRelayClient;
      const token = yield* session.readClerkToken();
      if (!token) return undefined;
      const claims = yield* decodeRelayJwt(token);
      if (claims.sub !== session.accountId || !isCurrentSession(session)) return undefined;
      return yield* call(client, token);
    }),
  );
  return isCurrentSession(session) && result._tag === "Success" ? result.value : undefined;
}

export function useSyncedPromptStash(open: boolean) {
  const session = useAtomValue(managedRelaySessionAtom);
  const [snapshot, setSnapshot] = useState<{
    session: typeof session;
    entries: ReadonlyArray<RelayPromptStashEntry>;
    status?: "loading" | "unavailable";
  }>();
  if (snapshot && snapshot.session !== session) setSnapshot(undefined);
  const request = useRef(0);
  const isCurrent = () => isCurrentSession(session);

  const load = useStableCallback(async () => {
    if (!session) return undefined;
    const sequence = ++request.current;
    setSnapshot((previous) => ({
      session,
      entries: previous?.session === session ? previous.entries : [],
      status: "loading",
    }));
    const entries = await runStashRequest(session, (client, clerkToken) =>
      client.listPromptStash({ clerkToken }),
    );
    if (!isCurrent() || sequence !== request.current) return undefined;
    setSnapshot(entries ? { session, entries } : { session, entries: [], status: "unavailable" });
    return entries;
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- refresh the account's cloud stash when its menu opens
  useEffect(() => {
    if (open && session) void load();
  }, [open, session, load]);

  return {
    available: session !== null,
    entries:
      snapshot?.session === session
        ? snapshot.entries.map((entry) => ({
            ...entry,
            synced: true as const,
            attachments: [],
            droppedImageNames: [],
          }))
        : [],
    status:
      snapshot?.session === session
        ? snapshot.status
        : open && session
          ? ("loading" as const)
          : undefined,
    load,
    isCurrent,
    async save(payload: RelayPromptStashCreate) {
      const result = await runStashRequest(session, (client, clerkToken) =>
        client.savePromptStash({ clerkToken, payload }),
      );
      if (!isCurrent()) return false;
      if (result === "saved") {
        void load();
        return true;
      }
      if (result === undefined) {
        const entries = await load();
        if (!isCurrent()) return false;
        if (entries?.some((entry) => entry.id === payload.id && entry.prompt === payload.prompt))
          return true;
      }
      toastManager.add({
        type: "error",
        title:
          result === "full"
            ? m(msg("Synced stash is full"))
            : result === "invalid"
              ? m(msg("This prompt is too large to sync"))
              : m(msg("Could not sync prompt")),
      });
      return false;
    },
    async remove(id: string) {
      const result = await runStashRequest(session, (client, clerkToken) =>
        client.deletePromptStash({ clerkToken, id }),
      );
      if (!isCurrent()) return;
      if (!result)
        toastManager.add({ type: "warning", title: m(msg("Could not remove synced prompt")) });
      void load();
    },
  };
}
