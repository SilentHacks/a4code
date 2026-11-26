#!/usr/bin/env node

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/cli";
import sharp from "sharp";

import { renderBackground, renderForeground } from "./export-android-icons.ts";
import {
  BRAND_ASSET_PATHS,
  DEVELOPMENT_PUBLIC_ICON_OVERRIDES,
  resolveWebIconOverrides,
} from "./lib/brand-assets.ts";
import { encodePngIco, WINDOWS_ICON_SIZES } from "./lib/icon-export.ts";

const ICON_SIZE = 1024;
const MAC_ICON_SIZE = 824;
const MAC_ICON_INSET = (ICON_SIZE - MAC_ICON_SIZE) / 2;
const WORDMARK_FRACTION = 88 / 128;

const MARKETING_ASSETS = "apps/marketing/src/assets";
const MARKETING_PUBLIC = "apps/marketing/public";

interface VariantOutputs {
  readonly ios: string;
  readonly macos: string;
  readonly universal: string;
  readonly appleTouch: string;
  readonly webIcon192: string;
  readonly webIcon512: string;
  readonly favicon16: string;
  readonly favicon32: string;
  readonly faviconIco: string;
  readonly windowsIco: string;
}

interface IconVariant {
  readonly label: string;
  readonly artwork: "dev" | "nightly" | "prod";
  readonly outputs: VariantOutputs;
}

