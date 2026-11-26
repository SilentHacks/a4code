# Brand icons

The three Icon Composer projects are the source of truth for full application icons:

- `dev/app-icon.icon`
- `nightly/app-icon.icon`
- `prod/app-icon.icon`

Each project uses `text.svg` for the A4 mark and `background.svg` when the background is a vector layer. Additional layers use semantic names that describe their role and placement.

Run `vp run icons:export` from the repository root to generate the tracked iOS, macOS, Linux,
Windows, and web icons from the Icon Composer SVG layers. The static macOS render fits an 824×824
icon body and shadow into a 1024×1024 transparent canvas. The development web icons are also
copied to `apps/web/public`, and the production favicons are copied to `apps/marketing/public`.
The same command exports the marketing icons and `assets/prod/social-card.svg` to WebP.

Run `vp run icons:check` to verify that the generated assets and public copies match their sources.
The commands use Sharp and do not require Xcode. The bundled `.icon` projects remain the native
layered icons for platforms that support Icon Composer.

## Android launcher and splash artwork

Android masks the central 72dp of a 108dp adaptive canvas, and the Android 12+ splash screen masks
the central two thirds of a 288dp canvas, so the Icon Composer exports cannot be used directly:
their rounded-square silhouette gets framed again and the wordmark is cropped. The Android artwork
is instead rendered from the same Icon Composer SVG sources by `vp run icons:export:android`:

- `apps/mobile/assets/android-icon-foreground.png`: the shared transparent wordmark, sized to stay
  inside the safe zone
- `apps/mobile/assets/android-icon-background-dev.png` and `-nightly.png`: full-bleed variant
  artwork (blueprint grid and annotations; night sky and clouds). Production uses a solid color.
- `apps/mobile/assets/android-splash-icon-*.png`: the two layers composed into one 288dp image, so
  the splash mask reproduces the launcher icon's framing.

The same export also generates `android-icon-mark.png` for Android's monochrome themed icon and
`android-notification-icon.png` for notifications. Rerun the export after changing a layer SVG.
