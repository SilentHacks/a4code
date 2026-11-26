# CLI reference (`a4code`)

The `a4code` command runs and manages A4 Code servers, background services, remote access, threads, workflows, and diagnostics. Run `a4code --help` or `t3 <command> --help` for full flags.

See [Install A4 Code](./install.md#command-line) for installation (`curl -fsSL https://raw.githubusercontent.com/SilentHacks/a4code/main/scripts/install.sh | sh`, `irm https://raw.githubusercontent.com/SilentHacks/a4code/main/scripts/install.ps1 | iex`, or `npx a4code@latest`).

## Running and connecting

| Command                      | Description                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `t3 [path]` / `a4code start` | Start a foreground server and open the web app (optionally in a project directory).                                              |
| `a4code serve`               | Start the server without opening a browser (`--lan`, `--tailscale-serve`, `--host`, `--port`, `--base-dir`).                     |
| `a4code app [path]`          | Open a directory as a project/thread in the running desktop app.                                                                 |
| `a4code up`                  | Interactive setup for remote access (A4 Connect and/or LAN) plus background service (`--connect`, `--lan`, `--no-lan`, `--yes`). |
| `a4code connect`             | Manage A4 Connect (`a4code connect`, `status`, `login`, `logout`, `link`, `unlink`).                                             |
| `t3 status`                  | Show how other devices can reach this host (`--json`).                                                                           |
| `a4code pair`                | Generate a one-time pairing URL / QR code (`--tailscale`, `--scope <scope>`).                                                    |

## Background service and updates

| Command                               | Description                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a4code service`                      | Manage the background service (`install`, `status`, `restart`, `uninstall`, `protect [--undo]`). See [Background service](./background-service.md). |
| `a4code update [version]`             | Update `a4code` and the service (`--channel nightly`, `--allow-downgrade`, `--yes`).                                                                |
| `a4code install` / `a4code uninstall` | Install or remove the `a4code` launcher and background service (keeps `~/.a4code/userdata`).                                                        |

## Threads, projects, and workflows

| Command           | Description                                                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a4code thread`   | Script threads on the host (`start`, `send`, `show`, `list`; supports `--wait`, `--json`, `--worktree`, `--provider`, `--model`, `--option`). See [Host scripts](./outside-agents.md#host-scripts-t3-thread). |
| `a4code project`  | Manage projects on the host (e.g. `a4code project add <path> --track <folder>`).                                                                                                                              |
| `a4code workflow` | Start and steer durable workflows (`start`, `list`, `show`, `resume`, `cancel`, `questions`, `signal`, `withdraw`, `hooks`, `store`). See [Workflows](./workflows.md).                                        |

## Environments, auth, themes, and policy

| Command              | Description                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `a4code environment` | Link or manage peer environments (`a4code environment link <addr> --pairing-code <code> --access <mode>`, `--from <file>`).                            |
| `a4code auth`        | Manage pairing codes, sessions, and A4 Connect device approvals (`pairing create`, `session list/revoke/issue`, `connect-device list/approve/revoke`). |
| `t3 theme`           | Manage server-published themes (`set <id>`, `clear`, `show`). See [Appearance](./appearance.md#environment-themes).                                    |
| `a4code policy`      | Validate, inspect, and generate MDM/GPO templates for [managed policies](./managed-policy.md) (`check`, `show`, `settings`, `templates`).              |

## Diagnostics and maintenance

| Command            | Description                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `a4code doctor`    | Inspect database size and reclaim disk space (`--dry-run`, `--fix`).                                       |
| `t3 browser setup` | One-time Linux host setup (AppArmor sandbox profile, libraries, fonts) for the headless preview browser.   |
| `t3 trace summary` | Summarize local server trace latency and errors (`--since 30m`, `--limit 50`).                             |
| `t3 triage`        | Launch Claude Code, Codex, or Antigravity in your terminal with the T3 triage playbook.                    |
| `a4code feedback`  | Send or inspect agent feedback reports (`list [--json]`, `--kind`, `--subject`, `--expected`, `--actual`). |
