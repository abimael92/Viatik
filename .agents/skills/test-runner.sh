#!/usr/bin/env bash
# Smart test runner — runs the Vitest suites that actually cover a diff.
#
# Trigger: after any code change, before closing a turn (step 1 of
# `.agents/skills/session-close.md`). Read-only apart from the coverage baseline
# when `--update-baseline` is passed.
#
#   bash .agents/skills/test-runner.sh                 # affected suites
#   bash .agents/skills/test-runner.sh --dry-run       # print the plan only
#   bash .agents/skills/test-runner.sh --full          # whole suite
#   bash .agents/skills/test-runner.sh --full --coverage
#   bash .agents/skills/test-runner.sh --full --coverage --update-baseline
#   bash .agents/skills/test-runner.sh --health            # + ingest .ai/infra/test-health.json
#
# Exit 0 = green (or nothing to run), 1 = failures / coverage regression /
# focused test found. Works on the bash 3.2 that ships with macOS: no arrays,
# no `mapfile`.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 2

BASELINE=".agents/skills/coverage-baseline.json"
DRY_RUN=0
FULL=0
COVERAGE=0
UPDATE_BASELINE=0
HEALTH=0
BASE="HEAD"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --full) FULL=1 ;;
    --coverage) COVERAGE=1 ;;
    --health) HEALTH=1 ;;
    --update-baseline) UPDATE_BASELINE=1; COVERAGE=1; FULL=1 ;;
    --base)
      shift
      BASE="${1:-HEAD}"
      ;;
    -h | --help)
      sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $1 (try --help)" >&2
      exit 2
      ;;
  esac
  shift
done

changed="$( {
  git diff --name-only "$BASE" 2>/dev/null
  git diff --cached --name-only 2>/dev/null
  git ls-files --others --exclude-standard 2>/dev/null
} | sort -u | grep -vE '^(node_modules|\.next|\.worktrees|coverage)/' || true)"

if [ -z "$changed" ]; then
  echo "· no changes vs $BASE — nothing to run"
  exit 0
fi

echo "· changed files vs $BASE: $(printf '%s\n' "$changed" | grep -c .)"

# ---- disabled tests -----------------------------------------------------------
disabled=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    *.test.ts | *.test.tsx | *.spec.ts | *.spec.tsx) ;;
    *) continue ;;
  esac
  [ -f "$file" ] || continue
  focus="$(grep -nE '\.only\(' "$file" || true)"
  if [ -n "$focus" ]; then
    echo "  ✖ FOCUSED TEST (silently skips the rest of the suite)"
    printf '%s\n' "$focus" | sed "s|^|    $file:|"
    disabled=$((disabled + 1))
  fi
  skipped="$(grep -nE '\.(skip|todo)\(' "$file" || true)"
  if [ -n "$skipped" ]; then
    echo "  ! skipped/todo tests in $file (allowed only with a linked reason)"
    printf '%s\n' "$skipped" | sed 's/^/    /'
  fi
done <<< "$changed"

# ---- affected suites ----------------------------------------------------------
SUITES="$(mktemp -t viatik-suites)"
trap 'rm -f "$SUITES"' EXIT

add_suite() {
  find . -path ./node_modules -prune -o -path ./.next -prune -o \
    -path ./.worktrees -prune -o -path ./coverage -prune -o \
    -type f \( -name '*.test.ts' -o -name '*.test.tsx' \) -print 2>/dev/null |
    sed 's|^\./||' | grep -E "$1" >> "$SUITES" || true
}

