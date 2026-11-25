import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { msg } from "gt-react";
import { m } from "~/i18n/messages";
import type { ChatComposerProps } from "./ChatComposer";
import {
  type ComposerContextRecord,
  type EnvironmentId,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  type PreviewAnnotationPayload,
  type PromptStashTakeInput,
  type ThreadContextRecord,
} from "@t3tools/contracts";
import {
  type ComposerFileAttachment,
  type ComposerImageAttachment,
  type ComposerThreadDraftState,
  type PersistedComposerFileAttachment,
  type PersistedComposerImageAttachment,
  composerFileDedupKey,
  composerFileMatchesReattachMarker,
  composerFileNeedsReattach,
  composerTargetKey,
  flushAndVerifyRestoredComposerDraft,
  hydrateImagesFromPersisted,
  useComposerDraftStore,
} from "../../composerDraftStore";
import { type ComposerPromptEditorHandle } from "../ComposerPromptEditorTiptap";
import {
  MAX_STASH_ENTRIES,
  type PromptStashEntry,
  partitionStashAttachments,
  usePromptStashStore,
} from "../../promptStashStore";
import {
  promptStashEntriesAtom,
  promptStashEnvironment,
  promptStashSaveAvailableAtom,
  promptStashStatusAtom,
  promptStashTakeAvailableAtom,
} from "../../state/promptStash";
import { useAtomCommand } from "../../state/use-atom-command";
import type { PendingUserInputProgress } from "../../pendingUserInput";
import { type PendingUserInput } from "../../session-logic";
import { type ReviewCommentContext } from "../../reviewCommentContext";
import { collapseExpandedComposerCursor } from "../../composer-logic";
import { collectComposerPromptInlineTokens } from "../../composer-editor-mentions";
import { compressImageForStash } from "../../lib/imageCompression";
import { formatInlineContextReference } from "~/lib/composerContextReferences";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { pendingDraftWork } from "./pendingDraftWork";
import { countPreparingComposerImages } from "./preparingComposerImages";
import {
  isResponseContextRecord,
  previewAnnotationContextRecord,
  reviewCommentContextRecord,
  terminalContextRecord,
} from "~/lib/composerContextRecords";
import { randomUUID } from "~/lib/utils";
import {
  readAttachmentUpload,
  releaseAttachmentUpload,
  verifyStashedAttachmentUpload,
} from "../../lib/attachmentUploadQueue";
import { remainingComposerAttachmentSlots } from "./composerThreadImport";
import { composerImageDedupKey } from "./composerAttachmentFiles";
import { replaceComposerContextReferences } from "@t3tools/shared/composerContextReferences";
import { resizeSnapShotSource } from "../../lib/snapShotSource";
import { registerCommands } from "../../shortcuts/dispatcher";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../../terminalUiStateStore";
import { toastManager } from "../ui/toast";
import type { useComposerTriggerState } from "./useComposerTriggerState";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  use,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { BackgroundThreadContext, HiddenThreadContext } from "./backgroundThread";
import { isInSideChatPane } from "../../lib/sideChatPane";
import { useStableCallback } from "../../hooks/useStableCallback";

export interface ComposerStashRow {
  readonly key: string;
  readonly entry: PromptStashEntry;
  readonly environmentId: EnvironmentId | null;
  readonly environmentLabel?: string;
}

// Stashes may share pending uploads with another stash or draft. Server expiry reclaims them.
function reportEvicted(entry: PromptStashEntry | null) {
  if (!entry) return;
  toastManager.add({
    type: "warning",
    title: m(msg("Oldest stashed prompt discarded")),
    description: m(
      msg("The stash holds {max} prompts; the oldest was removed to make room.", {
        max: MAX_STASH_ENTRIES,
      }),
    ),
    data: { hideCopyButton: true },
  });
}

async function encodeStashImages(images: ComposerThreadDraftState["images"]) {
  // Both stores use the browser stash's attachment limit.
  const candidates: PersistedComposerImageAttachment[] = [];
  const oversizedImageNames: string[] = [];
  const unreadableImageNames: string[] = [];
  for (const image of images) {
    const result = await compressImageForStash(image.file);
    if (!result.ok) {
      (result.reason === "too-large" ? oversizedImageNames : unreadableImageNames).push(image.name);
      continue;
    }
    candidates.push({
      id: image.id,
      name: image.name,
      mimeType: result.image.mimeType,
      sizeBytes: result.image.sizeBytes,
      dataUrl: result.image.dataUrl,
      ...(image.source
        ? { source: resizeSnapShotSource(image.source, result.image.imageSize) }
        : {}),
    });
  }
  const { kept, droppedNames } = partitionStashAttachments(candidates);
  return {
    attachments: kept,
    droppedImageNames: [...oversizedImageNames, ...droppedNames],
    unreadableImageNames,
  };
}

