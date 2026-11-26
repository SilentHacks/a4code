# A4 Code

A4 Code is an independent, unofficial fork of [T3 Code](https://github.com/pingdotgg/t3code).
It is not affiliated with, endorsed by, or maintained by T3 Tools, Inc.
Use one workspace to run coding agents on your machine and control them from desktop, web, or mobile.

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

## Install

- **Desktop:** download an artifact from [A4 Code Releases](https://github.com/SilentHacks/a4code/releases) when available, or build from source below.
- **Ubuntu server:** run the [source installer](scripts/install-fork-server.sh). It installs `a4code` and uses a separate data directory.
- **Web:** open the web app served by your A4 Code server. For a host on your LAN or tailnet, see [Remote access](docs/user/remote-access.md).
- **Mobile:** build the A4 Code client from source. The upstream store apps are not A4 Code clients.

Install and authenticate your coding agent on the **environment host**. OMP is configured under Settings → Providers → Oh My Pi and is not bundled with the app. Use matching A4 Code clients and servers, including on a separate VPS.

### Build the Mac ARM64 app

Install the pinned Node/Vite+ toolchain, Rust, and the Xcode 26 or newer command-line tools for Apple Speech. Then run:

```sh
vp env on pnpm
vp i
vp run dist:desktop:dmg:arm64 --build-version 0.1.11-preview.YYYYMMDD.N
```

Replace the date and build number. Local preview builds are ad-hoc signed, not Apple-notarized releases. If native compilation cannot find `<functional>`, set `CPLUS_INCLUDE_PATH` to `$(xcrun --show-sdk-path)/usr/include/c++/v1` and rebuild.

### Move an existing fork installation

A4 Code uses new application IDs, a new CLI command, and separate storage. It does not modify an existing upstream or `t3-omp` installation. Back up existing fork data before changing your installation. To keep a previous fork server's data, stop that server, copy its data directory to a new location, and point A4 Code at the copy with `A4CODE_HOME` (or set `A4CODE_FORK_HOME` when running the Ubuntu installer). Pair your clients with A4 Code; upstream app links and browser sessions are not reused.

## Documentation

- [Install and first run](docs/user/install.md)
- [Remote access from a phone or another machine](docs/user/remote-access.md)
- [Permission modes](docs/user/permission-modes.md)
- [Source control](docs/user/source-control.md)
- [Connect outside agents over MCP](docs/user/outside-agents.md)
- [Development setup](docs/operations/00_development.md)
- [All docs](docs/README.md)

## License and attribution

Source code is [MIT licensed](LICENSE). The [upstream trademark policy](TRADEMARK.md) describes marks and assets excluded from that license.
