import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId, ThreadId, type PromptStashEntry } from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/reactivity";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { removeLocalStorageItem } from "../../hooks/useLocalStorage";
import { isMacPlatform } from "../../lib/utils";
import {
  PROMPT_STASH_STORAGE_KEY,
  usePromptStashStore,
  writePromptStashStorageForTest,
} from "../../promptStashStore";
import {
  addPreparingComposerImages,
  countPreparingComposerImages,
  removePreparingComposerImages,
} from "./preparingComposerImages";
import { ComposerStashBadge } from "./ComposerStashBadge";
import { useComposerStash } from "./useComposerStash";

type StashInput = Parameters<typeof useComposerStash>[0];

const remote = vi.hoisted(() => ({
  available: null as unknown as Atom.Writable<boolean>,
  entries: null as unknown as Atom.Writable<
    ReadonlyArray<{
      entry: PromptStashEntry;
      environmentId: EnvironmentId;
      environmentLabel: string;
    }>
  >,
  save: vi.fn(),
  take: vi.fn(),
}));
vi.mock("../../state/promptStash", () => {
  remote.available = Atom.make(false).pipe(Atom.keepAlive);
  remote.entries = Atom.make<Atom.Type<typeof remote.entries>>([]).pipe(Atom.keepAlive);
  const status = Atom.make((get) => (get(remote.available) ? "supported" : "offline"));
  return {
    promptStashEnvironment: { save: remote.save, take: remote.take },
    promptStashEntriesAtom: remote.entries,
    promptStashSaveAvailableAtom: () => remote.available,
    promptStashStatusAtom: () => status,
    promptStashTakeAvailableAtom: () => remote.available,
  };
});
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: (command: unknown) => command }));

function remoteRegistry() {
  const registry = AtomRegistry.make();
  registry.set(remote.available, true);
  return {
    registry,
    [Symbol.dispose]: () => {
      registry.dispose();
      remote.save.mockReset();
      remote.take.mockReset();
    },
  };
}

function Harness({
  input,
  onStash,
}: {
  input: StashInput;
  onStash?: (stash: ReturnType<typeof useComposerStash>) => void;
}) {
  const stash = useComposerStash(input);
  onStash?.(stash);
  return (
    <ComposerStashBadge
      count={stash.stashQueue.length}
      menuOpen={stash.isStashMenuOpen}
      pulseKey={stash.stashPulseKey}
      onToggleMenu={stash.toggleStashMenuStable}
    />
  );
}

it("keeps the draft when stashing while a pasted image is still compressing", async () => {
  const target = DraftId.make("stash-preparing-image");
  using _draft = {
    [Symbol.dispose]: () => useComposerDraftStore.getState().clearComposerContent(target),
  };
  using _stash = {
    [Symbol.dispose]: () => {
      writePromptStashStorageForTest("");
      removeLocalStorageItem(PROMPT_STASH_STORAGE_KEY);
    },
  };
  addPreparingComposerImages(target, [
    {
      id: "pasted",
      name: "shot.png",
      file: new File(["png"], "shot.png", { type: "image/png" }),
      hidden: false,
    },
  ]);
  using _preparing = {
    [Symbol.dispose]: () => removePreparingComposerImages(target, new Set(["pasted"])),
  };
  const input = stashInput(target, "Describe this screenshot");
  const { promptRef } = input;
  await using _screen = await render(<Harness input={input} />);

  const mod = isMacPlatform(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
  await act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ...mod, bubbles: true, cancelable: true }),
    );
  });

  expect(usePromptStashStore.getState().entries).toEqual([]);
  expect(promptRef.current).toBe("Describe this screenshot");
  expect(countPreparingComposerImages(target)).toBe(1);
});

function stashInput(target: DraftId, prompt: string) {
  const environmentId = EnvironmentId.make("stash-env");
  const promptRef = { current: prompt };
  const input = {
    environmentId,
    composerDraftTarget: target,
    promptRef,
    readAttachmentDraft: () => ({ images: [], files: [] }),
    readTerminalContexts: () => [],
    routeThreadRef: { environmentId, threadId: ThreadId.make("stash-thread") },
    projectSelectionRequired: false,
    pendingUserInputs: [],
    activePendingProgress: null,
    prompt: promptRef.current,
    composerMenuOpen: false,
    isComposerCollapsedMobile: false,
    composerPreviewAnnotations: [],
    composerReviewComments: [],
    composerThreadContexts: [],
    attachmentTargetKey: target,
    isComposerDraftTargetOpen: () => true,
    composerEditorRef: { current: null },
    isRevertingCheckpoint: () => false,
    pendingThreadImportsRef: { current: new Map() },
    setComposerCursor: vi.fn(),
    setComposerTrigger: vi.fn(),
    importContextRecords: () => new Map(),
    expandMobileComposer: vi.fn(),
  } satisfies StashInput;
  return input;
}

