# DSH on den-agents

The installed service uses the clean upstream checkout at
`/home/agent/system/dsh`. `/home/system/dsh` resolves to the same location;
`/home/agent/system/dsh-runtime` is a compatibility symlink, not another Git
worktree. `~/.local/bin/dsh` points at `apps/cli/lib/bin.js` in that checkout.
No local DSH source patches are applied.

`systemctl --user restart dsh-web.service` restarts the Web UI. Its user unit
runs the built CLI with the installed Node 24 toolchain. It retains the
`crew-services.conf` dependency drop-in and `~/.config/dsh/crew-messaging.env`.
Profiles, credentials, sessions, and plugin storage remain under `~/.dsh`.
The service's working directory is the checkout; select a product workspace
in the UI when starting work.

## Access

- DSH listens on `127.0.0.1:3080`.
- `dsh-web-lan.socket` listens on `192.168.1.10:3080` and activates
  `dsh-web-lan.service`, which forwards TCP to the loopback listener with
  systemd-socket-proxyd. HTTP and WebSockets use the same forwarding path.
- The existing URL is `https://deepseek.dragonden.stream`.
- The service trusts the configured LAN authority, `den-agents:3080`, and that
  reverse-proxy hostname. Authentication remains DSH's existing token flow.

Current upstream DSH requires a concrete listener address. The web profile's
user patch overrides the LAN plugin's obsolete wildcard listener and reads
trust settings from `webStartup`. The LAN plugin still supplies its browser
bootstrap for trusted remote settings and insecure-origin UUID support.

## Plugins

The web profile manifest is `~/.dsh/profiles/web/package.json`; deployment
settings are in the adjacent `cordis.patch.yml`. Bundled upstream plugins
come from the checkout. The external sources are:

| Plugin | Source |
| --- | --- |
| `@local/dsh-drift-preset` | `/home/agent/drift-preset` |
| `@hytime/dsh-thinking-effort` | npm |
| `dsh-cost-meter` | `Han-1413141/dsh-cost-meter` on GitHub |
| `dsh-web-lan-access` | `AcidGr/dsh-web-lan-access` on GitHub; upstream includes our former fork's browser bootstrap change |
| `dsh-plugin-installer` | Toukaiteio's 0.2.0 archive in `~/.dsh/plugin-archives/dsh-plugin-installer` |
| `dsh-web-preview-panel` | npm |

`dsh-crew-messaging` (this repository's `plugins/crew-messaging`) is retired
and no longer installed or built (crew-services #10454). Crew messages reach DSH
sessions through `crew-dsh` from crew-services, which uses the `dsh web`
session API (`scripts/install-crew-dsh.sh` there). The plugin's
`/plugins/dsh-crew-messaging/reviewer-runtime` route, which crew-review's
optional `dsh` backend used, went with it; crew-review runs the `codex`
backend.

The **npm package named `dsh-plugin-installer` is a different project** from
Toukaiteio's installed marketplace. Check the original GitHub repository
when updating that plugin; do not replace it by matching its name on npm.
The `comparison-sdk` profile also has thinking-effort installed. Its obsolete
`backgroundMode` options and missing global Ralph override were removed.

The Drift preset uses current managed subagent activations. `subagent_review`
selects the dedicated `drift-reviewer` preset, which carries the reviewer persona
and omits filesystem write/edit and delegation tools. Shell use remains governed
by the read-only role instructions. `subagent_audit` keeps forked conversation
history; current DSH requires it to inherit the parent preset and tools, so the
lead supplies the read-only reviewer role in its task prompt. There is no
fork-specific tool filter. The lead instructions describe that distinction.

The old `backgroundMode`, per-tool `persona`, and `toolFilter` options have been
removed. Compaction uses upstream `dsh-compaction-basic`; the discarded checkout's
custom compaction code is not part of this installation.

## Updates and checks

`/home/agent/system/update-dsh.sh` selects the installed Node/Go toolchains
and calls this repository's `update.sh` with the canonical DSH checkout.
`/home/agent/system/update-plugins.sh` delegates to that same updater.
The updater also rebuilds and restarts the companion Crew services.

For a DSH-only source refresh, run `git pull --ff-only`, `pnpm install`, and
`pnpm run build` from the checkout using the installed Node 24 toolchain,
then rebuild affected local plugins and restart `dsh-web.service`.
Keep source clean; put deployment settings in profile patches and integration
behavior in plugins. Check plugin identity as well as its version.

The 2026-10-13 clean installation was built from upstream `d7432673`
(`0.2.1-alpha.2`). Thinking-effort was updated to 0.3.9 in both profiles,
cost meter to 1.8.24, and LAN access to 1.3.3. Preview panel 0.2.4 and the
original marketplace 0.2.0 were current. Crew host/client typechecks and all
87 plugin tests passed against the clean checkout. This is an update record,
not a version pin.

Before the switch, profiles, credentials, sessions, storage, presets, and the
old service/update scripts were backed up under
`~/.dsh/backups/2026-10-13-clean-upstream`. The old source checkout and runtime
worktree were removed after startup verification; no custom core patches were
carried forward. Existing unrelated edits in the plugin repository were preserved.

On 2026-10-17, the clean checkout fast-forwarded to upstream `687f282e86`
(`0.2.1-rc.2`) and `dsh-web.service` was rebuilt and restarted. All nine upstream
build checks, Crew host/client typechecks, and 87 Crew plugin tests passed.
The Drift migration follows upstream's
`docs/upgrade-guide/v0.2.1-alpha.1/subagent-preset-composition/guide.md`;
its previous YAML is backed up at
`~/.dsh/backups/2026-10-17-drift-migration/cordis.patch.yml`.
The live LAN browser check also passed: saved history, model selection, Crew
sessions, and activation of both Drift presets. No model prompt was submitted.
