import { EnvironmentId, ThreadId, type ScopedThreadRef } from "@a4code/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

export const THREAD_LINK_PROTOCOL = "a4-thread";
const V1_PREFIX = `${THREAD_LINK_PROTOCOL}://v1/`;
const V2_PREFIX = `${THREAD_LINK_PROTOCOL}://v2/`;
const NATIVE_HOSTED_PREFIX = "a4code://threads/";
const HOSTED_SEGMENT = "[A-Za-z0-9_%-]+";
const THREAD_HREF = `${THREAD_LINK_PROTOCOL}://v[12]/`;
// A label stops at any bracket, so a run of unclosed brackets is scanned once, not once per bracket.
const LABEL = String.raw`[^[\]\n]*`;
const LIST_MARKERS = String.raw`(?:(?:[-*+]|\d{1,9}[.)])[ \t]+)*`;
// CommonMark fences start on their own line (optional blockquotes, indentation, or list markers)
// and close on a line with at least as many of the same marker; backtick info strings hold no `.
// Quote markers are compared from the first `>`, so lines may indent them differently.
// Space after the markers is matched only after a `>`: two adjacent `[ \t]*` backtrack quadratically.
const AFTER_QUOTE = String.raw`(?:(?<=>)[ \t]*)?`;
const fencedCode = (char: "`" | "~", name: string) => {
  const bq = `${name}Bq`;
  const info = char === "`" ? "[^`\\r\\n]*" : "[^\\r\\n]*";
  const closer = String.raw`[ \t]*\k<${bq}>${AFTER_QUOTE}\k<${name}>${char}*(?!${char})[ \t]*\r?$`;
  return String.raw`^[ \t]*${LIST_MARKERS}(?<${bq}>(?:>(?:[ \t]*>)*)?)(?:(?<=>)[ \t]*${LIST_MARKERS})?(?<${name}>${char}{3,}(?!${char}))${info}(?=\r?$)(?:\r?\n(?!${closer})[ \t]*\k<${bq}>[^\r\n]*)*(?:\r?\n${closer})?`;
};
// A code span may wrap lines but ends where its paragraph does: a blank line, heading, list item, or fence.
const SPAN_LINE_BREAK = String.raw`\n(?![ \t>]*(?:\r?$|#{1,6}(?:[ \t]|\r?$)|(?:[-*+]|\d{1,9}[.)])[ \t]|\`{3,}[^\`\r\n]*\r?$|~{3,}))`;
// Earlier alternatives claim text so later ones cannot match inside it: an escaped character opens
// nothing, code is literal, and a link to anywhere else keeps a thread URL in its label or href.
const threadLinkPattern = (origin?: string | null) => {
  const prefixes = [NATIVE_HOSTED_PREFIX, hostedThreadPrefix(origin)].filter(Boolean);
  const prefix = prefixes.map((value) => value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|");
  const HOSTED_LINK = `(?:${prefix})${HOSTED_SEGMENT}/${HOSTED_SEGMENT}`;
  return new RegExp(
    [
      String.raw`\\[!-/:-@[-\`{-~]`,
      fencedCode("`", "bt"),
      fencedCode("~", "tl"),
      String.raw`(?<span>(?<!\`)(?<spanTicks>\`+)(?!\`)(?:[^\n]|${SPAN_LINE_BREAK})*?(?<!\`)\k<spanTicks>(?!\`))`,
      // A labeled link's destination may be angle-bracketed, as CommonMark allows: [label](<href>).
      String.raw`\[(?<label>${LABEL})\]\((?:<(?<angleHref>${THREAD_HREF}[^\s<>]+|${HOSTED_LINK})>|(?<href>${THREAD_HREF}[^\s>)]+|${HOSTED_LINK}))\)`,
      String.raw`\[${LABEL}\]\((?:<[^<>\n]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:[ \t]+(?:"[^"\n]*"|'[^'\n]*'))?\)`,
      String.raw`<(?<autolink>${THREAD_HREF}[^\s<>]+|${HOSTED_LINK})>`,
      // After a URL character the hosted link is part of a longer URL, such as a redirect target.
      String.raw`(?<![A-Za-z0-9%/?#=&@+-])(?<bare>${HOSTED_LINK})(?![\w%/?#-])`,
    ].join("|"),
    "gm",
  );
};

const hostedThreadPrefix = (origin?: string | null) =>
  origin ? `${origin.replace(/\/+$/u, "")}/threads/` : "";

const nativeThreadLinkPattern = threadLinkPattern();
let configuredThreadLinks: { origin: string; pattern: RegExp } | undefined;
const threadLinksPatternFor = (origin?: string | null): RegExp => {
  if (!origin) return nativeThreadLinkPattern;
  if (configuredThreadLinks?.origin !== origin) {
    configuredThreadLinks = { origin, pattern: threadLinkPattern(origin) };
  }
  return configuredThreadLinks.pattern;
};

const decodeThreadId = Schema.decodeUnknownOption(ThreadId);
const decodeEnvironmentId = Schema.decodeUnknownOption(EnvironmentId);

/** A v1 link names no environment; the message's own, or a unique match, stands in. */
export interface ThreadLink {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId;
}

// Escapes even URL-safe punctuation, so a sentence's closing period never reads as part of an id.
const hostedSegment = (id: string) =>
  encodeURIComponent(id).replace(
    /[.!~*'()]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** Opens the thread from anywhere: the hosted app offers the desktop app, the mobile app, or itself. */
export function hostedThreadLink(ref: ScopedThreadRef, origin?: string | null): string {
  const path = `${hostedSegment(ref.environmentId)}/${hostedSegment(ref.threadId)}`;
  return `${hostedThreadPrefix(origin) || NATIVE_HOSTED_PREFIX}${path}`;
}

const HOSTED_PATH = new RegExp(`^(${HOSTED_SEGMENT})/(${HOSTED_SEGMENT})$`);

function parseHostedThreadLink(path: string): ThreadLink | null {
  const match = HOSTED_PATH.exec(path);
  if (!match) return null;
  try {
    const environmentId = Option.getOrNull(decodeEnvironmentId(decodeURIComponent(match[1]!)));
    const threadId = Option.getOrNull(decodeThreadId(decodeURIComponent(match[2]!)));
    return environmentId === null || threadId === null ? null : { environmentId, threadId };
  } catch {
    return null;
  }
}

/**
 * The ids as written. Thread ids can hold percent escapes of their own, so they are not decoded,
 * except in a hosted link, which escapes them itself.
 */
export function parseThreadLinkHref(href: string, origin?: string | null): ThreadLink | null {
  if (href.startsWith(NATIVE_HOSTED_PREFIX)) {
    return parseHostedThreadLink(href.slice(NATIVE_HOSTED_PREFIX.length));
  }
  const hostedPrefix = hostedThreadPrefix(origin);
  if (hostedPrefix && href.startsWith(hostedPrefix)) {
    return parseHostedThreadLink(href.slice(hostedPrefix.length));
  }
  if (href.startsWith(V1_PREFIX)) {
    const threadId = Option.getOrNull(decodeThreadId(href.slice(V1_PREFIX.length)));
    return threadId === null ? null : { environmentId: null, threadId };
  }
  if (!href.startsWith(V2_PREFIX)) return null;
  const path = href.slice(V2_PREFIX.length);
  const slash = path.indexOf("/");
  if (slash < 0) return null;
  const environmentId = Option.getOrNull(decodeEnvironmentId(path.slice(0, slash)));
  const threadId = Option.getOrNull(decodeThreadId(path.slice(slash + 1)));
  return environmentId === null || threadId === null ? null : { environmentId, threadId };
}

function percentDecodedThreadLinkId(threadId: ThreadId): ThreadId | null {
  try {
    const decoded = decodeURIComponent(threadId);
    return decoded === threadId ? null : Option.getOrNull(decodeThreadId(decoded));
  } catch {
    return null;
  }
}

/** The threads a link can name, in its own environment or else the message's: as written, then decoded. */
export function threadLinkCandidates(
  link: ThreadLink,
  messageEnvironmentId: EnvironmentId,
): ReadonlyArray<ScopedThreadRef> {
  const environmentId = link.environmentId ?? messageEnvironmentId;
  const decodedId = percentDecodedThreadLinkId(link.threadId);
  const written = { environmentId, threadId: link.threadId };
  return decodedId === null ? [written] : [written, { environmentId, threadId: decodedId }];
}

/** A v1 link its message's environment lacks opens a unique match elsewhere; a v2 link never does. */
export function guessThreadLinkRef(
  link: ThreadLink,
  refs: ReadonlyArray<ScopedThreadRef>,
): ScopedThreadRef | null {
  if (link.environmentId !== null) return null;
  const decodedId = percentDecodedThreadLinkId(link.threadId);
  for (const threadId of decodedId === null ? [link.threadId] : [link.threadId, decodedId]) {
    let match: ScopedThreadRef | null = null;
    for (const ref of refs) {
      if (ref.threadId !== threadId) continue;
      if (match !== null) return null;
      match = ref;
    }
    if (match !== null) return match;
  }
  return null;
}

function threadLinkHref(link: ThreadLink): string {
  return link.environmentId === null
    ? `${V1_PREFIX}${link.threadId}`
    : `${V2_PREFIX}${link.environmentId}/${link.threadId}`;
}

const linkLabel = (label: string | undefined) =>
  label
    ?.replace(/[[\]\\\r\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Without a label, an autolink: clients show the thread's current title. */
export function formatThreadLink(ref: ThreadLink, label?: string): string {
  const cleaned = linkLabel(label);
  const href = threadLinkHref(ref);
  const destination = /[()]/.test(href) ? `<${href}>` : href;
  return cleaned ? `[${cleaned}](${destination})` : `<${href}>`;
}

/** What a person copies out of A4 Code: a link that opens the thread in the app. */
export function formatHostedThreadLink(
  ref: ScopedThreadRef,
  label: string,
  origin?: string | null,
): string {
  const href = hostedThreadLink(ref, origin);
  const cleaned = linkLabel(label);
  return cleaned ? `[${cleaned}](${href})` : href;
}

export function hasThreadLinks(markdown: string, origin?: string | null): boolean {
  const hostedPrefix = hostedThreadPrefix(origin);
  return (
    markdown.includes(`${THREAD_LINK_PROTOCOL}://v`) ||
    markdown.includes(NATIVE_HOSTED_PREFIX) ||
    (Boolean(hostedPrefix) && markdown.includes(hostedPrefix))
  );
}

/** Every thread the markdown's links can name, so their titles are keyed reads. */
export function threadLinkRefs(
  markdown: string,
  messageEnvironmentId: EnvironmentId,
  origin?: string | null,
): ReadonlyArray<ScopedThreadRef> {
  const refs = new Map<string, ScopedThreadRef>();
  // Hermes' matchAll yields matches without `groups`; exec keeps them.
  const pattern = threadLinksPatternFor(origin);
  pattern.lastIndex = 0;
  for (let match = pattern.exec(markdown); match !== null; match = pattern.exec(markdown)) {
    const href =
      match.groups?.angleHref ?? match.groups?.href ?? match.groups?.autolink ?? match.groups?.bare;
    const link = href === undefined ? null : parseThreadLinkHref(href, origin);
    if (link === null) continue;
    for (const ref of threadLinkCandidates(link, messageEnvironmentId)) {
      refs.set(`${ref.environmentId}/${ref.threadId}`, ref);
    }
  }
  return [...refs.values()];
}

/** Rewrites each link outside code `replace` answers for. `label` is a Markdown link's own text. */
export function replaceThreadLinks(
  markdown: string,
  replace: (link: ThreadLink, label: string | undefined) => string | undefined,
  origin?: string | null,
): string {
  if (!hasThreadLinks(markdown, origin)) return markdown;
  const pattern = threadLinksPatternFor(origin);
  return markdown.replace(pattern, (source, ...args) => {
    const groups = args.at(-1) as Partial<
      Record<"angleHref" | "href" | "autolink" | "bare" | "label", string>
    >;
    const href = groups.angleHref ?? groups.href ?? groups.autolink ?? groups.bare;
    const link = href === undefined ? null : parseThreadLinkHref(href, origin);
    return (link && replace(link, groups.label)) ?? source;
  });
}