it.each(["cleared", "edited", "failure"] as const)(
  "only clears an unchanged draft after the environment confirms the stash (%s)",
  async (outcome) => {
    const target = DraftId.make("stash-environment-save");
    const input = stashInput(target, "Before");
    const store = useComposerDraftStore.getState();
    store.setPrompt(target, "Before");
    using connection = remoteRegistry();
    using _draft = { [Symbol.dispose]: () => store.clearComposerContent(target) };
    const { promise, resolve } = Promise.withResolvers<
      { _tag: "Success"; value: { evicted: null } } | { _tag: "Failure" }
    >();
    remote.save.mockReturnValue(promise);
    await using _screen = await render(
      <RegistryContext value={connection.registry}>
        <Harness input={input} />
      </RegistryContext>,
    );
    const mod = isMacPlatform(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
    await act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ...mod, bubbles: true, cancelable: true }),
      );
    });
    expect(remote.save).toHaveBeenCalledWith({
      environmentId: input.environmentId,
      input: {
        entry: {
          id: expect.any(String),
          createdAt: expect.any(String),
          prompt: "Before",
          attachments: [],
          droppedImageNames: [],
          unreadableImageNames: [],
        },
      },
    });
    expect(input.promptRef.current).toBe("Before");
    await act(async () => {
      if (outcome === "edited") {
        input.promptRef.current = "Edited";
        store.setPrompt(target, "Edited");
      }
      resolve(
        outcome === "failure" ? { _tag: "Failure" } : { _tag: "Success", value: { evicted: null } },
      );
      await promise;
    });
    const expected = outcome === "edited" ? "Edited" : outcome === "failure" ? "Before" : "";
    expect(input.promptRef.current).toBe(expected);
    expect(store.getComposerDraft(target)?.prompt ?? "").toBe(expected);
    expect(usePromptStashStore.getState().entries).toEqual([]);
  },
);

it.each(["restore", "put-back", "recover-locally"] as const)(
  "takes the server payload from its owner and handles a changed draft target (%s)",
  async (outcome) => {
    const target = DraftId.make("stash-environment-restore");
    const input = stashInput(target, "Current");
    const store = useComposerDraftStore.getState();
    const owner = EnvironmentId.make("stash-owner");
    const entry: PromptStashEntry = {
      id: "remote",
      prompt: "Stale drawer prompt",
      createdAt: "2026-10-01T00:00:00.000Z",
      attachments: [],
      droppedImageNames: [],
    };
    const taken = { ...entry, prompt: "From another device" };
    const { promise, resolve } = Promise.withResolvers<{
      _tag: "Success";
      value: { entry: PromptStashEntry };
    }>();
    using connection = remoteRegistry();
    remote.take.mockReturnValue(promise);
    remote.save.mockResolvedValue(
      outcome === "recover-locally"
        ? { _tag: "Failure" }
        : { _tag: "Success", value: { evicted: null } },
    );
    using _reset = {
      [Symbol.dispose]: () => {
        store.clearComposerContent(target);
        writePromptStashStorageForTest("");
        removeLocalStorageItem(PROMPT_STASH_STORAGE_KEY);
      },
    };
    let active = true;
    let stash!: ReturnType<typeof useComposerStash>;
    await using _screen = await render(
      <RegistryContext value={connection.registry}>
        <Harness
          input={{ ...input, isComposerDraftTargetOpen: () => active }}
          onStash={(next) => (stash = next)}
        />
      </RegistryContext>,
    );
    let restoring: Promise<void> | undefined;
    await act(() => {
      restoring = stash.restoreStashEntryStable({ entry, key: "owner-row", environmentId: owner });
    });
    expect(remote.take).toHaveBeenCalledWith({ environmentId: owner, input: { id: entry.id } });
    if (outcome !== "restore") active = false;
    await act(async () => {
      resolve({ _tag: "Success", value: { entry: taken } });
      await restoring;
    });
    expect(input.promptRef.current).toBe(
      outcome === "restore" ? "Current\n\nFrom another device" : "Current",
    );
    if (outcome === "restore") {
      expect(remote.save).not.toHaveBeenCalled();
    } else {
      expect(remote.save).toHaveBeenCalledWith({ environmentId: owner, input: { entry: taken } });
    }
    expect(usePromptStashStore.getState().entries).toEqual(
      outcome === "recover-locally" ? [taken] : [],
    );
  },
);

it("closes the drawer when the last remote entry is removed without reopening on the next push", async () => {
  const target = DraftId.make("stash-remote-badge");
  const input = stashInput(target, "");
  using connection = remoteRegistry();
  let stash!: ReturnType<typeof useComposerStash>;
  await using screen = await render(
    <RegistryContext value={connection.registry}>
      <Harness input={input} onStash={(next) => (stash = next)} />
    </RegistryContext>,
  );
  const badge = screen.getByRole("button", { name: /^Stashed prompts/ });
  const published = {
    entry: {
      id: "remote",
      prompt: "From another device",
      createdAt: "2026-10-01T00:00:00.000Z",
      attachments: [],
      droppedImageNames: [],
    },
    environmentId: input.environmentId,
    environmentLabel: "Home",
  };
  await act(stash.toggleStashMenuStable);
  await expect.element(badge).not.toBeInTheDocument();
  await act(() => connection.registry.set(remote.entries, [published]));
  await expect.element(badge).toHaveAttribute("aria-expanded", "false");
  await act(stash.toggleStashMenuStable);
  await expect.element(badge).toHaveAttribute("aria-expanded", "true");
  await act(() => connection.registry.set(remote.entries, []));
  await expect.element(badge).not.toBeInTheDocument();
  await act(() => connection.registry.set(remote.entries, [published]));
  await expect.element(badge).toHaveAttribute("aria-expanded", "false");
});
