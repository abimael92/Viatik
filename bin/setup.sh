#!/usr/bin/env bash
#
# One-command local environment setup for Viatik.
#
# Bootstraps the entire offline-first stack (deps + local Supabase) so a new
# collaborator can be up and running in under three minutes.
#
#   pnpm run setup
#
# Idempotent: re-running is safe (existing .env.local is never overwritten).
#
set -euo pipefail

# ──────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────

# Where generated Supabase types live. `supabase gen types` prints to stdout,
# so we redirect it here. Keep in sync with any imports of these types.
TYPES_FILE="lib/supabase/database.types.ts"

# ──────────────────────────────────────────────────────────────────────────
# Terminal formatting
# ──────────────────────────────────────────────────────────────────────────
NC='\033[0m'       # No Color / reset
BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'

log()       { echo -e "${CYAN}${BOLD}==>${NC} $*"; }
info()      { echo -e "${GREEN}${BOLD}==>${NC} $*"; }
warn()      { echo -e "${YELLOW}${BOLD}==>${NC} $*"; }
die()       { echo -e "${RED}${BOLD}ERROR:${NC} $*" >&2; exit 1; }
ok()        { echo -e "${GREEN}${BOLD}✔${NC} $*"; }

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "Required tool '${BOLD}${cmd}${NC}' was not found on your PATH.\n" \
        "    Install it and re-run this script. See README.md → Getting Started."
  fi
}

# ──────────────────────────────────────────────────────────────────────────
# 0. Resolve project root (works from any cwd via pnpm run setup)
# ──────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BOLD}──────────────────────────────────────────────${NC}"
echo -e "${BOLD}  Viatik — Local Environment Setup${NC}"
echo -e "${DIM}  Root: ${PROJECT_ROOT}${NC}"
echo -e "${BOLD}──────────────────────────────────────────────${NC}"

# ──────────────────────────────────────────────────────────────────────────
# 1. Verify prerequisites
# ──────────────────────────────────────────────────────────────────────────
log "Checking prerequisites..."

require_cmd "pnpm"
require_cmd "docker"

# Verify the Docker daemon is actually running (not just installed).
if ! docker info >/dev/null 2>&1; then
  die "Docker is installed but ${BOLD}not running${NC}.\n" \
      "    Local Supabase needs the Docker daemon.\n" \
      "    macOS:  open Docker Desktop, then re-run this script.\n" \
      "    Linux:  sudo systemctl start docker"
fi

# npx is bundled with Node; just make sure node itself is present (pnpm needs it).
if ! command -v node >/dev/null 2>&1; then
  die "Node.js was not found on your PATH. Install Node.js 20+ and re-run."
fi

ok "pnpm $(pnpm --version 2>/dev/null || echo '?')"
ok "Docker $(docker --version 2>/dev/null | sed 's/Docker version //')"

# ──────────────────────────────────────────────────────────────────────────
# 2. Install dependencies
# ──────────────────────────────────────────────────────────────────────────
info "📦 Installing dependencies..."
pnpm install
ok "Dependencies installed"

# ──────────────────────────────────────────────────────────────────────────
# 3. Create .env.local (only if missing — never overwrite)
# ──────────────────────────────────────────────────────────────────────────
# If a committed encrypted environment exists, unlock it with the team password
# first; otherwise fall back to copying the blank example. This happens before
# the local database is started so the app boots with the correct credentials.
info "🔐 Configuring local environment..."
if [[ -f .env.local ]]; then
  warn "'.env.local' already exists — leaving it untouched."
elif [[ -f .env.encrypted ]]; then
  ok "Found committed encrypted environment — unlocking it with the team password."
  pnpm run secrets:unlock
else
  if [[ ! -f .env.example ]]; then
    die "'.env.example' not found. Are you in the repository root?"
  fi
  cp .env.example .env.local
  ok "Created '.env.local' from '.env.example'."
  echo -e "${DIM}    Tip: after 'supabase start' prints local credentials, set the" >&2
  echo -e "${DIM}    NEXT_PUBLIC_SUPABASE_URL / *_ANON_KEY values in .env.local.${NC}"
fi

# ──────────────────────────────────────────────────────────────────────────
# 4. Start local Supabase (Docker-backed; applies all SQL migrations)
# ──────────────────────────────────────────────────────────────────────────
info "🐳 Starting local Supabase..."
warn "First run pulls Docker images and may take a few minutes."

# `supabase start` spins up local DB, Studio, Auth, Storage, Realtime and
# applies the ordered migrations from supabase/migrations/.
npx supabase start
ok "Local Supabase is running"

# ──────────────────────────────────────────────────────────────────────────
# 5. Generate latest TypeScript definitions from the local instance
# ──────────────────────────────────────────────────────────────────────────
info "🧬 Generating TypeScript definitions from local Supabase..."
mkdir -p "$(dirname "$TYPES_FILE")"
npx supabase gen types typescript --local > "$TYPES_FILE"
ok "Generated types → ${BOLD}$TYPES_FILE${NC}"

# ──────────────────────────────────────────────────────────────────────────
# 6. Done
# ──────────────────────────────────────────────────────────────────────────
echo
info "🎉 Setup complete!"
echo -e "${BOLD}Start the dev server:${NC}  pnpm dev"
echo -e "${BOLD}Supabase Studio:${NC}     http://localhost:54323 (default)"
echo -e "${DIM}Check 'supabase start' output above for your exact local URLs/keys.${NC}"
