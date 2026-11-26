#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build the SilentHacks/a4code fork on Ubuntu 22.04+ (x64 or ARM64).

Usage: bash install-fork-server.sh [--systemd]

Prerequisites:
  sudo apt-get update
  sudo apt-get install -y git curl ca-certificates build-essential python3 pkg-config libsecret-1-dev

Vite+/Node and a minimal Rust toolchain are installed for the current user if needed.
Allow several GB of free disk and at least 4 GB of RAM/swap for the source build.
OMP itself is not installed. The upstream installation and data are not used.

Options:
  --systemd   Write a separate a4code.service user unit; do not start it yet.

Overrides:
  A4CODE_FORK_REF          Branch, tag, or commit to build (default: main)
  A4CODE_FORK_INSTALL_DIR  Source/build storage (default: ~/.local/share/a4code)
  A4CODE_FORK_BIN_DIR      Launcher directory (default: ~/.local/bin)
  A4CODE_FORK_HOME         Fork state (default: ~/.a4code)
  A4CODE_FORK_PORT         Fork listener (default: 3774; stock T3 uses 3773)
EOF
}

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
systemd=0
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --systemd) systemd=1; shift ;;
  '') ;;
  *) usage >&2; exit 1 ;;
esac
[[ $# -eq 0 ]] || die 'Unexpected arguments.'
[[ "$(uname -s)" == Linux ]] || die 'This installer is for Ubuntu Linux.'
case "$(uname -m)" in x86_64|aarch64|arm64) ;; *) die 'Requires x64 or ARM64.' ;; esac
for tool in git curl python3 make g++ pkg-config; do
  command -v "$tool" >/dev/null || die "Missing $tool. Run the prerequisite apt-get commands from --help."
done
pkg-config --exists libsecret-1 || die 'Install libsecret-1-dev first.'

