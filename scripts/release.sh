#!/usr/bin/env bash
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but not installed."
  exit 1
fi

if [[ -z "$(git rev-parse --is-inside-work-tree 2>/dev/null || true)" ]]; then
  echo "Run this inside a git repository."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
MESSAGE="${1:-chore: release $(date +%Y-%m-%d_%H-%M)}"

echo "[1/4] Building project..."
npm run build

echo "[2/4] Staging changes..."
git add -A

if git diff --cached --quiet; then
  echo "No staged changes to commit."
  exit 0
fi

echo "[3/4] Committing..."
git commit -m "$MESSAGE"

echo "[4/4] Pushing to origin/$BRANCH..."
git push -u origin "$BRANCH"

echo "Release complete."
