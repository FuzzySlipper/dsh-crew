#!/usr/bin/env bash

set -euo pipefail

service_name="${DSH_WEB_SERVICE:-dsh-web.service}"
url_file="${DSH_WEB_URL_FILE:-$HOME/.config/dsh/web-url}"

if [[ -n "${DSH_WEB_URL:-}" ]]; then
  public_url="$DSH_WEB_URL"
elif [[ -r "$url_file" ]]; then
  IFS= read -r public_url < "$url_file"
else
  lan_address="$(hostname -I 2>/dev/null | awk '{ print $1 }')"
  if [[ -z "$lan_address" ]]; then
    printf 'Cannot determine a LAN address; set DSH_WEB_URL or create %s.\n' "$url_file" >&2
    exit 1
  fi
  public_url="http://$lan_address:${DSH_WEB_PORT:-3080}"
fi

if [[ -z "$public_url" ]]; then
  printf 'DSH web URL is empty in %s.\n' "$url_file" >&2
  exit 1
fi

token="$({
  journalctl --user -u "$service_name" --no-pager -o cat 2>/dev/null || true
} | sed -nE 's#.*[?&]token=([A-Za-z0-9._~-]+).*#\1#p' | tail -n 1)"

if [[ -z "$token" ]]; then
  printf 'No DSH web token found in %s logs.\n' "$service_name" >&2
  printf 'Restart it with: systemctl --user restart %s\n' "$service_name" >&2
  exit 1
fi

printf '%s/?token=%s\n' "${public_url%/}" "$token"
