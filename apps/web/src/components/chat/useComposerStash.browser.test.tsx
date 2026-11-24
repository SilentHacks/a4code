import { DEFAULT_CLIENT_SETTINGS, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

import { act, render } from "../../../test/render";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { __setClientSettingsForTests } from "../../hooks/useSettings";
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
import { useComposerStash } from "./useComposerStash";

type StashInput = Parameters<typeof useComposerStash>[0];

const cloud = vi.hoisted(() => ({
  available: false,
  entries: [],
  status: undefined,
  isCurrent: () => true,
  load: vi.fn(),
  save: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("./useSyncedPromptStash", () => ({ useSyncedPromptStash: () => cloud }));

function Harness({
  input,
  onStash,
}: {
  input: StashInput;
  onStash?: (stash: ReturnType<typeof useComposerStash>) => void;
}) {
  const stash = useComposerStash(input);
  onStash?.(stash);
  return null;
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

it("keeps edits made before the relay acknowledges a stash", async () => {
  const target = DraftId.make("stash-sync-save");
  const input = stashInput(target, "Before");
  const store = useComposerDraftStore.getState();
  store.setPrompt(target, "Before");
  __setClientSettingsForTests({ ...DEFAULT_CLIENT_SETTINGS, syncPromptStash: true });
  cloud.available = true;
  using _reset = {
    [Symbol.dispose]: () => {
      cloud.available = false;
      cloud.save.mockReset();
      __setClientSettingsForTests(DEFAULT_CLIENT_SETTINGS);
      store.clearComposerContent(target);
    },
  };
  const { promise, resolve } = Promise.withResolvers<boolean>();
  cloud.save.mockReturnValue(promise);
  await using _screen = await render(<Harness input={input} />);
  const mod = isMacPlatform(navigator.platform) ? { metaKey: true } : { ctrlKey: true };
  await act(() => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "s", ...mod, bubbles: true, cancelable: true }),
    );
  });
  expect(cloud.save).toHaveBeenCalledWith({ id: expect.any(String), prompt: "Before" });
  expect(input.promptRef.current).toBe("Before");
  await act(async () => {
    input.promptRef.current = "Edited";
    store.setPrompt(target, "Edited");
    resolve(true);
    await promise;
  });
  expect(store.getComposerDraft(target)?.prompt).toBe("Edited");
});

it.each([false, true])(
  "only removes a synced prompt if draft storage succeeds (write rejected: %s)",
  async (writeRejected) => {
    const target = DraftId.make("stash-sync-restore");
    const input = stashInput(target, "Current");
    const store = useComposerDraftStore.getState();
    const entry = {
      id: "synced",
      prompt: "From another device",
      createdAt: "",
      synced: true,
      attachments: [],
      droppedImageNames: [],
    } as const;
    cloud.load.mockResolvedValue([entry]);
    cloud.remove.mockImplementation(() => {
      expect(localStorage.getItem("t3code:composer-drafts:v1")).toContain("From another device");
      return Promise.resolve();
    });
    using _reset = {
      [Symbol.dispose]: () => {
        cloud.load.mockReset();
        cloud.remove.mockReset();
        store.clearComposerContent(target);
      },
    };
    let restore: ReturnType<typeof useComposerStash>["restoreStashEntryStable"] | undefined;
    await using _screen = await render(
      <Harness
        input={input}
        onStash={(stash) => {
          restore = stash.restoreStashEntryStable;
        }}
      />,
    );
    const write = vi.spyOn(Storage.prototype, "setItem");
    try {
      if (writeRejected) {
        write.mockImplementationOnce(() => {
          throw new DOMException("Full", "QuotaExceededError");
        });
      }
      await act(async () => {
        await restore?.(entry);
      });
    } finally {
      write.mockRestore();
    }
    expect(store.getComposerDraft(target)?.prompt).toBe("Current\n\nFrom another device");
    if (writeRejected) {
      expect(cloud.remove).not.toHaveBeenCalled();
    } else {
      expect(cloud.remove).toHaveBeenCalledWith(entry.id);
    }
  },
);