unmapped=0
while IFS= read -r file; do
  [ -z "$file" ] && continue
  case "$file" in
    # Repository plumbing that cannot break a suite.
    .github/* | .husky/* | .gitignore | mcp.json | skills-lock.json) continue ;;
    # AI-infrastructure scripts carry their own Vitest suites.
    .ai/infra/scripts/*) add_suite '^\.ai/infra/scripts/.*\.test\.mjs$' ;;
    # Documentation and agent metadata cannot break behavior.
    *.md | .ai/* | .agents/* | memory/*) continue ;;
    lib/db/*) add_suite '^lib/db/.*\.test\.ts$' ;;
    lib/sync/*) add_suite '^lib/sync/.*\.test\.ts$' ;;
    lib/i18n/*) add_suite '^lib/i18n/.*\.test\.tsx?$' ;;
    lib/supabase/*) add_suite '^lib/supabase/.*\.test\.ts$' ;;
    lib/*) add_suite "^${file%.*}\.test\.tsx?$"; add_suite "^lib/[^/]+/.*\.test\.ts$" ;;
    supabase/*) add_suite '^supabase/.*\.test\.ts$' ;;
    app/*) add_suite "^${file%.*}\.test\.tsx?$"; add_suite "^${file%%/*}/.*\.test\.tsx?$" ;;
    components/*) add_suite "^${file%.*}\.test\.tsx?$"; add_suite "^${file%/*}/.*\.test\.tsx?$" ;;
    features/*/*)
      area="$(printf '%s' "${file#features/}" | cut -d/ -f1)"
      add_suite "^${file%.*}\.test\.tsx?$"
      add_suite "^features/${area}/.*\.test\.tsx?$"
      ;;
    *) unmapped=$((unmapped + 1)) ;;
  esac
done <<< "$changed"

if [ "$unmapped" -gt 0 ]; then
  echo "· $unmapped changed file(s) have no suite mapping — falling back to the full suite"
  FULL=1
fi

HEALTH_ARGS=""
[ "$HEALTH" -eq 1 ] && HEALTH_ARGS="--reporter=json --outputFile=.ai/infra/.test-report.json"

if [ "$FULL" -eq 1 ]; then
  echo "· plan: full suite (pnpm test)"
  [ "$DRY_RUN" -eq 1 ] && exit 0
  if [ "$COVERAGE" -eq 1 ]; then
    echo "· running: pnpm exec vitest run --coverage"
    pnpm exec vitest run --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=coverage $HEALTH_ARGS
  elif [ "$HEALTH" -eq 1 ]; then
    echo "· running: pnpm exec vitest run --reporter=json"
    pnpm exec vitest run $HEALTH_ARGS
  else
    echo "· running: pnpm test"
    pnpm test
  fi
  status=$?
else
  sort -u -o "$SUITES" "$SUITES"
  suite_count="$(grep -c . "$SUITES" || true)"
  if [ "$suite_count" -eq 0 ]; then
    echo "· no affected suites (docs/config only) — nothing to run"
    exit 0
  fi
  echo "· plan: $suite_count affected suite(s)"
  sed 's/^/    /' "$SUITES"
  [ "$DRY_RUN" -eq 1 ] && exit 0
  echo "· running: pnpm exec vitest run <$suite_count files>"
  xargs pnpm exec vitest run $HEALTH_ARGS < "$SUITES"
  status=$?
fi

# ---- test-health ledger (opt-in) ---------------------------------------------
if [ "$HEALTH" -eq 1 ] && [ -f .ai/infra/.test-report.json ]; then
  echo "· ingesting test-health report"
  node .ai/infra/scripts/test-health.mjs ingest .ai/infra/.test-report.json || true
fi

# ---- coverage gate ------------------------------------------------------------
if [ "$COVERAGE" -eq 1 ] && [ -f coverage/coverage-summary.json ]; then
  current="$(node -e 'const s=require("./coverage/coverage-summary.json");console.log(s.total.lines.pct)')"
  echo "· line coverage: ${current}%"
  if [ "$UPDATE_BASELINE" -eq 1 ]; then
    printf '{\n  "lines": %s,\n  "updatedAt": "%s"\n}\n' \
      "$current" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$BASELINE"
    echo "· baseline written to $BASELINE (commit it)"
  elif [ -f "$BASELINE" ]; then
    previous="$(node -e "console.log(require('./$BASELINE').lines)")"
    if node -e "process.exit(Number('$current') < Number('$previous') ? 1 : 0)"; then
      echo "· coverage held (baseline ${previous}%)"
    else
      echo "✖ coverage regressed: ${previous}% → ${current}%"
      status=1
    fi
  else
    echo "! no $BASELINE yet — coverage is reported but not gated"
    echo "  create it once with: bash .agents/skills/test-runner.sh --full --coverage --update-baseline"
  fi
fi

if [ "$disabled" -gt 0 ]; then
  echo "✖ focused test(s) found — remove .only before committing"
  status=1
fi

[ "$status" -eq 0 ] && echo "✔ affected suites green"
exit "$status"
