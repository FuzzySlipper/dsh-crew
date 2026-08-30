#!/usr/bin/env bash

set -euo pipefail

service_name="${DSH_WEB_SERVICE:-dsh-web.service}"
public_url="${DSH_WEB_URL:-https://deepseek.dragonden.stream}"

token="$({
  journalctl --user -u "$service_name" --no-pager -o cat 2>/dev/null || true
} | sed -nE 's#.*[?&]token=([A-Za-z0-9._~-]+).*#\1#p' | tail -n 1)"

if [[ -z "$token" ]]; then
  printf 'No DSH web token found in %s logs.\n' "$service_name" >&2
  printf 'Restart it with: systemctl --user restart %s\n' "$service_name" >&2
  exit 1
fi

printf '%s/?token=%s\n' "${public_url%/}" "$token"
