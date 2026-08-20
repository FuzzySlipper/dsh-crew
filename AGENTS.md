# AGENTS.md

This repository contains agent and plugin work for DeepSeek Harness (DSH). The current DSH checkout is at `research/deepseek-harness/` and is a separate nested Git repository. When working inside that checkout, read and follow its own `research/deepseek-harness/AGENTS.md`; the guidance here covers work in `dsh-crew` and use of the checkout as a live reference.

## DeepSeek Harness is a moving target

DSH is in rapid development. Work against the newest available checkout rather than treating the current checkout as a frozen dependency.

- Do not create version pins, exact-SHA acceptance gates, lock procedures, or elaborate freeze/update machinery for DSH.
- A commit, tag, or package version may be recorded when it helps explain an observation, but it is not a compatibility contract or a reason to block plugin work.
- Before work that depends on DSH, inspect the nested checkout and pull its current upstream state without discarding local changes:

  ```sh
  git -C research/deepseek-harness status --short --branch
  git -C research/deepseek-harness pull --ff-only
  ```

- After pulling, inspect changes that could affect our plugins and run focused compatibility checks or tests against the current checkout. Updating plugin code and tests to follow the moving DSH surface is part of normal work.
- Do not turn ordinary DSH movement, a changed commit, or a stale expected snapshot into a freeze requirement. Preserve useful change-impact checks, but keep them proportional to the plugin surface being used.

## Codebase Memory mapping

The repo-local Codex configuration in `.codex/config.toml` enables the Codebase Memory MCP server. Its cache is outside the repositories at `/home/agent/.local/share/codebase-memory-mcp`, so indexing does not add a committed artifact to either checkout.

Run a full refresh after pulling a newer DSH checkout:

```sh
CBM_CACHE_DIR=/home/agent/.local/share/codebase-memory-mcp \
  /home/agent/.local/bin/codebase-memory-mcp cli --json index_repository \
  --repo-path /home/dev/dsh-crew/research/deepseek-harness \
  --mode full \
  --name deepseek-harness
```

Confirm the cached project and coverage afterward:

```sh
CBM_CACHE_DIR=/home/agent/.local/share/codebase-memory-mcp \
  /home/agent/.local/bin/codebase-memory-mcp cli --json list_projects

CBM_CACHE_DIR=/home/agent/.local/share/codebase-memory-mcp \
  /home/agent/.local/bin/codebase-memory-mcp cli --json check_index_coverage \
  --project deepseek-harness \
  --scopes .
```

Use the mapper for navigation and relationship queries, then read the exact current source before making parser-sensitive or plugin-compatibility claims. Do not use `--persistence` for ordinary local mapping; the shared cache is the intended cache for this workspace.