export class IconExportFileSystemError extends Schema.TaggedError<IconExportFileSystemError>()(
  "IconExportFileSystemError",
  {
    operation: Schema.Literals([
      "resolve-repository-root",
      "check-path",
      "read-file",
      "make-directory",
      "make-temp-file",
      "write-file",
      "rename-file",
    ]),
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Icon export file-system operation '${this.operation}' failed for ${this.path}.`;
  }
}

class IconExportRenderError extends Schema.TaggedError<IconExportRenderError>()(
  "IconExportRenderError",
  {
    path: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const render = <A>(path: string, tryRender: () => Promise<A>) =>
  Effect.tryPromise({
    try: tryRender,
    catch: (cause) => new IconExportRenderError({ path, cause }),
  });

export class IconExportAssetsStaleError extends Schema.TaggedError<IconExportAssetsStaleError>()(
  "IconExportAssetsStaleError",
  {
    paths: Schema.Array(Schema.String),
  },
) {
  override get message(): string {
    return `Generated icon assets are stale:\n${this.paths.map((path) => `- ${path}`).join("\n")}`;
  }
}

const ICON_VARIANTS = [
  {
    label: "development",
    artwork: "dev",
    outputs: {
      ios: BRAND_ASSET_PATHS.developmentIosIconPng,
      macos: BRAND_ASSET_PATHS.developmentDesktopIconPng,
      universal: BRAND_ASSET_PATHS.developmentUniversalIconPng,
      appleTouch: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
      webIcon192: BRAND_ASSET_PATHS.developmentWebIcon192Png,
      webIcon512: BRAND_ASSET_PATHS.developmentWebIcon512Png,
      favicon16: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
      favicon32: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
      faviconIco: BRAND_ASSET_PATHS.developmentWebFaviconIco,
      windowsIco: BRAND_ASSET_PATHS.developmentWindowsIconIco,
    },
  },
  {
    label: "nightly",
    artwork: "nightly",
    outputs: {
      ios: BRAND_ASSET_PATHS.nightlyIosIconPng,
      macos: BRAND_ASSET_PATHS.nightlyMacIconPng,
      universal: BRAND_ASSET_PATHS.nightlyLinuxIconPng,
      appleTouch: BRAND_ASSET_PATHS.nightlyWebAppleTouchIconPng,
      webIcon192: BRAND_ASSET_PATHS.nightlyWebIcon192Png,
      webIcon512: BRAND_ASSET_PATHS.nightlyWebIcon512Png,
      favicon16: BRAND_ASSET_PATHS.nightlyWebFavicon16Png,
      favicon32: BRAND_ASSET_PATHS.nightlyWebFavicon32Png,
      faviconIco: BRAND_ASSET_PATHS.nightlyWebFaviconIco,
      windowsIco: BRAND_ASSET_PATHS.nightlyWindowsIconIco,
    },
  },
  {
    label: "production",
    artwork: "prod",
    outputs: {
      ios: BRAND_ASSET_PATHS.productionIosIconPng,
      macos: BRAND_ASSET_PATHS.productionMacIconPng,
      universal: BRAND_ASSET_PATHS.productionLinuxIconPng,
      appleTouch: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
      webIcon192: BRAND_ASSET_PATHS.productionWebIcon192Png,
      webIcon512: BRAND_ASSET_PATHS.productionWebIcon512Png,
      favicon16: BRAND_ASSET_PATHS.productionWebFavicon16Png,
      favicon32: BRAND_ASSET_PATHS.productionWebFavicon32Png,
      faviconIco: BRAND_ASSET_PATHS.productionWebFaviconIco,
      windowsIco: BRAND_ASSET_PATHS.productionWindowsIconIco,
    },
  },
] as const satisfies ReadonlyArray<IconVariant>;

const RepositoryRoot = Effect.service(Path.Path).pipe(
  Effect.flatMap((path) => path.fromFileUrl(new URL("..", import.meta.url))),
  Effect.mapError(
    (cause) =>
      new IconExportFileSystemError({
        operation: "resolve-repository-root",
        path: new URL("..", import.meta.url).pathname,
        cause,
      }),
  ),
);

// Rasterize the Icon Composer artwork once per variant, then resize the static rendition.
const renderVariant = Effect.fn("iconExport.renderVariant")(function* (
  repositoryRoot: string,
  variant: IconVariant,
) {
  const background = yield* renderBackground(
    repositoryRoot,
    variant.artwork,
    ICON_SIZE,
    WORDMARK_FRACTION,
  );
  const foreground = yield* renderForeground(
    repositoryRoot,
    variant.artwork,
    ICON_SIZE,
    WORDMARK_FRACTION,
  );
  const roundedMask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}"><rect width="100%" height="100%" rx="180" fill="white"/></svg>`,
  );
  const ios = yield* render(variant.outputs.ios, () =>
    sharp(background)
      .ensureAlpha()
      .composite([{ input: foreground }, { input: roundedMask, blend: "dest-in" }])
      .png()
      .toBuffer(),
  );
  const resize = (size: number) =>
    render(`${variant.label} ${size}×${size}`, () => sharp(ios).resize(size).png().toBuffer());

  const favicon16 = yield* resize(16);
  const favicon32 = yield* resize(32);
  const icoRenditions = yield* Effect.forEach(WINDOWS_ICON_SIZES, (size) =>
    Effect.map(
      size === 16
        ? Effect.succeed(favicon16)
        : size === 32
          ? Effect.succeed(favicon32)
          : resize(size),
      (contents) => ({ size, contents }),
    ),
  );
  const ico = encodePngIco(icoRenditions);

  const macBody = yield* resize(MAC_ICON_SIZE);
  const macShadow = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}">
      <filter id="shadow" filterUnits="userSpaceOnUse" x="0" y="0" width="${ICON_SIZE}" height="${ICON_SIZE}">
        <feGaussianBlur stdDeviation="18"/>
      </filter>
      <rect x="${MAC_ICON_INSET}" y="${MAC_ICON_INSET + 14}" width="${MAC_ICON_SIZE}" height="${MAC_ICON_SIZE}" rx="145" fill="black" opacity=".36" filter="url(#shadow)"/>
    </svg>`,
  );
  const macos = yield* render(variant.outputs.macos, () =>
    sharp(macShadow)
      .composite([{ input: macBody, left: MAC_ICON_INSET, top: MAC_ICON_INSET }])
      .png()
      .toBuffer(),
  );

  return new Map<string, Buffer>([
    [variant.outputs.ios, ios],
    [variant.outputs.universal, ios],
    [variant.outputs.macos, macos],
    [variant.outputs.appleTouch, yield* resize(180)],
    [variant.outputs.webIcon192, yield* resize(192)],
    [variant.outputs.webIcon512, yield* resize(512)],
    [variant.outputs.favicon16, favicon16],
    [variant.outputs.favicon32, favicon32],
    [variant.outputs.faviconIco, ico],
    [variant.outputs.windowsIco, ico],
  ]);
});

const writeAtomically = Effect.fn("iconExport.writeAtomically")(function* (
  repositoryRoot: string,
  relativePath: string,
  contents: Buffer,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const targetPath = path.join(repositoryRoot, relativePath);
  const targetDirectory = path.dirname(targetPath);
  yield* fs.makeDirectory(targetDirectory, { recursive: true }).pipe(
    Effect.mapError(
      (cause) =>
        new IconExportFileSystemError({
          operation: "make-directory",
          path: targetDirectory,
          cause,
        }),
    ),
  );
  const temporaryPath = yield* fs
    .makeTempFileScoped({
      directory: targetDirectory,
      prefix: ".a4-icon-export-",
      suffix: ".tmp",
    })
    .pipe(
      Effect.mapError(
        (cause) =>
          new IconExportFileSystemError({
            operation: "make-temp-file",
            path: targetDirectory,
            cause,
          }),
      ),
    );
  yield* fs.writeFile(temporaryPath, contents).pipe(
    Effect.mapError(
      (cause) =>
        new IconExportFileSystemError({
          operation: "write-file",
          path: temporaryPath,
          cause,
        }),
    ),
  );
  yield* fs.rename(temporaryPath, targetPath).pipe(
    Effect.mapError(
      (cause) =>
        new IconExportFileSystemError({
          operation: "rename-file",
          path: targetPath,
          cause,
        }),
    ),
  );
});

const isCurrent = Effect.fn("iconExport.isCurrent")(function* (
  repositoryRoot: string,
  relativePath: string,
  expected: Buffer,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const targetPath = path.join(repositoryRoot, relativePath);
  const exists = yield* fs.exists(targetPath).pipe(
    Effect.mapError(
      (cause) =>
        new IconExportFileSystemError({
          operation: "check-path",
          path: targetPath,
          cause,
        }),
    ),
  );
  if (!exists) return false;

  const actual = yield* fs.readFile(targetPath).pipe(
    Effect.mapError(
      (cause) =>
        new IconExportFileSystemError({
          operation: "read-file",
          path: targetPath,
          cause,
        }),
    ),
  );
  return Buffer.from(actual).equals(expected);
});

export const exportBrandIcons = Effect.fn("exportBrandIcons")(function* (checkOnly: boolean) {
  const repositoryRoot = yield* RepositoryRoot;
  const generated = new Map<string, Buffer>();
  for (const variant of ICON_VARIANTS) {
    yield* Console.log(`Rendering ${variant.label} from Icon Composer artwork…`);
    const variantAssets = yield* renderVariant(repositoryRoot, variant);
    for (const [relativePath, contents] of variantAssets) {
      generated.set(relativePath, contents);
    }
  }

  const marketingIcons = resolveWebIconOverrides("production", MARKETING_PUBLIC).filter(
    ({ targetRelativePath }) => !targetRelativePath.startsWith(`${MARKETING_PUBLIC}/icon-`),
  );
  for (const override of [...DEVELOPMENT_PUBLIC_ICON_OVERRIDES, ...marketingIcons]) {
    const sourceContents = generated.get(override.sourceRelativePath);
    if (sourceContents === undefined) {
      return yield* Effect.die(
        new Error(`Generated web icon is missing: ${override.sourceRelativePath}`),
      );
    }
    generated.set(override.targetRelativePath, sourceContents);
  }

  const path = yield* Path.Path;
  for (const [file, source] of [
    ["icon.webp", BRAND_ASSET_PATHS.productionIosIconPng],
    ["icon-nightly.webp", BRAND_ASSET_PATHS.nightlyIosIconPng],
  ]) {
    const target = `${MARKETING_ASSETS}/${file}`;
    const input = generated.get(source);
    if (input === undefined) {
      return yield* Effect.die(new Error(`Generated icon is missing: ${source}`));
    }
    generated.set(target, yield* render(target, () => sharp(input).webp().toBuffer()));
  }

  const socialCardSource = path.join(repositoryRoot, "assets/prod/social-card.svg");
  const socialCardTarget = `${MARKETING_ASSETS}/social-card.webp`;
  generated.set(
    socialCardTarget,
    yield* render(socialCardTarget, () => sharp(socialCardSource).webp().toBuffer()),
  );

  if (checkOnly) {
    const stale = yield* Effect.filter(
      [...generated.entries()],
      ([relativePath, contents]) =>
        isCurrent(repositoryRoot, relativePath, contents).pipe(Effect.map((current) => !current)),
      { concurrency: "unbounded" },
    );
    if (stale.length > 0) {
      return yield* new IconExportAssetsStaleError({
        paths: stale.map(([relativePath]) => relativePath),
      });
    }
    yield* Console.log(`All ${generated.size} generated icon assets are current.`);
    return;
  }

  yield* Effect.forEach(
    generated,
    ([relativePath, contents]) => writeAtomically(repositoryRoot, relativePath, contents),
    { concurrency: 1, discard: true },
  );
  yield* Console.log(`Updated ${generated.size} generated icon assets.`);
});

export const exportBrandIconsCommand = Command.make(
  "export-brand-icons",
  {
    check: Flag.Boolean("check").pipe(
      Flag.withDescription("Verify generated icon assets without modifying files."),
      Flag.withDefault(false),
    ),
  },
  ({ check }) => exportBrandIcons(check).pipe(Effect.scoped),
).pipe(
  Command.withDescription(
    "Export development, nightly, and production icons from Icon Composer artwork.",
  ),
);

if (import.meta.main) {
  Command.run(exportBrandIconsCommand, { version: "0.0.0" }).pipe(
    Effect.provide(NodeServices.layer),
    NodeRuntime.runMain,
  );
}
