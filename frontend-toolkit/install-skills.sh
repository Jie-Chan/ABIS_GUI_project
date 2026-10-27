#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
skill_dest="${1:-$HOME/.agents/skills}"
for skill in frontend-design theme-factory webapp-testing; do
  if [[ -e "$skill_dest/$skill" ]]; then
    printf 'Destination exists, nothing copied: %s\n' "$skill_dest/$skill" >&2
    exit 1
  fi
done
mkdir -p "$skill_dest"
for skill in frontend-design theme-factory webapp-testing; do
  cp -a -- "$script_dir/skills/$skill" "$skill_dest/$skill"
  printf 'Copied %s\n' "$skill_dest/$skill"
done
