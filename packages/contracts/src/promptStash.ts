import * as Schema from "effect/Schema";

import { EnvironmentId, ForwardCompatibleArray, NonNegativeInt } from "./baseSchemas.ts";
import { PastedTextAttachmentSource, SnapShotSource } from "./chatAttachment.ts";
import { ComposerContextRecord } from "./composerContext.ts";

export const MAX_STASH_ENTRIES = 20;

const StashId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(255));
const AttachmentFields = {
  id: Schema.String,
  name: Schema.String,
  mimeType: Schema.String,
  sizeBytes: NonNegativeInt,
};

export const PromptStashEntry = Schema.Struct({
  id: StashId,
  createdAt: Schema.String,
  prompt: Schema.String,
  attachments: Schema.Array(
    Schema.Struct({
      ...AttachmentFields,
      source: Schema.optional(SnapShotSource),
      dataUrl: Schema.String.check(Schema.isPattern(/^data:image\/[\w.+-]+;base64,/i)),
    }),
  ),
  files: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        ...AttachmentFields,
        attachmentId: Schema.String,
        environmentId: EnvironmentId,
        source: Schema.optional(PastedTextAttachmentSource),
      }),
    ),
  ),
  droppedImageNames: Schema.Array(Schema.String),
  unreadableImageNames: Schema.optionalKey(Schema.Array(Schema.String)),
  records: Schema.optionalKey(ForwardCompatibleArray(ComposerContextRecord)),
});
export type PromptStashEntry = typeof PromptStashEntry.Type;

export const PromptStashEvent = Schema.Union([
  Schema.TaggedStruct("reset", {}),
  Schema.TaggedStruct("ready", {}),
  Schema.TaggedStruct("upsert", {
    entry: PromptStashEntry,
    evictedId: Schema.optionalKey(StashId),
  }),
  Schema.TaggedStruct("remove", { id: StashId }),
]);
export type PromptStashEvent = typeof PromptStashEvent.Type;

export class PromptStashError extends Schema.TaggedError<PromptStashError>()("PromptStashError", {
  reason: Schema.Literals(["too-large", "wrong-environment", "storage"]),
}) {
  override get message(): string {
    switch (this.reason) {
      case "too-large":
        return "This draft is too large to stash.";
      case "wrong-environment":
        return "This draft has a file from another environment.";
      case "storage":
        return "Could not access the prompt stash.";
    }
  }
}
