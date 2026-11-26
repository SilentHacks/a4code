# Install A4 Code

A4 Code runs coding agents on your computer (or server) and lets you control them from the desktop app, web app, or mobile app. Install A4 Code on the machine where your agents will run first.

## Requirements

You need at least one installed, authenticated coding agent (provider) before starting a thread. You can launch A4 Code first and set up providers from the [Welcome page](./welcome-page.md) or **Settings → Providers**.

## Command line

Install the `a4code` command to `~/.local/bin`:

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/SilentHacks/a4code/main/scripts/install.sh | sh
```

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/SilentHacks/a4code/main/scripts/install.ps1 | iex
```

Once CLI artifacts are published, set `A4CODE_CHANNEL=nightly` for nightly builds or `A4CODE_VERSION=<ver>` to pin a version. For an Ubuntu source build, use the [A4 Code server installer](../../scripts/install-fork-server.sh).

| Task                          | Command                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| Start server and open web app | `a4code` (or `a4code ./my-project`)                                         |
| Start server without browser  | `a4code serve`                                                              |
| Set up remote access          | `a4code up` ([Remote access](./remote-access.md))                           |
| Run in the background         | `a4code service install` ([Background service](./background-service.md))    |
| Update                        | `a4code update`                                                             |
| Reclaim database space        | `a4code doctor` ([Details](./background-service.md#reclaim-database-space)) |
| Uninstall                     | `a4code uninstall`                                                          |

If `a4code` reports a server is already running, connect with `a4code pair` or pass a separate `--base-dir`. Run `a4code --help` for all commands.

### Intel Macs

There is no standalone `a4code` binary for Intel Macs—use the desktop app, or build a server from source with `vp` ([development runbook](../operations/00_development.md#first-checkout)):

```bash
git clone https://github.com/SilentHacks/a4code
cd a4code && vp i && vp run build:desktop
node apps/server/dist/bin.mjs
```

## Desktop app

Use [GitHub Releases](https://github.com/SilentHacks/a4code/releases) when a build is available, or [build from source](../../README.md#build-the-mac-arm64-app). On Linux, install the release `.deb` or mark the AppImage executable before opening it.

### The `a4code` command

The desktop app bundles `a4code` and sets it up on first launch (manage anytime under **Settings → About → a4code command**). Use **Add to PATH** if needed, then open a new terminal.

- **Open a folder in the running desktop app**: Run `a4code app` (or `a4code app ../my-project`) from a terminal, or drag folders from your file manager onto the desktop sidebar.

### Windows Subsystem for Linux

Select a WSL distro in **Settings → Sharing & access** to run agents and projects inside WSL (install provider CLIs inside that distro). A4 Code manages its own server runtime inside WSL automatically.

## Mobile app

Build the mobile client for [iOS or Android from source](../../apps/mobile/README.md) and pair it with your server using [remote access](./remote-access.md).

- If the mobile app crashes on launch, open **Settings → Diagnostics** on the next launch to copy recent startup crash reports.

## Providers

Open **Settings → Providers** (web or desktop), select the environment, and enable the providers you use. Installation and sign-in always happen on the **environment's machine**.

| Provider         | Install and authenticate                                                                                                 | Guide                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Codex**        | Connect with ChatGPT in Settings, or install [Codex CLI](https://developers.openai.com/codex/cli) and run `codex login`. | [Codex](./providers-codex.md)             |
| **Claude**       | Install [Claude Code](https://claude.com/product/claude-code) and run `claude auth login`.                               | [Claude](./providers-claude.md)           |
| **Cursor**       | Sign in in Settings or install [Cursor CLI](https://cursor.com/cli) and run `agent login`.                               | [Cursor](./cursor.md)                     |
| **Grok Build**   | Install [Grok Build CLI](https://x.ai/cli) and run `grok login`.                                                         | [Grok](./providers-grok.md)               |
| **Antigravity**  | Install managed runtime and sign in with Google in Settings.                                                             | [Antigravity](./providers-antigravity.md) |
| **OpenCode**     | Install [OpenCode](https://opencode.ai) and run `opencode auth login`.                                                   | [OpenCode](./providers-opencode.md)       |
| **Kiro**         | Install [Kiro CLI](https://kiro.dev/docs/cli/) and run `kiro-cli login`.                                                 | [Kiro](./providers-kiro.md)               |
| **Pi**           | Install [Pi](./providers-pi.md) (Node.js 22.19+) and run `pi` → `/login`.                                                | [Pi](./providers-pi.md)                   |
| **Muse Code**    | Install [Muse Code](https://dev.meta.ai/docs/muse-code) and run `muse login`.                                            | [Muse Code](./providers-muse.md)          |
| **fx**           | Install [fx](https://fx.sh) and run `fx login`.                                                                          | [fx](./providers-fx.md)                   |
| **ACP Registry** | Add GitHub Copilot and other agents in **Settings → Providers → Add provider → Show more**.                              | [ACP](./providers-acp.md)                 |

- **Binary path**: If a CLI isn't on the server's `PATH` (common with version managers), set **Binary path** in the provider's settings.
- **Updates**: Click **Update now** on outdated provider cards (supports Homebrew, mise `latest`, npm/pnpm/Yarn/Bun/Volta/Vite+, or the CLI's own updater; update Nix, Chocolatey, or pinned mise installs manually).
- **Multiple instances**: Add extra provider instances for separate accounts, API keys, or custom endpoints (mark secret env vars as sensitive).

### Provider check timeouts

If a working CLI times out during A4 Code's readiness check, increase its probe deadline (in milliseconds) in the server's environment (or systemd override / `service.env`) and restart:

```bash
A4CODE_CODEX_PROBE_TIMEOUT_MS=60000 A4CODE_CLAUDE_PROBE_TIMEOUT_MS=60000 a4code serve
```

| Provider     | Environment variable                   |
| ------------ | -------------------------------------- |
| Codex        | `A4CODE_CODEX_PROBE_TIMEOUT_MS`        |
| Claude       | `A4CODE_CLAUDE_PROBE_TIMEOUT_MS`       |
| Cursor       | `A4CODE_CURSOR_PROBE_TIMEOUT_MS`       |
| Antigravity  | `A4CODE_ANTIGRAVITY_PROBE_TIMEOUT_MS`  |
| Grok         | `A4CODE_GROK_PROBE_TIMEOUT_MS`         |
| Kiro         | `A4CODE_KIRO_PROBE_TIMEOUT_MS`         |
| fx           | `A4CODE_FX_PROBE_TIMEOUT_MS`           |
| Pi           | `A4CODE_PI_PROBE_TIMEOUT_MS`           |
| Muse Code    | `A4CODE_MUSE_PROBE_TIMEOUT_MS`         |
| OpenCode     | `A4CODE_OPENCODE_PROBE_TIMEOUT_MS`     |
| ACP Registry | `A4CODE_ACP_REGISTRY_PROBE_TIMEOUT_MS` |

## Next steps

- [User guide index](./README.md): overview of how A4 Code works.
- [Working with threads](./thread-sidebar.md): start tasks and organize parallel work.
- [Permission modes](./permission-modes.md): control when agents ask before acting.
- [Remote access](./remote-access.md): connect from another device.
- [Updating A4 Code](./updating.md): keep apps, servers, and providers up to date.