/**
 * The prompt stash: saving the draft aside, restoring or deleting an entry, the badge pulse,
 * and the stash shortcut. Its state lives here so the composer body only wires it up.
 */
export function useComposerStash(input: {
  readonly environmentId: EnvironmentId;
  readonly composerDraftTarget: ChatComposerProps["composerDraftTarget"];
  readonly promptRef: ChatComposerProps["promptRef"];
  readonly readAttachmentDraft: () => Pick<ComposerThreadDraftState, "images" | "files">;
  readonly readTerminalContexts: () => ComposerThreadDraftState["terminalContexts"];
  readonly routeThreadRef: ChatComposerProps["routeThreadRef"];
  readonly projectSelectionRequired: boolean;
  readonly pendingUserInputs: ReadonlyArray<PendingUserInput>;
  readonly activePendingProgress: PendingUserInputProgress | null;
  readonly prompt: string;
  readonly composerMenuOpen: boolean;
  readonly isComposerCollapsedMobile: boolean;
  readonly composerPreviewAnnotations: ReadonlyArray<PreviewAnnotationPayload>;
  readonly composerReviewComments: ReadonlyArray<ReviewCommentContext>;
  readonly composerThreadContexts: ReadonlyArray<ThreadContextRecord>;
  readonly attachmentTargetKey: string;
  readonly isComposerDraftTargetOpen: (targetKey: string) => boolean;
  readonly composerEditorRef: RefObject<ComposerPromptEditorHandle | null>;
  readonly isRevertingCheckpoint: () => boolean;
  readonly pendingThreadImportsRef: RefObject<Map<string, number>>;
  readonly setComposerCursor: Dispatch<SetStateAction<number>>;
  readonly setComposerTrigger: ReturnType<typeof useComposerTriggerState>["setTrigger"];
  readonly importContextRecords: (
    records: ReadonlyArray<ComposerContextRecord>,
    sourceEnvironmentId: EnvironmentId | null,
    threadDraftTarget?: ChatComposerProps["composerDraftTarget"],
  ) => ReadonlyMap<string, string>;
  readonly expandMobileComposer: () => void;
}) {
  const {
    environmentId,
    composerDraftTarget,
    promptRef,
    readAttachmentDraft,
    readTerminalContexts,
    routeThreadRef,
    projectSelectionRequired,
    pendingUserInputs,
    activePendingProgress,
    prompt,
    composerMenuOpen,
    isComposerCollapsedMobile,
    composerPreviewAnnotations,
    composerReviewComments,
    composerThreadContexts,
    attachmentTargetKey,
    isComposerDraftTargetOpen,
    composerEditorRef,
    isRevertingCheckpoint,
    pendingThreadImportsRef,
    setComposerCursor,
    setComposerTrigger,
    importContextRecords,
    expandMobileComposer,
  } = input;
  const getComposerDraft = useComposerDraftStore((store) => store.getComposerDraft);
  const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
  const setComposerDraftReplyTo = useComposerDraftStore((store) => store.setReplyTo);
  const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);
  const addComposerDraftFiles = useComposerDraftStore((store) => store.addFiles);
  const removeComposerDraftPreviewAnnotation = useComposerDraftStore(
    (store) => store.removePreviewAnnotation,
  );
  const removeComposerDraftReviewComment = useComposerDraftStore(
    (store) => store.removeReviewComment,
  );
  const clearComposerDraftTerminalContexts = useComposerDraftStore(
    (store) => store.clearTerminalContexts,
  );
  const clearComposerDraftPromptAndImages = useComposerDraftStore(
    (store) => store.clearComposerPromptAndImages,
  );
  const setComposerDraftThreadContexts = useComposerDraftStore((store) => store.setThreadContexts);
  const setComposerDraftEnvironmentContexts = useComposerDraftStore(
    (store) => store.setEnvironmentContexts,
  );
  const [isStashMenuOpen, setIsStashMenuOpen] = useState(false);
  // Each stash bumps the key; the badge replays its one-shot pulse animation per key.
  const [stashPulseKey, setStashPulseKey] = useState(0);
  const stashInFlightRef = useRef<Set<string>>(new Set());

  const localEntries = usePromptStashStore((state) => state.entries);
  const registry = useContext(RegistryContext);
  const remoteEntries = useAtomValue(promptStashEntriesAtom);
  const saveRemote = useAtomCommand(promptStashEnvironment.save, { reportFailure: false });
  const takeRemote = useAtomCommand(promptStashEnvironment.take, { reportFailure: false });
  const stashQueue: ComposerStashRow[] = [
    ...localEntries.map((entry) => ({
      key: JSON.stringify([null, entry.id]),
      environmentId: null,
      entry,
    })),
    ...remoteEntries.map(({ entry, environmentId: owner, environmentLabel }) => ({
      key: JSON.stringify([owner, entry.id]),
      environmentId: owner,
      ...(owner !== environmentId ? { environmentLabel } : {}),
      entry,
    })),
  ].sort((left, right) => right.entry.createdAt.localeCompare(left.entry.createdAt));
  const takeInFlight = useRef(new Set<string>());
  const stashEntryToQueue = usePromptStashStore((state) => state.stashEntry);
  const takeStashEntry = usePromptStashStore((state) => state.takeEntry);
  const finalizeStashEntryImages = usePromptStashStore((state) => state.finalizeEntryImages);

  const pulseStashBadge = () => {
    setStashPulseKey((key) => key + 1);
  };

  // Stable, so the check after the verify await sees a question that opened during it.
  const refuseMachinesInAnswer = useStableCallback((menuEntry: PromptStashEntry) => {
    // An answer to an agent's question carries no machines, so restoring here would drop them.
    if (
      pendingUserInputs.length > 0 &&
      menuEntry.records?.some((record) => record.kind === "environment")
    ) {
      toastManager.add({
        type: "error",
        title: m(msg("Stashed machines can't go in an answer")),
        description: m(msg("Restore this prompt after the agent's question is answered.")),
      });
      return true;
    }
    return false;
  });

  const hasPendingAnswer = useStableCallback(
    () => pendingUserInputs.length > 0 || activePendingProgress !== null,
  );

  const isCurrentDraft = useStableCallback(
    (expectedEnvironmentId: EnvironmentId, expectedTargetKey: string) =>
      environmentId === expectedEnvironmentId &&
      !isRevertingCheckpoint() &&
      isComposerDraftTargetOpen(expectedTargetKey),
  );

  const restoreFailed = (description?: string) =>
    toastManager.add({
      type: "error",
      title: m(msg("Could not restore this stashed prompt")),
      ...(description ? { description } : {}),
    });

  const takeRemoteEntry = async (owner: EnvironmentId, input: PromptStashTakeInput) => {
    const result = registry.get(promptStashTakeAvailableAtom(owner))
      ? await takeRemote({ environmentId: owner, input })
      : null;
    if (input._tag === "release") return null;
    if (result?._tag === "Success" && (result.value.entry || input._tag === "delete")) {
      return result.value.entry;
    }
    if (input._tag === "claim") {
      restoreFailed();
    } else {
      toastManager.add({ type: "error", title: m(msg("Could not delete this stashed prompt")) });
    }
    return null;
  };

  const hasWrongFileEnvironment = (entry: PromptStashEntry) => {
    if (!entry.files?.some((file) => file.environmentId !== environmentId)) return false;
    toastManager.add({
      type: "error",
      title: m(msg("Stashed files belong to another environment")),
      description: m(msg("Restore this prompt in the environment that received its files.")),
    });
    return true;
  };

  const applyStashEntry = (
    entry: PromptStashEntry,
    owner: EnvironmentId | null,
    targetKey: string,
    expiredAttachmentIds: ReadonlySet<string>,
    durable: boolean,
  ) => {
    if (!durable) {
      toastManager.add({
        type: "warning",
        title: m(msg("Restored prompt may reappear in the stash")),
        description: m(
          msg(
            "Browser storage rejected the update, so this entry could still be there after a reload.",
          ),
        ),
        data: { hideCopyButton: true },
      });
    }

    const rewrittenContextIds = entry.records
      ? importContextRecords(entry.records, owner, composerDraftTarget)
      : new Map<string, string>();
    // A reply only makes sense in the thread that holds the response, and one already pending wins.
    const stashedReply = entry.records?.find(isResponseContextRecord);
    if (
      stashedReply &&
      !getComposerDraft(composerDraftTarget)?.replyTo &&
      typeof composerDraftTarget !== "string" &&
      stashedReply.citation.threadId === composerDraftTarget.threadId &&
      stashedReply.citation.environmentId === composerDraftTarget.environmentId
    ) {
      setComposerDraftReplyTo(composerDraftTarget, stashedReply);
    }
    const restoredPrompt = replaceComposerContextReferences(entry.prompt, (reference) => {
      const contextId = rewrittenContextIds.get(reference.contextId);
      return contextId
        ? formatInlineContextReference({
            ...reference,
            contextId,
            kind: reference.kind === "element" ? "preview-annotation" : reference.kind,
          })
        : reference.source;
    });
    const currentPrompt = promptRef.current;
    const nextPrompt =
      restoredPrompt.length === 0
        ? currentPrompt
        : currentPrompt.trim().length
          ? `${currentPrompt.replace(/\s+$/, "")}\n\n${restoredPrompt}`
          : restoredPrompt;
    let promptChanged = nextPrompt !== currentPrompt;
    if (promptChanged) {
      promptRef.current = nextPrompt;
      setComposerDraftPrompt(composerDraftTarget, nextPrompt);
      setComposerCursor(collapseExpandedComposerCursor(nextPrompt, nextPrompt.length));
      setComposerTrigger(null);
    }

    let unrestoredFileNames: string[] = [];
    const expiredFileNames: string[] = [];
    let restoredFileCount = 0;
    const stashedFiles = entry.files ?? [];
    if (stashedFiles.length > 0) {
      const composerFilesNow = readAttachmentDraft().files;
      const existingFileIds = new Set(composerFilesNow.map((file) => file.id));
      const existingFileKeys = new Set(composerFilesNow.map(composerFileDedupKey));
      const reattachMarkers = composerFilesNow.filter(composerFileNeedsReattach);
      const restoredMarkerIds = new Set<string>();
      const markerReplacements: ComposerFileAttachment[] = [];
      const appendedFiles: ComposerFileAttachment[] = [];
      for (const file of stashedFiles) {
        const expired = expiredAttachmentIds.has(file.attachmentId);
        const key = composerFileDedupKey(file);
        const restored: ComposerFileAttachment = {
          type: "file",
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          sizeBytes: file.sizeBytes,
          file: null,
          ...(file.source ? { source: file.source } : {}),
          ...(expired
            ? {}
            : { uploadedAttachmentId: file.attachmentId, uploadEnvironmentId: environmentId }),
        };
        if (existingFileIds.has(file.id)) continue;
        const reattachMarker = reattachMarkers.find(
          (marker) =>
            !restoredMarkerIds.has(marker.id) && composerFileMatchesReattachMarker(marker, file),
        );
        if (reattachMarker) {
          restoredMarkerIds.add(reattachMarker.id);
          existingFileIds.add(file.id);
          existingFileKeys.add(key);
          if (expired) {
            expiredFileNames.push(file.name);
          } else {
            markerReplacements.push(restored);
          }
          continue;
        }
        if (existingFileKeys.has(key)) continue;
        existingFileIds.add(file.id);
        existingFileKeys.add(key);
        if (expired) expiredFileNames.push(file.name);
        appendedFiles.push(restored);
      }
      const capacity = remainingComposerAttachmentSlots(
        readAttachmentDraft().images.length + composerFilesNow.length,
        pendingThreadImportsRef.current.get(composerTargetKey(composerDraftTarget)) ?? 0,
      );
      const filesToAppend = appendedFiles.slice(0, capacity);
      const skippedFiles = appendedFiles.slice(capacity);
      unrestoredFileNames = skippedFiles.map((file) => file.name);
      const restoredFiles = [...markerReplacements, ...filesToAppend];
      if (restoredFiles.length > 0) {
        addComposerDraftFiles(composerDraftTarget, restoredFiles, { appendReference: true });
        const restoredFilePrompt = getComposerDraft(composerDraftTarget)?.prompt;
        if (restoredFilePrompt !== undefined && restoredFilePrompt !== promptRef.current) {
          promptRef.current = restoredFilePrompt;
          setComposerCursor(
            collapseExpandedComposerCursor(restoredFilePrompt, restoredFilePrompt.length),
          );
          setComposerTrigger(null);
          promptChanged = true;
        }
        restoredFileCount = filesToAppend.length;
      }
    }

    let unrestoredImageNames: string[] = [];
    let addedImages: ComposerImageAttachment[] = [];
    if (entry.attachments.length > 0) {
      const attachmentDraft = readAttachmentDraft();
      const existingIds = new Set(attachmentDraft.images.map((image) => image.id));
      // Filter on the draft store's dedupe key here. Counting a duplicate
      // against capacity would burn a slot the store then refuses to fill,
      // pushing a genuinely unique image into the overflow list for nothing.
      const existingDedupKeys = new Set(attachmentDraft.images.map(composerImageDedupKey));
      const capacity = remainingComposerAttachmentSlots(
        attachmentDraft.images.length + attachmentDraft.files.length + restoredFileCount,
        pendingThreadImportsRef.current.get(composerTargetKey(composerDraftTarget)) ?? 0,
      );
      const pending = hydrateImagesFromPersisted(entry.attachments).filter(
        (image) =>
          !existingIds.has(image.id) && !existingDedupKeys.has(composerImageDedupKey(image)),
      );
      unrestoredImageNames = pending.slice(capacity).map((image) => image.name);
      const restoredImages = pending.slice(0, capacity);
      if (restoredImages.length > 0) {
        const addedIds = new Set(addComposerDraftImages(composerDraftTarget, restoredImages));
        addedImages = restoredImages.filter((image) => addedIds.has(image.id));
      }
    }

    const missingImageReasons: string[] = [];
    if (entry.droppedImageNames.length > 0) {
      missingImageReasons.push(
        m(
          msg("{names} exceeded the stash size limit when this prompt was saved.", {
            names: entry.droppedImageNames.join(", "),
          }),
        ),
      );
    }
    if (entry.unreadableImageNames && entry.unreadableImageNames.length > 0) {
      missingImageReasons.push(
        m(
          msg("{names} could not be read when this prompt was saved.", {
            names: entry.unreadableImageNames.join(", "),
          }),
        ),
      );
    }
    if (unrestoredImageNames.length > 0) {
      missingImageReasons.push(
        m(
          msg("{names} could not be restored: the composer is at its {limit}-attachment limit.", {
            names: unrestoredImageNames.join(", "),
            limit: PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
          }),
        ),
      );
    }
    if (unrestoredFileNames.length > 0) {
      missingImageReasons.push(
        m(
          msg("{names} could not be restored: the composer is at its {limit}-attachment limit.", {
            names: unrestoredFileNames.join(", "),
            limit: PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
          }),
        ),
      );
    }
    if (expiredFileNames.length > 0) {
      missingImageReasons.push(
        m(
          msg(
            "{names}: stashed files are kept for 24 hours and this upload expired. Attach the file again.",
            { names: expiredFileNames.join(", ") },
          ),
        ),
      );
    }
    if (missingImageReasons.length > 0) {
      toastManager.add({
        type: "warning",
        title: m(msg("Some attachments were not restored")),
        description: missingImageReasons.join(" "),
      });
    }

    if (promptChanged) {
      window.requestAnimationFrame(() => {
        if (isCurrentDraft(environmentId, targetKey)) composerEditorRef.current?.focusAtEnd();
      });
    }
    return addedImages;
  };

  const restoreStashRow = async ({ entry: menuEntry, environmentId: owner }: ComposerStashRow) => {
    const targetKey = composerTargetKey(composerDraftTarget);
    const canRestoreRemote = (entry: PromptStashEntry) => {
      if (!isCurrentDraft(environmentId, targetKey) || hasWrongFileEnvironment(entry)) return false;
      if (!hasPendingAnswer()) return true;
      restoreFailed(m(msg("Restore this prompt after the agent's question is answered.")));
      return false;
    };
    if (
      owner === null
        ? hasWrongFileEnvironment(menuEntry) || refuseMachinesInAnswer(menuEntry)
        : !canRestoreRemote(menuEntry)
    ) {
      return;
    }
    setIsStashMenuOpen(false);

    const expiredAttachmentIds = new Set<string>();
    const verifyFiles = async (files: ReadonlyArray<PersistedComposerFileAttachment>) => {
      const verifications = await Promise.all(
        files.map((file) =>
          verifyStashedAttachmentUpload({ environmentId, attachmentId: file.attachmentId }),
        ),
      ).catch(() => null);
      if (
        !verifications ||
        (owner !== null && verifications.some(({ status }) => status === "failed"))
      ) {
        toastManager.add({ type: "error", title: m(msg("Could not verify stashed files")) });
        return false;
      }
      // A missing upload restores as a needs-reattach row.
      files.forEach((file, index) => {
        if (verifications[index]?.status === "missing") expiredAttachmentIds.add(file.attachmentId);
      });
      return true;
    };
    const filesToVerify = menuEntry.files ?? [];
    if (filesToVerify.length > 0) {
      if (!(await verifyFiles(filesToVerify))) return;
      if (owner !== null && !canRestoreRemote(menuEntry)) return;
    }

    if (owner === null) {
      if (!isCurrentDraft(environmentId, targetKey) || refuseMachinesInAnswer(menuEntry)) return;
      const { entry, durable } = takeStashEntry(menuEntry.id);
      if (entry) applyStashEntry(entry, owner, targetKey, expiredAttachmentIds, durable);
      return;
    }

    const claim = { id: menuEntry.id, claimId: randomUUID() };
    const entry = await takeRemoteEntry(owner, { ...claim, _tag: "claim" });
    const restoreClaimed = async (entry: PromptStashEntry) => {
      if (!canRestoreRemote(entry)) return false;
      // The claim returns the authoritative payload, not the drawer's snapshot.
      const checkedIds = new Set(filesToVerify.map((file) => file.attachmentId));
      const uncheckedFiles = entry.files?.filter((file) => !checkedIds.has(file.attachmentId));
      if (
        uncheckedFiles?.length &&
        (!(await verifyFiles(uncheckedFiles)) || !canRestoreRemote(entry))
      ) {
        return false;
      }
      const restoredImages = applyStashEntry(entry, owner, targetKey, expiredAttachmentIds, true);
      const restoredDraft = getComposerDraft(composerDraftTarget);
      if (restoredImages.length > 0) {
        await useComposerDraftStore
          .getState()
          .appendPersistedAttachments(composerDraftTarget, restoredImages, entry.attachments);
        if (!canRestoreRemote(entry)) return false;
      }
      if (restoredDraft && restoredDraft.prompt !== promptRef.current) {
        restoreFailed();
        return false;
      }
      if (
        !restoredDraft ||
        !flushAndVerifyRestoredComposerDraft(composerDraftTarget, restoredDraft, restoredImages)
      ) {
        restoreFailed(
          m(
            msg(
              "Browser storage could not save the restored draft. The prompt is still in the stash.",
            ),
          ),
        );
        return false;
      }
      return (await takeRemoteEntry(owner, { ...claim, _tag: "complete" })) !== null;
    };
    if (
      !entry ||
      !(await restoreClaimed(entry).catch(() => {
        restoreFailed();
        return false;
      }))
    ) {
      // Also try release after a lost claim response, using the same token.
      await takeRemoteEntry(owner, { ...claim, _tag: "release" });
    }
  };

  const restoreStashEntry = async (row: ComposerStashRow) => {
    const inFlight = takeInFlight.current;
    if (inFlight.has(row.key)) return;
    inFlight.add(row.key);
    await restoreStashRow(row).finally(() => inFlight.delete(row.key));
  };
  const restoreStashEntryStable = useStableCallback(restoreStashEntry);

  const deleteStashEntry = async (row: ComposerStashRow) => {
    const inFlight = takeInFlight.current;
    if (inFlight.has(row.key)) return;
    if (row.environmentId !== null) {
      inFlight.add(row.key);
      await takeRemoteEntry(row.environmentId, { _tag: "delete", id: row.entry.id }).finally(() =>
        inFlight.delete(row.key),
      );
      return;
    }
    const { durable } = takeStashEntry(row.entry.id);
    if (!durable) {
      toastManager.add({
        type: "warning",
        title: m(msg("Stash entry may come back")),
        description: m(
          msg("Browser storage rejected the delete, so this prompt could reappear after a reload."),
        ),
        data: { hideCopyButton: true },
      });
    }
  };
  const deleteStashEntryStable = useStableCallback(deleteStashEntry);

  const toggleStashMenu = () => {
    if (stashQueue.length === 0) return;
    if (isComposerCollapsedMobile) {
      expandMobileComposer();
      setIsStashMenuOpen(true);
      return;
    }
    setIsStashMenuOpen((open) => !open);
  };
  const toggleStashMenuStable = useStableCallback(toggleStashMenu);

  const stashCurrentPrompt = async () => {
    // Stashing clears the draft. A pasted attachment still downloading would then land in the
    // emptied composer instead of travelling with the entry it belongs to.
    if (pendingDraftWork.has(attachmentTargetKey)) {
      toastManager.add({
        type: "info",
        title: m(msg("Still bringing attached context into this message.")),
        description: m(msg("Stash again once its chip resolves.")),
      });
      return;
    }
    const draftSnapshot = getComposerDraft(composerDraftTarget);
    const originalPrompt = promptRef.current;
    const replyTo = draftSnapshot?.replyTo;
    const trimmedPrompt = promptRef.current.trim();
    // A trailing chip only parses with whitespace after it, so keep one space to restore it.
    const endsWithChip =
      collectComposerPromptInlineTokens(promptRef.current).at(-1)?.end ===
      promptRef.current.trimEnd().length;
    const prompt = endsWithChip ? `${trimmedPrompt} ` : trimmedPrompt;
    const attachmentDraft = readAttachmentDraft();
    const images = [...attachmentDraft.images];
    const files = [...attachmentDraft.files];
    const stashedRecords: ComposerContextRecord[] = [
      ...(replyTo ? [replyTo] : []),
      ...composerThreadContexts,
      ...(getComposerDraft(composerDraftTarget)?.environmentContexts ?? []),
      ...readTerminalContexts().map(terminalContextRecord),
      ...composerReviewComments.map(reviewCommentContextRecord),
      ...composerPreviewAnnotations.map((annotation) =>
        previewAnnotationContextRecord(annotation, {
          screenshotContextId: images.some((image) => image.id === annotation.id)
            ? annotation.id
            : undefined,
        }),
      ),
    ];
    if (prompt.length === 0 && images.length === 0 && files.length === 0) {
      const [row] = stashQueue;
      if (stashQueue.length === 1 && row?.environmentId === null && !row.entry.pendingImageCount) {
        await restoreStashEntry(row);
      } else if (row) {
        toggleStashMenu();
      }
      return;
    }
    // The snapshot only holds compressed images; a still-compressing one would land in the
    // emptied composer instead of travelling with this entry.
    if (countPreparingComposerImages(attachmentTargetKey) > 0) {
      toastManager.add({
        type: "info",
        title: m(msg("Still compressing a pasted image.")),
        description: m(msg("Stash again once it finishes compressing.")),
      });
      return;
    }
    const stashedFiles: PersistedComposerFileAttachment[] = [];
    for (const file of files) {
      if (composerFileNeedsReattach(file)) {
        toastManager.add({
          type: "error",
          title: m(msg("Attach dropped files again or remove them before stashing")),
        });
        return;
      }
      const upload = readAttachmentUpload(file.id);
      if (upload?.status !== "ready" || upload.environmentId !== environmentId) {
        toastManager.add({
          type: "error",
          title: m(msg("Wait for file uploads before stashing this prompt")),
        });
        return;
      }
      stashedFiles.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        attachmentId: upload.attachmentId,
        environmentId,
        ...(file.source ? { source: file.source } : {}),
      });
    }
    // Deduplicate the snapshot while encoding, not all stashes: new drafts or
    // thread switches must still be able to create their own entries.
    const attachmentKey = images
      .map((image) => `image:${image.id}`)
      .concat(files.map((file) => `file:${file.id}`))
      .join(",");
    const stashTarget = composerDraftTarget;
    const targetKey = composerTargetKey(stashTarget);
    const snapshotKey = JSON.stringify([environmentId, targetKey, originalPrompt, attachmentKey]);
    if (stashInFlightRef.current.has(snapshotKey)) return;
    stashInFlightRef.current.add(snapshotKey);

    const entryId = randomUUID();
    const entry = {
      id: entryId,
      createdAt: new Date().toISOString(),
      prompt,
      ...(stashedFiles.length > 0 ? { files: stashedFiles } : {}),
      ...(stashedRecords.length > 0 ? { records: stashedRecords } : {}),
    };
    const clearDraft = () => {
      promptRef.current = "";
      clearComposerDraftPromptAndImages(stashTarget);
      clearComposerDraftTerminalContexts(stashTarget);
      setComposerDraftThreadContexts(stashTarget, []);
      setComposerDraftEnvironmentContexts(stashTarget, []);
      setComposerDraftReplyTo(stashTarget, null);
      for (const comment of composerReviewComments) {
        removeComposerDraftReviewComment(stashTarget, comment.id);
      }
      for (const annotation of composerPreviewAnnotations) {
        releaseAttachmentUpload(annotation.id);
        removeComposerDraftPreviewAnnotation(stashTarget, annotation.id);
      }
      setComposerDraftPrompt(stashTarget, "");
      for (const image of images) {
        releaseAttachmentUpload(image.id);
      }
      setComposerCursor(0);
      setComposerTrigger(null);
    };
    const saveFailed = () =>
      toastManager.add({ type: "error", title: m(msg("Could not stash this prompt")) });
    const capturedDraftIsUnchanged = () =>
      isCurrentDraft(environmentId, targetKey) &&
      !hasPendingAnswer() &&
      promptRef.current === originalPrompt &&
      getComposerDraft(stashTarget) === draftSnapshot &&
      !pendingDraftWork.has(attachmentTargetKey) &&
      countPreparingComposerImages(attachmentTargetKey) === 0;
    const stashAndEncode = async () => {
      const remoteImages = registry.get(promptStashSaveAvailableAtom(environmentId))
        ? await encodeStashImages(images)
        : null;
      if (remoteImages) {
        if (!capturedDraftIsUnchanged()) {
          toastManager.add({
            type: "info",
            title: m(msg("Draft changed before it could be stashed")),
          });
          return;
        }
        if (registry.get(promptStashSaveAvailableAtom(environmentId))) {
          const saved = await saveRemote({
            environmentId,
            input: { entry: { ...entry, ...remoteImages } },
          });
          if (saved._tag !== "Success") {
            saveFailed();
            return;
          }
          if (capturedDraftIsUnchanged()) {
            clearDraft();
          }
          pulseStashBadge();
          reportEvicted(saved.value.evicted);
          return;
        }
      }
      const status = registry.get(promptStashStatusAtom(environmentId));
      if (status !== "offline" && status !== "unsupported") {
        saveFailed();
        return;
      }
      // Ordering matters in both directions: writing before clearing means a
      // crash or closed tab mid-encode still leaves the prompt recoverable,
      // while clearing before the async image work means edits typed during
      // encoding are not wiped.
      const { evicted, written, durable } = stashEntryToQueue({
        ...entry,
        attachments: [],
        droppedImageNames: [],
        unreadableImageNames: [],
        pendingImageCount: images.length,
      });

      // If it was rejected (quota) the store has already rolled itself back,
      // so leave the composer untouched rather than making it the second
      // casualty of a reload.
      if (!written) {
        toastManager.add({
          type: "error",
          title: m(msg("Could not stash this prompt")),
          description: m(
            msg(
              "Browser storage rejected the write, so the composer was left as-is. Free up site data and try again.",
            ),
          ),
          data: { hideCopyButton: true },
        });
        return;
      }
      if (!durable) {
        toastManager.add({
          type: "warning",
          title: m(msg("Stashed prompt will not survive a reload")),
          description: m(
            msg(
              "Browser storage is unavailable, so this stash is kept in memory only for this session.",
            ),
          ),
          data: { hideCopyButton: true },
        });
      }

      clearDraft();
      pulseStashBadge();
      reportEvicted(evicted);

      const encoded = remoteImages ?? (await encodeStashImages(images));
      const { attached, durable: imagesDurable } = finalizeStashEntryImages(entryId, encoded);
      if (attached) {
        if (!imagesDurable && durable && images.length > 0) {
          toastManager.add({
            type: "warning",
            title: m(msg("Stashed images were not saved")),
            description: m(
              msg(
                "The prompt was stashed, but browser storage rejected its images. They will be missing if you reload.",
              ),
            ),
            data: { hideCopyButton: true },
          });
        }
      } else if (encoded.attachments.length > 0) {
        toastManager.add({
          type: "warning",
          title: m(msg("Stashed images did not attach")),
          description: m(
            msg(
              "{count, plural, one {That prompt was restored or deleted before {count} image finished saving. Re-attach it if you still need it.} other {That prompt was restored or deleted before {count} images finished saving. Re-attach them if you still need them.}}",
              { count: encoded.attachments.length },
            ),
          ),
          data: { hideCopyButton: true },
        });
      }
    };
    await stashAndEncode().finally(() => stashInFlightRef.current.delete(snapshotKey));
  };
  const stashCurrentPromptStable = useStableCallback(stashCurrentPrompt);

  const [stashMenuClosesOn, setStashMenuClosesOn] = useState({ prompt, composerMenuOpen });
  if (
    stashMenuClosesOn.prompt !== prompt ||
    stashMenuClosesOn.composerMenuOpen !== composerMenuOpen
  ) {
    setStashMenuClosesOn({ prompt, composerMenuOpen });
  }
  if (
    isStashMenuOpen &&
    (stashQueue.length === 0 || stashMenuClosesOn.prompt !== prompt || composerMenuOpen)
  ) {
    setIsStashMenuOpen(false);
  }

  // Read at event time, so the scope registers once per mounted composer instead of
  // re-registering (and reshuffling capture-scope priority) whenever a guard flips.
  const handleStashShortcut = useStableCallback((event: KeyboardEvent) => {
    // Always claim the shortcut so the browser save dialog never opens,
    // even when the composer is in a state that can't stash.
    event.preventDefault();
    event.stopPropagation();
    if (isCommandPaletteOpen() || isRevertingCheckpoint()) return;
    if (pendingUserInputs.length > 0) {
      toggleStashMenu();
      return;
    }
    if (projectSelectionRequired || activePendingProgress !== null) return;
    void stashCurrentPromptStable();
  });
  // Capture phase while the composer is mounted, so Mod+S never reaches the browser's save
  // dialog even when a focused widget (the model picker search) stops the key.
  const embedded = use(BackgroundThreadContext);
  const hiddenThread = use(HiddenThreadContext);
  const readShortcutContext = useStableCallback(() => ({
    terminalOpen: Boolean(
      selectThreadTerminalUiState(
        useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
        routeThreadRef,
      ).terminalOpen,
    ),
  }));
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the capture-phase stash shortcut with the command registry while the composer is mounted
  useEffect(() => {
    if (hiddenThread) return;
    return registerCommands(
      { "composer.stash": handleStashShortcut },
      {
        capture: true,
        context: readShortcutContext,
        // A side chat's composer takes the keys pressed in its pane; the main one takes the rest.
        when: (event) => isInSideChatPane(event.target) === embedded,
      },
    );
  }, [embedded, hiddenThread, handleStashShortcut, readShortcutContext]);

  return {
    stashQueue,
    isStashMenuOpen: isStashMenuOpen && stashQueue.length > 0,
    setIsStashMenuOpen,
    stashPulseKey,
    restoreStashEntryStable,
    deleteStashEntryStable,
    toggleStashMenuStable,
  };
}
