#!/usr/bin/env bash
# Creates soa-prefixed symlinks in .claude/skills/ for each son-of-anton agent skill.
# Also ensures tools symlink exists at the repo root (consumer repos only).
# The .agents symlink is created only when the consumer repo has no .agents path.
# Delivery hooks prefer .son-of-anton/.agents directly so existing repo-local skills
# with overlapping directory names cannot shadow Son-of-Anton helper scripts.
#
# Works in two modes:
#   source repo  — run from the son-of-anton repo itself (.agents/skills/ exists at root)
#   consumer repo — run from a repo that has done `git subtree add` (.son-of-anton/ exists)
#
# Naming convention:
#   The skill named "soa" is linked as "soa" (not "soa-soa") — it is the entry point.
#   All other skills are linked with the "soa-" prefix.
#
# Idempotent: removes stale soa-* symlinks before relinking so reruns don't leave ghosts.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SKILLS_DEST="$REPO_ROOT/.claude/skills"

if [ -d "$REPO_ROOT/.agents/skills" ] && [ ! -d "$REPO_ROOT/.son-of-anton" ]; then
  # Source repo: skills live at .agents/skills/ directly
  SKILLS_SRC="$REPO_ROOT/.agents/skills"
  LINK_TARGET_PREFIX="../../.agents/skills"
  IS_SOURCE_REPO=true
else
  # Consumer repo: skills live under .son-of-anton/
  SKILLS_SRC="$REPO_ROOT/.son-of-anton/.agents/skills"
  LINK_TARGET_PREFIX="../../.son-of-anton/.agents/skills"
  IS_SOURCE_REPO=false
fi

mkdir -p "$SKILLS_DEST"

# Remove stale soa-* symlinks/directories and the bare "soa" entry before relinking.
for stale in "$SKILLS_DEST"/soa-* "$SKILLS_DEST/soa"; do
  if [ -L "$stale" ]; then
    rm "$stale"
  elif [ -d "$stale" ]; then
    rm -rf "$stale"
  fi
done

for skill_dir in "$SKILLS_SRC"/*/; do
  name="$(basename "$skill_dir")"
  target="$LINK_TARGET_PREFIX/$name"

  # "soa" is the entry point — link as "soa", not "soa-soa"
  if [ "$name" = "soa" ]; then
    link="$SKILLS_DEST/soa"
  else
    link="$SKILLS_DEST/soa-$name"
  fi

  ln -sf "$target" "$link"
  echo "  linked: .claude/skills/$(basename "$link")"
done

# Ensure repo-root symlinks required by the delivery orchestrator exist (consumer only).
if [ "$IS_SOURCE_REPO" = false ]; then
  for pair in ".agents:.son-of-anton/.agents" "tools:.son-of-anton/tools"; do
    link_name="${pair%%:*}"
    target="${pair##*:}"
    link="$REPO_ROOT/$link_name"
    if [ ! -e "$link" ] && [ ! -L "$link" ]; then
      ln -s "$target" "$link"
      echo "  linked: $link_name -> $target"
    elif [ "$link_name" = ".agents" ]; then
      echo "  kept: .agents already exists; Son-of-Anton skills remain under .son-of-anton/.agents"
    fi
  done
fi

echo "sync-skills: done"