install_dir="${A4CODE_FORK_INSTALL_DIR:-$HOME/.local/share/a4code}"
bin_dir="${A4CODE_FORK_BIN_DIR:-$HOME/.local/bin}"
data_dir="${A4CODE_FORK_HOME:-$HOME/.a4code}"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
launcher="$bin_dir/a4code"
marker='# T3_OMP_MANAGED_V1'
for path in "$install_dir" "$bin_dir" "$data_dir" "$unit_dir"; do
  [[ "$path" == /* && "$path" != *$'\n'* && "$path" != *$'\r'* ]] || die 'Install paths must be absolute single-line paths.'
done
if [[ -e "$launcher" || -L "$launcher" ]]; then
  [[ -f "$launcher" ]] && grep -qxF "$marker" "$launcher" || die "Refusing to replace an unmanaged $launcher."
fi
if [[ "$systemd" -eq 1 && -e "$unit_dir/a4code.service" ]]; then
  grep -qxF "$marker" "$unit_dir/a4code.service" || die 'Refusing to replace an unmanaged a4code.service.'
fi

mkdir -p "$install_dir/releases" "$bin_dir"
release="$(mktemp -d "$install_dir/releases/build.XXXXXX")"
launcher_tmp=''
installed=0
cleanup() {
  [[ -z "$launcher_tmp" ]] || rm -f -- "$launcher_tmp"
  [[ "$installed" -eq 1 ]] || rm -rf -- "$release"
}
trap cleanup EXIT

printf 'Fetching the fork (%s)...\n' "${A4CODE_FORK_REF:-main}"
git init --quiet "$release"
git -C "$release" remote add origin https://github.com/SilentHacks/a4code.git
git -C "$release" sparse-checkout init --no-cone
# Vendored reference repositories are never build inputs.
git -C "$release" sparse-checkout set --no-cone '/*' '!/.repos/'
git -C "$release" fetch --filter=blob:none --depth=1 origin "${A4CODE_FORK_REF:-main}"
git -C "$release" checkout --detach --quiet FETCH_HEAD
[[ -f "$release/apps/server/src/provider/Drivers/OmpDriver.ts" ]] || die 'This revision does not include OMP.'
git -C "$release" rev-parse HEAD
cp "$release/.env.example" "$release/.env"

if [[ -f "$HOME/.config/vite-plus/env" ]]; then . "$HOME/.config/vite-plus/env"; fi
if ! command -v vp >/dev/null; then
  curl --proto '=https' --tlsv1.2 -fsSL https://vite.plus/install.sh -o "$release/install-vp.sh"
  bash "$release/install-vp.sh"
  . "$HOME/.config/vite-plus/env"
fi
VP_NODE_VERSION="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["engines"]["node"])' "$release/package.json")"
export VP_NODE_VERSION
if [[ -f "$HOME/.cargo/env" ]]; then . "$HOME/.cargo/env"; fi
if ! command -v rustup >/dev/null; then
  curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs -o "$release/install-rust.sh"
  sh "$release/install-rust.sh" -y --profile minimal --default-toolchain none
  . "$HOME/.cargo/env"
fi
rustup toolchain install 1.99.0 --profile minimal

cd "$release"
printf 'Building the A4 Code web client, server, and Linux resource monitor...\n'
vp i --frozen-lockfile
node_path="$(vp exec node -p 'process.execPath')"
[[ -x "$node_path" ]] || die 'Could not resolve the managed Node executable.'
vp run --filter a4code build
rustup run 1.99.0 cargo build --locked --release --manifest-path native/resource-monitor/Cargo.toml
mkdir -p apps/server/dist/resource-monitor
cp native/resource-monitor/target/release/t3-resource-monitor apps/server/dist/resource-monitor/t3-resource-monitor
[[ -f apps/server/dist/client/index.html ]] || die 'Bundled web client is missing.'
"$node_path" apps/server/dist/bin.mjs --version

launcher_tmp="$(mktemp "$bin_dir/.a4code.XXXXXX")"
python3 - "$launcher_tmp" "$node_path" "$release" "$data_dir" "$marker" "$systemd" "$unit_dir" "$launcher" <<'PY'
import pathlib, shlex, sys
target, node, release, data, marker, systemd, unit_dir, launcher = sys.argv[1:]
q = shlex.quote
pathlib.Path(target).write_text(f'''#!/usr/bin/env bash
{marker}
set -euo pipefail
default_home={q(data)}
export A4CODE_HOME="${{A4CODE_FORK_HOME:-$default_home}}"
export A4CODE_PORT="${{A4CODE_FORK_PORT:-3774}}"
export PATH={q(str(pathlib.Path(node).parent))}:"$HOME/.local/bin:$HOME/.bun/bin:${{PATH:-/usr/local/bin:/usr/bin:/bin}}"
case "${{1:-}}" in
  update|service)
    echo 'This is a source-built fork. Re-run its installer to update; use a4code.service for background operation.' >&2
    exit 1 ;;
  connect)
    case "${{2:-}}" in
      login|link|status|logout|unlink|publish|--help|-h) ;;
      *)
        echo 'Use: a4code connect link --headless, then a4code serve. The stock onboarding service can download upstream code.' >&2
        exit 1 ;;
    esac ;;
esac
exec {q(node)} {q(release + '/apps/server/dist/bin.mjs')} "$@"
''')
if systemd == '1':
    unit = pathlib.Path(unit_dir) / 'a4code.service'
    unit.parent.mkdir(parents=True, exist_ok=True)
    exec_start = launcher.replace('\\', '\\\\').replace('"', '\\"').replace('%', '%%').replace('$', '$$')
    unit.write_text(f'''{marker}
[Unit]
Description=A4 Code OMP fork (A4 Connect)
After=network-online.target

[Service]
WorkingDirectory=%h
ExecStart="{exec_start}" serve
Restart=on-failure
RestartSec=5
KillMode=mixed
TimeoutStopSec=30

[Install]
WantedBy=default.target
''')
PY
chmod 755 "$launcher_tmp"
mv -f "$launcher_tmp" "$launcher"
launcher_tmp=''
installed=1
printf '\nInstalled: %s\nState: %s (override with A4CODE_FORK_HOME)\n' "$launcher" "$data_dir"
if [[ "$systemd" -eq 1 ]]; then
  printf '\nStart the A4 Code service:\n  systemctl --user daemon-reload\n  systemctl --user enable --now a4code.service\n'
  printf 'Keep it running after logout:\n  sudo loginctl enable-linger "$USER"\n'
else
  printf '\nStart the server:\n  %q serve\n' "$launcher"
fi
printf '\nInstall/authenticate OMP on this VPS, then add Oh My Pi in the fork client.\n'
printf 'Old build directories are retained for rollback; updates require restarting the fork service.\n'
