#!/usr/bin/env bash
# Update the local DSH Crew installation without deleting profiles or service state.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$SCRIPT_DIR"
DSH_DIR="$REPO_ROOT/research/deepseek-harness"
PLUGIN_DIR="$REPO_ROOT/plugins/crew-messaging"

if [[ -n "${CREW_SERVICES_DIR:-}" && "${CREW_SERVICES_DIR}" != /* ]]; then
  CREW_SERVICES_DIR="$REPO_ROOT/$CREW_SERVICES_DIR"
fi
CREW_SERVICES_DIR="${CREW_SERVICES_DIR:-$REPO_ROOT/../crew-services}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
CREW_BIN_DIR="${CREW_BIN_DIR:-$HOME/.local/bin}"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

PHASE="preflight"
STAGE_DIR=""
SERVICES_RESTARTED=0

phase() {
  PHASE="$1"
  printf '\n==> %s\n' "$PHASE"
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  if (( SERVICES_RESTARTED )); then
    printf 'Update stopped during %s (exit %d). One or more services may have restarted; inspect their status.\n' "$PHASE" "$exit_code" >&2
  else
    printf 'Update stopped during %s (exit %d). Running services were not restarted.\n' "$PHASE" "$exit_code" >&2
  fi
  exit "$exit_code"
}

cleanup() {
  [[ -z "$STAGE_DIR" ]] || rm -rf -- "$STAGE_DIR"
}

trap on_error ERR
trap cleanup EXIT

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

require_git_repo() {
  [[ -d "$1" ]] || die "$2 directory is missing: $1"
  git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "$2 is not a Git checkout: $1"
}

update_repo() {
  local name=$1
  local directory=$2

  phase "Updating $name"
  git -C "$directory" status --short --branch
  if ! git -C "$directory" pull --ff-only; then
    die "$name could not fast-forward. Resolve its Git state manually; local changes were left in place."
  fi
}

link_plugin_dependencies() {
  local package_name
  local package_source
  local package_names
  local plugin_node_modules="$PLUGIN_DIR/node_modules"

  package_names="$(node -e '
    const manifest = require(process.argv[1])
    const dependencies = { ...manifest.peerDependencies, ...manifest.devDependencies }
    console.log([...new Set(Object.keys(dependencies))].join("\\n"))
  ' "$PLUGIN_DIR/package.json")"

  while IFS= read -r package_name; do
    [[ -z "$package_name" ]] && continue
    package_source="$DSH_DIR/node_modules/$package_name"
    [[ -e "$package_source" || -L "$package_source" ]] || continue
    mkdir -p -- "$plugin_node_modules/$(dirname -- "$package_name")"
    ln -sfn -- "$package_source" "$plugin_node_modules/$package_name"
  done <<< "$package_names"
}

build_service() {
  local service=$1
  local source_dir="$CREW_SERVICES_DIR/cmd/$service"

  if [[ ! -d "$source_dir" ]]; then
    printf 'Skipping %s: %s is not present.\n' "$service" "$source_dir"
    return
  fi

  printf 'Building %s.\n' "$service"
  (
    cd -- "$CREW_SERVICES_DIR"
    go build -o "$STAGE_DIR/$service" "./cmd/$service"
  )
  BUILT_SERVICES+=("$service")
}

restart_if_enabled() {
  local unit=$1

  if systemctl --user is-enabled --quiet "$unit"; then
    printf 'Restarting %s.\n' "$unit"
    SERVICES_RESTARTED=1
    systemctl --user restart "$unit"
  else
    printf 'Skipping %s: not an enabled user service.\n' "$unit"
  fi
}

phase "Checking prerequisites"
require_command git
require_command node
require_command pnpm
require_command systemctl
require_command install
require_command mktemp
require_git_repo "$REPO_ROOT" "DSH Crew"
require_git_repo "$CREW_SERVICES_DIR" "crew-services"
require_git_repo "$DSH_DIR" "DeepSeek Harness"
[[ -f "$DSH_DIR/package.json" ]] || die "DeepSeek Harness package.json is missing: $DSH_DIR/package.json"
[[ -f "$PLUGIN_DIR/package.json" ]] || die "Crew messaging plugin is missing: $PLUGIN_DIR"

SERVICE_NAMES=(crew-messaging crew-review crew-codex)
for service in "${SERVICE_NAMES[@]}"; do
  if [[ -d "$CREW_SERVICES_DIR/cmd/$service" ]]; then
    require_command go
    break
  fi
done

update_repo "DSH Crew" "$REPO_ROOT"
update_repo "crew-services" "$CREW_SERVICES_DIR"
update_repo "DeepSeek Harness" "$DSH_DIR"

phase "Installing and building DeepSeek Harness"
(
  cd -- "$DSH_DIR"
  pnpm install
  pnpm run clean
  pnpm run build
)

phase "Building crew services"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dsh-crew-update.XXXXXX")"
BUILT_SERVICES=()
for service in "${SERVICE_NAMES[@]}"; do
  build_service "$service"
done

phase "Building and installing dsh-crew-messaging"
printf 'Linking DSH dependencies needed by the plugin build.\n'
link_plugin_dependencies
(
  cd -- "$DSH_DIR"
  pnpm exec tsdown --config "$PLUGIN_DIR/tsdown.config.ts" --tsconfig "$PLUGIN_DIR/tsconfig.json"
)
(
  cd -- "$DSH_DIR"
  DSH_HOME="$DSH_HOME_DIR" pnpm dsh plugin --profile web add "file:$PLUGIN_DIR"
)

phase "Installing crew service binaries"
mkdir -p -- "$CREW_BIN_DIR"
for service in "${BUILT_SERVICES[@]}"; do
  install -m 0755 "$STAGE_DIR/$service" "$CREW_BIN_DIR/$service"
done

phase "Restarting enabled user services"
systemctl --user daemon-reload
for service in "${SERVICE_NAMES[@]}"; do
  restart_if_enabled "$service.service"
done
restart_if_enabled dsh-web.service

printf '\nUpdate complete. Profiles and service state databases were preserved.\n'
