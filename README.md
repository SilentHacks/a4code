# A4 Code

A4 Code is an independent, unofficial fork of [T3 Code](https://github.com/pingdotgg/t3code).
It is not affiliated with, endorsed by, or maintained by T3 Tools, Inc. It is regularly
merged with upstream main and keeps T3 Code's web, Electron desktop, and mobile
architecture, data locations, and T3 Connect integration while adding:

- **Oh My Pi (OMP) on V2 orchestration:** an ACP-backed provider with profiles,
  model discovery, usage tracking, session resume, elicitation, and a lifecycle
  bridge for background-job completions after a prompt returns. OMP also powers
  isolated text-generation and review helpers. [OMP setup](docs/user/providers-omp.md).
- **Server files:** browse and manage the environment host's filesystem, not only
  the current project, from the web/desktop Files panel or mobile environment
  settings. Access requires `terminal:operate`; permanent deletion requires confirmation.
- **Settle and start a new thread:** one action in the command palette, keyboard
  shortcuts, and mobile thread menu, retaining the current project.
- **Composer file references:** add files from panel tabs through drag-and-drop or
  their context menu without moving the source tab.
- **Remote-only shortcut ownership:** application bindings have a stable owner even
  when the desktop's Local environment is off.

## Running this fork

Use a build from this fork, not the upstream installers below. Install and
authenticate OMP separately **on the environment host**, then configure **Oh My Pi**
in Settings → Providers. OMP is not bundled with the desktop app.

For a separate VPS, run the fork's server there too: upgrading the Mac app does
not upgrade a remote server. Use matching fork clients and servers; the hosted
upstream web app and App Store clients may use a different wire protocol.

The [Ubuntu server installer](scripts/install-fork-server.sh) installs a separate
`t3-omp` launcher and state directory without replacing a stock T3 installation.

To build a Mac ARM64 DMG from source, install the repository's pinned Node/Vite+
toolchain, Rust, and Xcode 26 or newer command-line tools (for Apple Speech), copy
`.env.example` to `.env` for public Connect configuration, then run:

```bash
vp env on pnpm
vp i
vp run dist:desktop:dmg:arm64 --build-version 0.1.11-preview.YYYYMMDD.N
```

Replace the date and build number before running. Preview builds omit upstream's
automatic-update feed so an upstream release does not overwrite fork features.
Local builds are ad-hoc signed, not Apple-notarized releases.

If native compilation cannot find `<functional>`, expose the installed SDK's C++
headers before building:

```bash
export CPLUS_INCLUDE_PATH="$(xcrun --show-sdk-path)/usr/include/c++/v1"
```

## About upstream

The following installation instructions and project links describe **upstream T3
Code**, not this fork's binaries or support policy.

<h1 align="center">A4 Code</h1>

<p align="center">The open-source control plane for coding agents.</p>

<p align="center">
  <a href="https://t3.codes/download"><strong>Download</strong></a> ·
  <a href="https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824">iOS</a> ·
  <a href="https://play.google.com/store/apps/details?id=com.t3tools.t3code">Android</a> ·
  <a href="https://app.t3.codes">Web</a> ·
  <a href="./docs/README.md">Docs</a> ·
  <a href="https://discord.gg/jn4EGJjrvv">Discord</a>
</p>

<p align="center">
  <a href="https://t3.codes">
    <img src="./.github/readme/hero.webp" width="100%" alt="A4 Code on desktop with a finished Claude thread, next to the phone app asking to approve a command from Codex" />
  </a>
</p>

A4 Code runs the coding agents on your machine and gives them one fast interface. Start a thread at your desk, then approve the next step from your phone.

It works with Claude Code, Codex, Cursor, OpenCode, Grok Build, Antigravity, Kiro, Pi, Muse Code, fx, and any [ACP](./docs/user/providers-acp.md) agent. If an agent is set up on your computer, A4 Code can control it.

## What you get

- **Your subscriptions.** A4 Code does not resell tokens. It drives the agents you are already signed in to.
- **Every agent in one place.** Change models in the middle of a thread. Let Claude hand a task to Codex.
- **Desktop, web, and phone.** One server, and every client shows the same threads. There are apps for iOS and Android.
- **Remote ready.** Run agents on any machine. Connect over your local network, Tailscale, or [T3 Connect](./docs/user/remote-access.md).
- **Git built in.** Each thread can work in its own worktree. Review the diff, then commit, push, and open a pull request with one button.
- **Fast.** Performance is a feature here. We measure it, and we treat a dropped frame as a bug.
- **Open.** Source code is MIT licensed. If you don't like something, fork it under your own branding (see [Trademarks and forks](#trademarks-and-forks)).

## Install

### Desktop app

[Download A4 Code](https://t3.codes/download) for macOS, Windows, or Linux. You can also use a package manager:

| Platform       | Command                                                              |
| -------------- | -------------------------------------------------------------------- |
| macOS          | `brew install --cask t3-code`                                        |
| Windows        | `winget install T3Tools.T3Code` or `scoop install extras/t3code`     |
| Arch Linux     | `yay -S t3code-bin`                                                  |
| Nix            | `nix profile add github:NixOS/nixpkgs/nixos-unstable#t3code`         |
| Debian, Ubuntu | `.deb` from [Releases](https://github.com/pingdotgg/t3code/releases) |

### Command line

This installs the `t3` command. Run `t3` to start the server and open the web app.

```bash
curl -fsSL https://t3.codes/install.sh | sh
```

On Windows, in PowerShell:

```powershell
irm https://t3.codes/install.ps1 | iex
```

To try it once without an install, run `npx t3@latest`.

### Phone

Get the app from the [App Store](https://apps.apple.com/us/app/t3-code-remote-claude-more/id6787819824) or [Google Play](https://play.google.com/store/apps/details?id=com.t3tools.t3code). Then follow [remote access](./docs/user/remote-access.md) to connect it to your computer.

### Sign in to an agent

A4 Code needs one agent that is installed and signed in. For example, install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`, or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`.

[Provider setup](./docs/user/install.md#providers) has the steps for each agent. [Install A4 Code](./docs/user/install.md) covers nightly builds, AppImage, WSL, and NixOS.

## "Wait, what are you selling me?"

Nothing. We built A4 Code because we wanted the best possible development experience with agents. We were inspired by existing solutions like the Codex desktop app, Conductor, Claude Desktop and Cursor Glass, but none met our bar.

We wanted something performant, remote-ready, and truly open. If we ever go the wrong direction, we want you to have everything you need to fork the source code and build the tool that you want, under your own name and branding.

## Documentation

- [Install and first run](./docs/user/install.md)
- [Remote access from a phone or another machine](./docs/user/remote-access.md)
- [Permission modes](./docs/user/permission-modes.md)
- [Source control](./docs/user/source-control.md)
- [Connect outside agents over MCP](./docs/user/outside-agents.md)
- [FAQ](./docs/user/faq.md)

[All docs](./docs/README.md) has the full list.

## Contributing

We have limited review capacity. Small, focused fixes are the most likely to be merged. Features need an approved discussion first.

- Read [CONTRIBUTING.md](./CONTRIBUTING.md) before you report a bug or open a pull request.
- Put feature requests in [Ideas](https://github.com/pingdotgg/t3code/discussions/categories/ideas).
- Build from source with the [development runbook](./docs/operations/00_development.md#first-checkout). The [architecture overview](./docs/internals/01_architecture.md) explains how it works.
- Get help in [Discord](https://discord.gg/jn4EGJjrvv).

## License

The source code in this repository is licensed under the [MIT License](./LICENSE).

## Trademarks and forks

The MIT license applies **only to the source code**. It does not grant any rights to T3 Tools, Inc.'s trademarks, branding, or trade dress, including the **A4 Code** name, wordmark, logos, and application icons.

If you fork, redistribute, or build on A4 Code's source code:

- **Use your own branding.** Replace the A4 Code name, wordmark, logos, and application icons in any public fork, redistributed build, website, package, or app store listing.
- **Be explicitly clear that your project is unofficial.** Do not use the A4 Code name, wordmark, logo, or branding in your own projects without making it unmistakably clear that your project is unofficial and not affiliated with or endorsed by T3 Tools, Inc.

Using our name, wordmark, logo, or branding in a way that suggests official status or affiliation is trademark infringement and unlawful. **Any project indicating or implying that it is an official version of A4 Code when it is not will be pursued to the full extent of the law.**

See [TRADEMARK.md](./TRADEMARK.md) for the full trademark and branding policy.
