# Running A4 Code in the background

Run A4 Code as a background user service on Linux, macOS, or Windows so your host stays reachable without keeping a terminal open.

## Manage the service

Install the `a4code` CLI first ([Command line](./install.md#command-line)), then run these commands on the host machine:

| Task                                    | Command                                                           |
| --------------------------------------- | ----------------------------------------------------------------- |
| Set up access from other devices        | `a4code up`                                                       |
| Check how other devices reach it        | `t3 status`                                                       |
| Install and start (or repair)           | `a4code service install`                                          |
| Check status and log path               | `a4code service status`                                           |
| Update to a newer release               | `a4code update`                                                   |
| Restart                                 | `a4code service restart`                                          |
| Stop and remove from startup            | `a4code service uninstall`                                        |
| Remove service, launcher, and downloads | `a4code uninstall` (keeps `~/.a4code/userdata` and `service.env`) |

- Pairing codes are never written to logs; run `a4code pair` or `a4code up` on the host to connect a device.
- `a4code update` asks before restarting (pass `--yes` in scripts). Pin a version with `a4code update 0.0.42`, switch tracks with `--channel nightly`, or downgrade with `--allow-downgrade`.

## Local network access

New services bind to localhost only. Run `a4code up --lan` (sets `A4CODE_LAN=true` in `service.env`) to listen on LAN and Tailscale addresses for direct desktop/mobile connections, or `a4code up --no-lan` to disable it. Anyone on that network can reach the port (gated by pairing). `A4CODE_HOST` overrides `A4CODE_LAN`. Hosted the hosted web client always uses T3 Connect.

## Configure the service environment

Add `KEY=VALUE` entries to `service.env` in your T3 home directory (`~/.a4code/service.env` by default). Values are literal (quote spaces or `#`; no shell expansion) and survive installs and updates.

```dotenv
A4CODE_PORT=3773
A4CODE_HOST=127.0.0.1
```

- `PATH`, `A4CODE_HOME`, `A4CODE_BOOT_SERVICE_UNIT`, and `A4CODE_SERVICE_LAUNCHER_CONTEXT` cannot be overridden here.
- Run `a4code service restart` after editing (and `chmod 600 ~/.a4code/service.env` if it holds secrets).

## Platform support

- **Linux**: Requires systemd user services with lingering enabled so A4 Code starts at boot and survives logout.
- **macOS**: Starts at login, stops at logout. Keep the Mac logged in and awake for unattended access. If agents can't read Desktop/Documents/Downloads, grant Full Disk Access to the `a4code` path in `~/Library/LaunchAgents/io.github.silenthacks.a4code.service.plist`.
- **Windows**: Runs windowless via Task Scheduler (`a4code-<domain>-<user>`) while signed in and auto-restarts on exit. Lock the screen instead of signing out for unattended access.

> Note: Signing out of T3 Connect does not stop or uninstall the background service.

## Keep the server responsive under memory pressure (Linux)

On Linux, agents run at lower priority than the server, but heavy memory use can still trigger the OOM killer. Run as your normal user:

```sh
a4code service protect
```

It previews system changes, asks for confirmation and `sudo`, and optionally protects Tailscale and SSH too. Run `a4code service restart` for OOM-killer protection to take effect, or `a4code service protect --undo` to remove it.

## Troubleshooting

Run `a4code service status` on the host to see the log path and health checks:

| Status                                 | Fix                                                                                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `linger-disabled`                      | Run `sudo loginctl enable-linger "$(id -un)"` (or `ssh -t your-server '...'`), then retry setup as your normal user. Never run A4 Code as root. |
| `linger-unavailable`                   | Check `loginctl show-user "$(id -un)" --property=Linger` and verify `systemd-logind`.                                                           |
| `user-manager-unavailable`             | Run `systemctl --user status` in a login session to verify systemd user support.                                                                |
| `service-disabled` / `service-stopped` | Check the log and `systemctl --user status a4code.service`, then run `a4code service install`.                                                  |
| `restart-pending`                      | Run `a4code service restart` to switch to the newly installed version.                                                                          |

For T3 Connect issues, see [T3 Connect troubleshooting](./a4-connect-troubleshooting.md).

## Reclaim database space

A4 Code automatically prunes old internal history while keeping conversations. Older databases that still hold freed space show a **Reclaim** button in **Settings → Maintenance** when at least 1 GiB is reclaimable (pauses the server/agents during repair).

For manually started servers (or CLI use), stop any hand-started server or desktop app and run:

```sh
a4code doctor          # Interactive repair (auto-stops/restarts a background service)
a4code doctor --dry-run
a4code doctor --fix    # Non-interactive recommended repairs
```

- Needs free disk space of ~2× active data size (in `TMPDIR`/`/var/tmp` and beside the database). Large databases can take over an hour.
- `a4code doctor` optionally offers to remove the legacy pre-0.1.0 `state.sqlite` backup only when all active projects and threads exist in the current database (`--fix` never deletes it automatically).
