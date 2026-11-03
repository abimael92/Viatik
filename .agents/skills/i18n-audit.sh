#!/usr/bin/env bash
# i18n checker — flags raw, unlocalized copy in JSX/TSX and confirms that every
# translation key exists in both `en` and `es`.
#
# Trigger: before closing any change that touches app/, components/, or features/.
# Read-only. Never edits files.
#
#   bash .agents/skills/i18n-audit.sh             # changed files vs HEAD (default)
#   bash .agents/skills/i18n-audit.sh --all       # every TSX file in the repo
#   bash .agents/skills/i18n-audit.sh --warn      # report, always exit 0
#   bash .agents/skills/i18n-audit.sh --no-tests  # skip the en/es parity suite
#
# Exit 0 = clean, 1 = raw copy or a missing translation key.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 2

SCOPE="changed"
MODE="fail"
RUN_TESTS=1
for arg in "$@"; do
  case "$arg" in
    --all) SCOPE="all" ;;
    --warn) MODE="warn" ;;
    --no-tests) RUN_TESTS=0 ;;
    -h | --help)
      sed -n '2,14p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown argument: $arg (try --help)" >&2
      exit 2
      ;;
  esac
done

collect_files() {
  if [ "$SCOPE" = "all" ]; then
    find app components features -type f -name '*.tsx' 2>/dev/null
  else
    {
      git diff --name-only HEAD -- app components features 2>/dev/null
      git diff --cached --name-only -- app components features 2>/dev/null
      git ls-files --others --exclude-standard -- app components features 2>/dev/null
    } | sort -u
  fi
}

# One awk pass per file: it strips comments (so commented-out JSX does not
# report), then looks for literal copy in user-facing attributes and JSX text.
read -r -d '' SCAN <<'AWK'
BEGIN { inblock = 0 }
{
  rest = $0; out = ""
  while (length(rest) > 0) {
    if (inblock) {
      i = index(rest, "*/")
      if (i == 0) { rest = ""; break }
      rest = substr(rest, i + 2); inblock = 0
    } else {
      i = index(rest, "{/*"); j = index(rest, "/*")
      if (i == 0 && j == 0) { out = out rest; break }
      if (i > 0 && (j == 0 || i <= j)) {
        out = out substr(rest, 1, i - 1); rest = substr(rest, i + 3); inblock = 1
      } else {
        out = out substr(rest, 1, j - 1); rest = substr(rest, j + 2); inblock = 1
      }
    }
  }
  # A `//` note is a comment only when it is not inside a URL.
  k = match(out, /(^|[ \t])\/\//)
  if (k > 0) out = substr(out, 1, k)

  attrs = "placeholder|title|alt|aria-label|aria-description|aria-placeholder|label"
  if (match(out, "(" attrs ")=\"[^\"]*[A-Za-z][^\"]*\"")) {
    hit = substr(out, RSTART, RLENGTH)
    sub("^(" attrs ")=\"", "", hit); sub("\"$", "", hit)
    # Brand names, locale codes, unit suffixes and URLs are not copy.
    if (hit !~ /^(Viatik\.?|ESC|US|EN|ES|MB\)?|OK|[A-Z]{2,3}|https?:\/\/.*)$/) {
      printf "  RAW ATTR  %s:%d:%s\n", FILENAME, FNR, $0
    }
  }

  # JSX text: two or more words between a tag close and the next tag.
  if (match(out, />[ ]*[A-Za-z][A-Za-z0-9 ,.!?&%:;'’-]*[ ][A-Za-z][A-Za-z0-9 ,.!?&%:;'’-]*</)) {
    hit = substr(out, RSTART, RLENGTH)
    sub("^>[ ]*", "", hit); sub("<$", "", hit)
    if (hit !~ /^(Viatik\.?|ESC|US|https?:\/\/.*)$/ && length(hit) > 3) {
      printf "  RAW TEXT  %s:%d:%s\n", FILENAME, FNR, $0
    }
  }
}
AWK

files="$(collect_files | grep -E '\.tsx$' | grep -vE '(__tests__|\.(test|spec)\.tsx$|^app/e2e/)' || true)"
count=$(printf '%s\n' "$files" | grep -c . || true)

echo "· i18n audit — scope: $SCOPE, $count TSX file(s)"

hits=0
if [ "$count" -eq 0 ]; then
  echo "· no changed TSX files; nothing to scan (use --all for a full sweep)"
else
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ -f "$file" ] || continue
    found="$(awk "$SCAN" "$file")"
    if [ -n "$found" ]; then
      echo "$found"
      hits=$((hits + $(printf '%s\n' "$found" | grep -c .)))
    fi
  done <<< "$files"
fi

# en/es parity + every key used by t() exists. The Vitest suite parses the copy
# files with the TypeScript AST, which a shell regex cannot do reliably.
if [ "$RUN_TESTS" -eq 1 ]; then
  echo "· running lib/i18n/i18n-coverage.test.ts (en/es parity + usage)"
  if pnpm exec vitest run lib/i18n/i18n-coverage.test.ts --silent >/tmp/viatik-i18n-audit.log 2>&1; then
    echo "  ok    translation coverage"
  else
    echo "  FAIL  translation coverage"
    tail -30 /tmp/viatik-i18n-audit.log | sed 's/^/    /'
    hits=$((hits + 1))
  fi
fi

if [ "$hits" -eq 0 ]; then
  echo "✔ i18n audit clean"
  exit 0
fi

echo "✖ i18n audit: $hits finding(s)"
echo "  Move copy into lib/i18n/frontend-copy.ts (en + es) and read it with t(\"key\")."
if [ "$MODE" = "warn" ]; then
  echo "  (--warn) not failing the run"
  exit 0
fi
exit 1
