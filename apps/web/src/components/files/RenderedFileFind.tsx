import { useGT } from "gt-react";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import { ScrollArea } from "~/components/ui/scroll-area";
import { isMacPlatform } from "~/lib/utils";
import { MarkdownFindContext } from "../chat/markdownFindContext";
import { stepThreadFindIndex } from "../chat/threadFind";
import { ThreadFindBar } from "../chat/ThreadFindBar";
import { useThreadFindHighlights } from "../chat/threadFindHighlights";
import { subscribePreviewAction, type PreviewAction } from "../preview/previewActionBus";

const FIND_ROW_ID = "rendered-file";

interface FindState {
  readonly open: boolean;
  readonly query: string;
  readonly index: number;
  readonly focusRequestId: number;
  readonly navigationId: number;
}

const CLOSED: FindState = { open: false, query: "", index: 0, focusRequestId: 0, navigationId: 0 };

function isFindShortcut(event: ReactKeyboardEvent): boolean {
  const mac = isMacPlatform(navigator.platform);
  return (
    event.key.toLowerCase() === "f" &&
    (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
    !event.shiftKey &&
    !event.altKey
  );
}

/** A scroll area of rendered file content with its own find bar, opened by mod+f or the panel find command. */
export function RenderedFileFind(props: {
  readonly children: ReactNode;
  readonly onKeyDown?: (event: ReactKeyboardEvent<HTMLElement>) => void;
}) {
  const gt = useGT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [find, setFind] = useState(CLOSED);
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const [matchCount, setMatchCount] = useState(0);

  const openFind = () => {
    setViewport(
      rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]') ?? null,
    );
    setFind((current) => ({
      ...current,
      open: true,
      focusRequestId: current.focusRequestId + 1,
    }));
  };
  const closeFind = () => {
    setFind((current) => ({ ...current, open: false }));
    viewport?.focus({ preventScroll: true });
  };
  const step = (delta: number) =>
    setFind((current) => ({
      ...current,
      index: stepThreadFindIndex(current.index, matchCount, delta),
      navigationId: current.navigationId + 1,
    }));

  const onPanelAction = useEffectEvent((action: PreviewAction) => {
    // Hidden panel tabs stay mounted; only the visible surface answers.
    if (action === "find" && rootRef.current?.getClientRects().length) openFind();
  });
  // oxlint-disable-next-line a4code/no-unreasoned-state-sync -- subscribes to the panel find command, which fires while focus is anywhere in the right panel
  useEffect(() => subscribePreviewAction(onPanelAction), []);

  const query = find.open ? find.query : "";
  const activeIndex = matchCount > 0 ? Math.min(find.index, matchCount - 1) : 0;
  useThreadFindHighlights({
    container: viewport,
    query,
    activeRowId: matchCount > 0 ? FIND_ROW_ID : null,
    activeOccurrence: activeIndex,
    highlightName: "t3-file-find",
    onMatchCount: setMatchCount,
    onActiveRange: (range) => {
      if (!range || !viewport) return;
      const match = range.getBoundingClientRect();
      const box = viewport.getBoundingClientRect();
      if (match.top >= box.top && match.bottom <= box.bottom) return;
      viewport.scrollBy({ top: match.top - box.top - (box.height - match.height) / 2 });
    },
  });

  return (
    <div
      ref={rootRef}
      className="relative flex min-h-0 flex-1 flex-col"
      onKeyDown={(event) => {
        // React bubbles keys from portaled children (the image dialog) through this surface.
        if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return;
        if (isFindShortcut(event)) {
          event.preventDefault();
          event.stopPropagation();
          openFind();
          return;
        }
        if (
          event.key === "Escape" &&
          find.open &&
          !event.nativeEvent.isComposing &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          event.stopPropagation();
          closeFind();
        }
      }}
    >
      <ThreadFindBar
        open={find.open}
        label={gt("Find in file")}
        query={find.query}
        matchCount={matchCount}
        status={null}
        onRetry={() => {}}
        activeIndex={activeIndex}
        navigationId={find.navigationId}
        settled
        focusRequestId={find.focusRequestId}
        onQueryChange={(next) =>
          setFind((current) => ({
            ...current,
            query: next,
            index: 0,
            navigationId: current.navigationId + 1,
          }))
        }
        onNext={() => step(1)}
        onPrevious={() => step(-1)}
        onClose={closeFind}
      />
      <ScrollArea className="min-h-0 flex-1" onKeyDown={props.onKeyDown}>
        <MarkdownFindContext value={find.open}>
          {/* Find highlights search text scopes inside timeline rows. */}
          <div data-timeline-row-id={FIND_ROW_ID}>
            <div data-thread-find-text="true">{props.children}</div>
          </div>
        </MarkdownFindContext>
      </ScrollArea>
    </div>
  );
}
