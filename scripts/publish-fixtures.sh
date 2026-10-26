#!/usr/bin/env bash
set -euo pipefail
HARNESS="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG="$HARNESS/bench.config.json"
REPO="$(node -p "require('$CONFIG').fixturesRepo")"
REPO_URL="$(node -p "require('$CONFIG').fixturesRepoUrl")"
CLONE="$HARNESS/work/fixtures"
BASELINES="$HARNESS/fixtures/baselines.json"

gh repo view "$REPO" >/dev/null 2>&1 || gh repo create "$REPO" --public --description "Baseline fixtures for invoker-orchestration-benchmark (agents only ever see these branches)"
if [ ! -d "$CLONE/.git" ]; then
  mkdir -p "$(dirname "$CLONE")"
  git clone "$REPO_URL" "$CLONE" 2>/dev/null || { git init -q "$CLONE"; git -C "$CLONE" remote add origin "$REPO_URL"; }
fi
git -C "$CLONE" fetch -q origin '+refs/heads/*:refs/remotes/origin/*' 2>/dev/null || true

echo "{" > "$BASELINES.tmp"
first=1
for FIXTURE_ID in P1 P2 P3 P4; do
  NAME="$(node -p "require('$CONFIG').fixtures.$FIXTURE_ID.name")"
  BRANCH="$(node -p "require('$CONFIG').fixtures.$FIXTURE_ID.branch")"
  if git -C "$CLONE" rev-parse -q --verify "refs/remotes/origin/$BRANCH" >/dev/null; then
    echo "[publish] $BRANCH already exists; refusing to overwrite a published baseline"
    SHA="$(git -C "$CLONE" rev-parse "refs/remotes/origin/$BRANCH")"
  else
    STAGE="$(mktemp -d)"
    rsync -a --exclude node_modules --exclude '*.sqlite' --exclude '*.tsbuildinfo' "$HARNESS/fixtures/$NAME/" "$STAGE/"
    cp "$HARNESS/specs/$FIXTURE_ID-w1.md" "$STAGE/SPEC.md"
    cp "$HARNESS/fixtures/_shared/AGENTS.md" "$STAGE/AGENTS.md"
    git -C "$CLONE" checkout -q --orphan "$BRANCH"
    git -C "$CLONE" rm -rq --cached . 2>/dev/null || true
    find "$CLONE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
    rsync -a "$STAGE/" "$CLONE/"
    git -C "$CLONE" add -A
    git -C "$CLONE" -c user.name="bench-harness" -c user.email="bench-harness@users.noreply.github.com" commit -qm "Baseline $FIXTURE_ID ($NAME) for W1"
    git -C "$CLONE" push -q origin "$BRANCH"
    SHA="$(git -C "$CLONE" rev-parse HEAD)"
    rm -rf "$STAGE"
    echo "[publish] $BRANCH -> $SHA"
  fi
  [ $first -eq 1 ] || echo "," >> "$BASELINES.tmp"
  first=0
  printf '  "%s": { "branch": "%s", "sha": "%s" }' "$FIXTURE_ID" "$BRANCH" "$SHA" >> "$BASELINES.tmp"
done
printf '\n}\n' >> "$BASELINES.tmp"
mv "$BASELINES.tmp" "$BASELINES"
git -C "$CLONE" fetch -q origin '+refs/heads/*:refs/remotes/origin/*'
cat "$BASELINES"
