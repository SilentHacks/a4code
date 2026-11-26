# FAQ

## Is A4 Code a harness?

No. A harness turns an LLM into an agent (tools, execution loop, and results)—like Claude Code's Agent SDK or Codex App Server. A4 Code drives those harnesses through one fast interface; it does not work without at least one installed agent.

Bring your own: Claude Code, Codex, Cursor, Grok Build, OpenCode, Google Antigravity, Kiro, Pi, Muse Code, fx, or any [ACP agent](./providers-acp.md). See [Provider setup](./install.md#providers). (Longer read: [What is a harness?](https://t3.gg/blog/post/what-is-a-harness))

## Why use A4 Code instead of Claude Code or the Codex app?

- **Bring your own subscription**: Use Claude, Codex, and every other agent you already have installed in one place.
- **Remote-first**: Run `a4code up` on any box and drive it from anywhere.
- **Native mobile app**: Approve steps, review PRs, and steer threads from iOS and Android.
- **Open source (MIT)**: Fork the source code under your own branding if you ever want something different.

## Can I use A4 Code with my Claude Code subscription?

Yes.

## How much does A4 Code cost?

Nothing. You pay your own model/agent providers. T3 Connect is free for up to 3 connected host machines per account (phones and browsers don't count). You can also self-host or use LAN/Tailscale.

## Can I fork or redistribute A4 Code?

Yes, for the source code. The [MIT License](../../LICENSE) covers source code only—not A4 Code's trademarks, name, wordmark, logos, or icons. Any public fork or build must use its own branding and clearly state that it is unofficial and not affiliated with T3 Tools, Inc. See [TRADEMARK.md](../../TRADEMARK.md).

## Can I connect more than 3 machines with T3 Connect?

Yes. Link a paid T3 Chat account from your account menu → **T3 Chat → Link T3 Chat**: T3 Chat Pro raises the limit to 10 machines, and Premier raises it to 100. See [More machines with T3 Chat](./remote-access.md#more-machines-with-t3-chat).

## Why is my Claude 5-hour limit draining so fast?

Since v0.1.7, Claude in A4 Code drains your 5-hour limit at the same rate as Claude Code directly (an earlier Anthropic Agent SDK discrepancy has been resolved). If you still see it, [update A4 Code](./updating.md) on the machine running your agents.

## How do I use A4 Code remotely?

Your agents run wherever the A4 Code server runs (desktop, server, or VPS). Run `a4code up` on that machine and connect via T3 Connect, LAN, Tailscale, or a configured hosted web app. See [Remote access](./remote-access.md).

## How do I use A4 Code on my phone?

Build the [iOS or Android app](./install.md#mobile-app) from source and connect it to your A4 Code server with a pairing link or a configured T3 Connect service. The host must stay on while the agents run.

## Why does T3 Connect keep disconnecting?

Open **Settings → Environments**, select the machine, and choose **Details**—the first failed check identifies the cause. See [T3 Connect troubleshooting](./a4-connect-troubleshooting.md). Tailscale also works great as a direct fallback.

## Will I get banned for using my subscription?

No. A4 Code stays within the TOS of Claude Code, Codex, Google Antigravity, Grok Build, Cursor, and official ACP bindings.

## Can I add a bunch of accounts for one provider?

A4 Code intentionally does not include an automatic multi-account switcher to avoid risking provider TOS bans. Adding a separate work/personal account is supported ([Codex](./providers-codex.md#use-multiple-accounts), [Claude](./providers-claude.md#multiple-accounts-and-presets)). For larger pools managed externally (e.g. via [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)), A4 Code can display pooled limits under Usage ([Connect a hub](./usage.md#connect-a-cliproxyapi-hub)).

## Can I use an API key or OpenRouter instead of a subscription?

Yes. Add another provider instance in **Settings → Providers** with its own environment variables and endpoint (your subscription setup stays untouched). See [OpenRouter for Claude](./providers-claude.md#openrouter-and-local-routers) and [Providers](./install.md#providers).

## Does A4 Code support local models?

No. A4 Code focuses on frontier coding agents.

## Does my code go to T3 servers?

No. Code and prompts go directly from your machine to your chosen provider. With T3 Connect, traffic travels over a Cloudflare tunnel (`cloudflared` on your machine); T3's relay coordinates the link without proxying your HTTP/WebSocket sessions.

A4 Code sends basic product usage events (provider, model, token totals—no prompts or file contents). Disable with `A4CODE_TELEMETRY_ENABLED=false` or `DO_NOT_TRACK=1`. See [Product usage data](./telemetry.md).

## Worktrees are eating my disk. How do I clean them up?

Enable automatic cleanup or run **Delete now** in **Settings → Worktrees → Cleanup**. See [Storage cleanup](./project-settings.md#storage-cleanup).

## Is there voice input?

Yes—on-device speech on iOS, Android, and macOS 26+ desktop, or via a paired environment on web/desktop/mobile. See [Voice input](./voice-input.md).

## Does it work on Windows, Mac, and Linux?

Yes, all three (desktop app and CLI). Note: there is no standalone `a4code` binary for Intel Macs (use the desktop app there), and Windows users can also run agents inside WSL. See [Install](./install.md).

## Why is my provider not showing up?

Usually the provider CLI is not installed, not signed in, or not on the `PATH` of the **server machine** (especially with version managers). Authenticate on the server machine first (e.g. `codex login` or `claude auth login`) and set **Binary path** in **Settings → Providers** if needed.
