#!/usr/bin/env bash
# Update the local DSH Crew installation without deleting profiles or service state.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$SCRIPT_DIR"
DSH_DIR="${DSH_SOURCE_DIR:-/home/system/dsh}"
PLUGIN_DIR="$REPO_ROOT/plugins/crew-messaging"
DSH_PROFILE_NAME="${DSH_PROFILE:-web}"

if [[ -n "${CREW_SERVICES_DIR:-}" && "${CREW_SERVICES_DIR}" != /* ]]; then
  CREW_SERVICES_DIR="$REPO_ROOT/$CREW_SERVICES_DIR"
fi
CREW_SERVICES_DIR="${CREW_SERVICES_DIR:-$REPO_ROOT/../crew-services}"
DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
CREW_BIN_DIR="${CREW_BIN_DIR:-$HOME/.local/bin}"
export PATH="$CREW_BIN_DIR:$PATH"
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

install_dsh_launcher() {
  local launcher="$DSH_DIR/apps/cli/lib/bin.js"

  [[ -x "$launcher" ]] || die "Built DSH launcher is missing or not executable: $launcher"
  mkdir -p -- "$CREW_BIN_DIR"
  ln -sfn -- "$launcher" "$CREW_BIN_DIR/dsh"
  printf 'Installed dsh launcher: %s -> %s\n' "$CREW_BIN_DIR/dsh" "$launcher"
}

update_community_plugins() {
  local profile_dir="$DSH_HOME_DIR/profiles/$DSH_PROFILE_NAME"
  local manifest="$profile_dir/package.json"
  local kind
  local package_name
  local source
  local sources_file
  local inventory_file
  local installed
  local latest
  local remote
  local resolved
  local locked_commit
  local remote_commit
  local -a registry_plugins=()
  local -a git_plugins=()
  local -a fixed_plugins=()

  if [[ ! -f "$manifest" ]]; then
    printf 'Skipping community plugin updates: profile %s is not initialized.\n' "$DSH_PROFILE_NAME"
    return
  fi

  sources_file="$(mktemp "${TMPDIR:-/tmp}/dsh-profile-plugins.XXXXXX")"
  inventory_file="$(mktemp "${TMPDIR:-/tmp}/dsh-profile-inventory.XXXXXX")"
  node - "$manifest" "$(node -p "require('$PLUGIN_DIR/package.json').name")" >"$sources_file" <<'NODE'
const manifest = require(process.argv[2])
const localPlugin = process.argv[3]
for (const [name, raw] of Object.entries(manifest.dependencies ?? {})) {
  if (name === localPlugin || typeof raw !== 'string') continue
  const spec = raw.trim()
  if (/^(?:file|link|workspace|portal):/.test(spec) || /^(?:\.{0,2}\/|\/)/.test(spec)) {
    console.log(`fixed\t${name}\t${spec}`)
    continue
  }
  if (/^(?:github:|git(?:\+[^:]+)?:|https?:\/\/[^\s]+\.git(?:#|$))/.test(spec)) {
    console.log(`git\t${name}\t${spec.replace(/#.*$/, '')}`)
    continue
  }
  if (/^(?:https?:\/\/|[^\s]+\.(?:tgz|tar\.gz)$)/.test(spec)) {
    console.log(`fixed\t${name}\t${spec}`)
    continue
  }
  console.log(`registry\t${name}\t${spec}`)
}
NODE

  while IFS=$'\t' read -r kind package_name source; do
    [[ -n "$package_name" ]] || continue
    case "$kind" in
      registry) registry_plugins+=("$package_name") ;;
      git) git_plugins+=("$package_name"$'\t'"$source") ;;
      fixed) fixed_plugins+=("$package_name"$'\t'"$source") ;;
      *) die "Unknown community plugin source kind: $kind" ;;
    esac
  done <"$sources_file"

  write_plugin_inventory "$profile_dir" "$inventory_file"

  for package_name in "${registry_plugins[@]}"; do
    installed="$(plugin_inventory_field "$inventory_file" "$package_name" version)"
    latest="$(pnpm view "$package_name" version)"
    [[ -n "$latest" ]] || die "Registry returned no latest version for $package_name"
    if [[ "$installed" == "$latest" ]]; then
      printf 'Registry plugin is current: %s %s\n' "$package_name" "$installed"
      continue
    fi
    printf 'Updating registry plugin: %s %s -> %s\n' "$package_name" "${installed:-not-installed}" "$latest"
    (
      cd -- "$DSH_DIR"
      DSH_HOME="$DSH_HOME_DIR" pnpm dsh plugin --profile "$DSH_PROFILE_NAME" add "$package_name@$latest"
    )
  done

  for kind in "${git_plugins[@]}"; do
    IFS=$'\t' read -r package_name source <<<"$kind"
    remote="$(git_plugin_remote "$source")"
    remote_commit="$(git ls-remote "$remote" HEAD | awk 'NR == 1 { print $1 }')"
    [[ "$remote_commit" =~ ^[0-9a-fA-F]{40}$ ]] || die "Could not resolve Git HEAD for $package_name from $remote"
    resolved="$(plugin_inventory_field "$inventory_file" "$package_name" resolved)"
    locked_commit="$(sed -nE 's|.*[/#]([0-9a-fA-F]{40})([^0-9a-fA-F].*)?$|\1|p' <<<"$resolved")"
    if [[ "${locked_commit,,}" == "${remote_commit,,}" ]]; then
      printf 'Git plugin is current: %s %s\n' "$package_name" "${remote_commit:0:10}"
      continue
    fi
    printf 'Updating Git plugin: %s %s -> %s\n' "$package_name" "${locked_commit:0:10}" "${remote_commit:0:10}"
    (
      cd -- "$DSH_DIR"
      DSH_HOME="$DSH_HOME_DIR" pnpm dsh plugin --profile "$DSH_PROFILE_NAME" update --latest --force "$package_name"
    )
  done

  write_plugin_inventory "$profile_dir" "$inventory_file"
  printf '\nCommunity plugin report for profile %s:\n' "$DSH_PROFILE_NAME"
  for package_name in "${registry_plugins[@]}"; do
    installed="$(plugin_inventory_field "$inventory_file" "$package_name" version)"
    latest="$(pnpm view "$package_name" version)"
    [[ "$installed" == "$latest" ]] || die "$package_name remained at ${installed:-not-installed}; registry latest is $latest"
    printf '  current  %s %s\n' "$package_name" "$installed"
  done
  for kind in "${git_plugins[@]}"; do
    IFS=$'\t' read -r package_name source <<<"$kind"
    remote="$(git_plugin_remote "$source")"
    remote_commit="$(git ls-remote "$remote" HEAD | awk 'NR == 1 { print $1 }')"
    resolved="$(plugin_inventory_field "$inventory_file" "$package_name" resolved)"
    locked_commit="$(sed -nE 's|.*[/#]([0-9a-fA-F]{40})([^0-9a-fA-F].*)?$|\1|p' <<<"$resolved")"
    [[ "${locked_commit,,}" == "${remote_commit,,}" ]] || die "$package_name remained at ${locked_commit:-unknown}; remote HEAD is $remote_commit"
    printf '  current  %s %s\n' "$package_name" "${locked_commit:0:10}"
  done
  for kind in "${fixed_plugins[@]}"; do
    IFS=$'\t' read -r package_name source <<<"$kind"
    installed="$(plugin_inventory_field "$inventory_file" "$package_name" version)"
    printf '  manual   %s %s (%s)\n' "$package_name" "${installed:-unknown}" "$source"
  done
  printf '  managed  %s (rebuilt from %s)\n' "$(node -p "require('$PLUGIN_DIR/package.json').name")" "$PLUGIN_DIR"

  rm -f -- "$sources_file" "$inventory_file"
}

write_plugin_inventory() {
  local profile_dir=$1
  local destination=$2
  (cd -- "$profile_dir" && pnpm list --depth 0 --json --long) >"$destination"
}

plugin_inventory_field() {
  local inventory=$1
  local package_name=$2
  local field=$3
  node - "$inventory" "$package_name" "$field" <<'NODE'
const fs = require('node:fs')
const inventory = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const value = inventory[0]?.dependencies?.[process.argv[3]]?.[process.argv[4]]
if (typeof value === 'string') process.stdout.write(value)
NODE
}

git_plugin_remote() {
  local source=$1
  case "$source" in
    github:*) printf 'https://github.com/%s.git\n' "${source#github:}" ;;
    git+*) printf '%s\n' "${source#git+}" ;;
    *) printf '%s\n' "$source" ;;
  esac
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
  local package_scope
  local package_scope_dir
  local package_names
  local plugin_node_modules="$PLUGIN_DIR/node_modules"
  local workspace_packages

  workspace_packages="$(mktemp "${TMPDIR:-/tmp}/dsh-workspaces.XXXXXX")"
  pnpm --dir "$DSH_DIR" -r list --depth -1 --json \
    | node -e '
      let input = ""
      process.stdin.setEncoding("utf8")
      process.stdin.on("data", chunk => { input += chunk })
      process.stdin.on("end", () => {
        for (const entry of JSON.parse(input)) console.log(`${entry.name}\t${entry.path}`)
      })
    ' >"$workspace_packages"

  package_names="$(node -e '
    const manifest = require(process.argv[1])
    const dependencies = { ...manifest.peerDependencies, ...manifest.devDependencies }
    console.log([...new Set(Object.keys(dependencies))].join("\n"))
  ' "$PLUGIN_DIR/package.json")"

  while IFS= read -r package_name; do
    [[ -z "$package_name" ]] && continue
    package_source="$(awk -F '\t' -v name="$package_name" '$1 == name { print $2; exit }' "$workspace_packages")"
    if [[ -z "$package_source" ]]; then
      package_source="$DSH_DIR/node_modules/$package_name"
    fi
    if [[ ! -e "$package_source" && ! -L "$package_source" ]]; then
      package_source="$DSH_DIR/apps/web/node_modules/$package_name"
    fi
    [[ -e "$package_source" || -L "$package_source" ]] || die "DeepSeek Harness does not provide plugin dependency: $package_name"
    package_scope="$(dirname -- "$package_name")"
    package_scope_dir="$plugin_node_modules/$package_scope"
    if [[ "$package_scope" != "." && -L "$package_scope_dir" ]]; then
      rm -- "$package_scope_dir"
    fi
    mkdir -p -- "$package_scope_dir"
    ln -sfn -- "$package_source" "$plugin_node_modules/$package_name"
  done <<< "$package_names"

  rm -f -- "$workspace_packages"
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
require_command ln
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

phase "Installing the global DSH launcher"
install_dsh_launcher

phase "Updating community plugins for profile $DSH_PROFILE_NAME"
update_community_plugins

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
  pnpm exec tsc --noEmit -p "$PLUGIN_DIR/tsconfig.json"
  pnpm exec tsc -p "$PLUGIN_DIR/tsconfig.client.json"
  pnpm exec tsdown --config "$PLUGIN_DIR/tsdown.config.ts" --tsconfig "$PLUGIN_DIR/tsconfig.json"
)
(
  cd -- "$DSH_DIR"
  # pnpm treats an unchanged-version file dependency as already installed even
  # when its built files changed. Re-add the one local plugin so the profile
  # receives the freshly built bundle every time.
  DSH_HOME="$DSH_HOME_DIR" pnpm dsh plugin --profile "$DSH_PROFILE_NAME" remove dsh-crew-messaging >/dev/null 2>&1 || true
  DSH_HOME="$DSH_HOME_DIR" pnpm dsh plugin --profile "$DSH_PROFILE_NAME" add "file:$PLUGIN_DIR"
)

phase "Validating profile $DSH_PROFILE_NAME"
(
  cd -- "$DSH_DIR"
  DSH_HOME="$DSH_HOME_DIR" pnpm dsh --profile "$DSH_PROFILE_NAME" --dump-config >/dev/null
)

phase "Installing crew service binaries"
mkdir -p -- "$CREW_BIN_DIR"
for service in "${BUILT_SERVICES[@]}"; do
  install -m 0755 "$STAGE_DIR/$service" "$CREW_BIN_DIR/$service"
done

phase "Restarting enabled user services"
systemctl --user daemon-reload
# The DSH-backed reviewer client is intentionally restarted only after the
# plugin route is live. Messaging and Codex remain independent prerequisites.
restart_if_enabled crew-messaging.service
restart_if_enabled crew-codex.service
restart_if_enabled dsh-web.service
restart_if_enabled crew-review.service

printf '\nUpdate complete. Profiles and service state databases were preserved.\n'
