// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import { CommandId, OrchestratorMcpFailure, TurnItemId } from "@t3tools/contracts";
import { readHtmlRenderReference, type HtmlRenderReference } from "@t3tools/shared/htmlRender";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as HtmlRender from "../../../htmlRender/HtmlRender.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { loadCaller } from "../../threadAccess.ts";
import { HtmlPreviewToolkit, HtmlRenderToolkit, type HtmlToolkit } from "./tools.ts";

const INVALID_PAGE_ERRORS = new Set([
  "HtmlRenderFileError",
  "HtmlRenderFileTooLargeError",
  "HtmlRenderImagesNotFoundError",
  "HtmlRenderImageTooLargeError",
  "HtmlRenderPageTooLargeError",
  "HtmlRenderViewportHeightError",
]);
const encodeSource = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const toFailure = (error: { readonly _tag: string; readonly message: string }) =>
  new OrchestratorMcpFailure({
    code:
      error._tag === "OrchestratorHtmlPublicationOwnerError"
        ? "parent_not_active"
        : INVALID_PAGE_ERRORS.has(error._tag)
          ? "invalid_request"
          : "orchestration_error",
    message: error.message,
  });

// The server reads the file for the caller, so only a thread that reads files without asking may
// pass a path; a supervised thread passes the HTML its provider already let it read.
const pageSource = Effect.fn("HtmlToolkit.pageSource")(function* (input: {
  readonly html?: string | undefined;
  readonly path?: string | undefined;
}) {
  if (input.html !== undefined && input.path === undefined) {
    return { html: input.html } satisfies HtmlRender.HtmlRenderSource;
  }
  if (input.path === undefined || input.html !== undefined) {
    return yield* new OrchestratorMcpFailure({
      code: "invalid_request",
      message: "Pass exactly one of html or path.",
    });
  }
  const { limits } = yield* loadCaller();
  if (limits.runtimeMode !== "full-access") {
    return yield* new OrchestratorMcpFailure({
      code: "capability_denied",
      message: "Pass html instead of path: only full-access threads may pass a path.",
    });
  }
  return { path: input.path } satisfies HtmlRender.HtmlRenderSource;
});

const handlers = {
  // Local-file access limits this host browser to T3-launched agents.
  html_preview: McpToolAccess.readsAsCaller((input) =>
    Effect.gen(function* () {
      const htmlRender = yield* HtmlRender.HtmlRender;
      const source = yield* pageSource(input);
      const { png, ...preview } = yield* htmlRender
        .preview({ ...source, width: input.width, appearance: input.appearance })
        .pipe(Effect.mapError(toFailure));
      return {
        ...preview,
        screenshot: {
          mimeType: "image/png" as const,
          data: png,
          width: preview.width,
          height: preview.capturedHeight,
        },
      };
    }),
  ),
  html_render: McpToolAccess.actsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "html_render");
      const htmlRender = yield* HtmlRender.HtmlRender;
      const source = yield* pageSource(input);
      const encodedSource = yield* encodeSource(source).pipe(
        Effect.mapError(
          () =>
            new OrchestratorMcpFailure({
              code: "invalid_request",
              message: "The HTML source could not be encoded.",
            }),
        ),
      );
      const threads = yield* ThreadManagementService.ThreadManagementService;
      const digest = (value: string) => NodeCrypto.createHash("sha256").update(value).digest("hex");
      const identity = digest(
        `${thread.threadId.length}:${thread.threadId}${input.publicationKey ?? NodeCrypto.randomUUID()}`,
      );
      const itemId = TurnItemId.make(`item:html-render:${identity}`);
      const requestHash = NodeCrypto.createHash("sha256")
        .update(encodedSource)
        .update(`${input.title.length}:`)
        .update(input.title)
        .update(String(input.height))
        .digest("hex");
      const committed = Effect.fnUntraced(function* (
        item: { readonly type: string; readonly input?: unknown; readonly output?: unknown } | null,
      ): Effect.fn.Return<HtmlRenderReference | undefined, OrchestratorMcpFailure> {
        if (item?.type !== "dynamic_tool" || typeof item.input !== "object" || item.input === null)
          return undefined;
        const publication = (item.input as { publication?: { requestHash?: string } }).publication;
        if (publication?.requestHash !== requestHash) {
          return yield* new OrchestratorMcpFailure({
            code: "invalid_request",
            message: "The publication key was already used for different HTML, title, or height.",
          });
        }
        return readHtmlRenderReference(
          (item.output as { htmlRender?: unknown } | undefined)?.htmlRender,
        );
      });
      const prior =
        input.publicationKey === undefined
          ? null
          : yield* threads
              .getTurnItem({ threadId: thread.threadId, itemId })
              .pipe(Effect.mapError(toFailure));
      let reference = yield* committed(prior?.item ?? null);
      if (reference === undefined) {
        const staged = yield* htmlRender
          .preparePublication({
            threadId: thread.threadId,
            ...source,
            title: input.title,
            height: input.height,
          })
          .pipe(Effect.mapError(toFailure));
        const commandId = CommandId.make(`command:html-render:${identity}`);
        // The receipt and its projection commit before dispatch resolves. An ambiguous failure
        // deliberately leaves an orphan for reconciliation instead of deleting published bytes.
        yield* threads
          .publishHtml({
            commandId,
            threadId: thread.threadId,
            providerInstanceId: thread.providerInstanceId,
            credentialId: thread.credentialId,
            itemId,
            requestHash,
            reference: staged,
          })
          .pipe(Effect.mapError(toFailure));
        const saved = yield* threads
          .getTurnItem({ threadId: thread.threadId, itemId })
          .pipe(Effect.mapError(toFailure));
        reference = yield* committed(saved.item);
        if (reference === undefined) {
          return yield* new OrchestratorMcpFailure({
            code: "orchestration_error",
            message: "The HTML publication could not be verified.",
          });
        }
        if (reference.attachmentId !== staged.attachmentId) {
          yield* htmlRender.discardPublication(staged);
        }
        yield* htmlRender.confirmPublication(reference);
      }
      return {
        htmlRender: reference,
        message:
          "Published to this thread. The reader's client may not have displayed it yet; don't restate the page in your reply.",
      };
    }),
  ),
} satisfies McpToolAccess.Handlers<typeof HtmlToolkit.tools>;

export const layerPreview = McpToolAccess.toLayer(HtmlPreviewToolkit, {
  html_preview: handlers.html_preview,
});

export const layerRender = McpToolAccess.toLayer(HtmlRenderToolkit, {
  html_render: handlers.html_render,
});
