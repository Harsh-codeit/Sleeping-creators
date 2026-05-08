#!/usr/bin/env bash
# =============================================================================
# Sleeping Creators — Claude Skills Setup
# Run this once on a new machine to install all Claude Code plugins/skills.
# Usage: bash setup-claude-skills.sh
# =============================================================================

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${CYAN}[setup]${NC} $*"; }
ok()   { echo -e "${GREEN}[ok]${NC}    $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail() { echo -e "${RED}[fail]${NC}  $*"; exit 1; }

# -----------------------------------------------------------------------------
# 1. Prerequisites
# -----------------------------------------------------------------------------
log "Checking prerequisites..."
command -v claude >/dev/null 2>&1 || fail "Claude Code CLI not found. Install from https://claude.ai/code"
command -v git    >/dev/null 2>&1 || fail "git not found. Install git first."
ok "Claude Code $(claude --version) found"

SKILLS_DIR="$(pwd)/.claude/skills"
mkdir -p "$SKILLS_DIR"

# -----------------------------------------------------------------------------
# Helper: clone or update a GitHub repo into .claude/skills
# Usage: install_skill_repo <github-user/repo> <dest-subdir-name> [branch]
# -----------------------------------------------------------------------------
install_skill_repo() {
    local repo="$1"
    local dest="$2"
    local branch="${3:-main}"
    local target="$SKILLS_DIR/$dest"

    if [ -d "$target/.git" ]; then
        log "Updating $dest ..."
        git -C "$target" pull --ff-only --quiet
        ok "$dest updated"
    else
        log "Installing $dest from github.com/$repo ..."
        git clone --depth 1 --branch "$branch" "https://github.com/$repo.git" "$target" --quiet
        ok "$dest installed"
    fi
}

# -----------------------------------------------------------------------------
# Helper: install via claude plugin install (for official marketplace plugins)
# -----------------------------------------------------------------------------
install_plugin() {
    local plugin="$1"
    log "Installing Claude plugin: $plugin ..."
    if claude plugin install "$plugin" --scope project 2>/dev/null; then
        ok "$plugin installed"
    else
        warn "$plugin — already installed or not in marketplace, skipping"
    fi
}

# -----------------------------------------------------------------------------
# 2. Superpowers — agentic dev workflow skills
#    Source: https://github.com/obra/superpowers
#    Skills: brainstorming, writing-plans, executing-plans, test-driven-development,
#            systematic-debugging, requesting-code-review, receiving-code-review,
#            subagent-driven-development, using-git-worktrees,
#            finishing-a-development-branch, verification-before-completion,
#            dispatching-parallel-agents, using-superpowers
# -----------------------------------------------------------------------------
log "=== Superpowers ==="
install_skill_repo "obra/superpowers" "_superpowers_src"

# Copy individual skill directories from the cloned repo
SUPERPOWERS_SRC="$SKILLS_DIR/_superpowers_src/skills"
if [ -d "$SUPERPOWERS_SRC" ]; then
    for skill_dir in "$SUPERPOWERS_SRC"/*/; do
        skill_name="$(basename "$skill_dir")"
        if [ ! -d "$SKILLS_DIR/$skill_name" ]; then
            cp -r "$skill_dir" "$SKILLS_DIR/$skill_name"
            ok "  + $skill_name"
        fi
    done

    # Also install the SessionStart hook
    HOOK_SRC="$SKILLS_DIR/_superpowers_src/.claude/hooks/session-start"
    HOOK_DST="$(pwd)/.claude/hooks/session-start"
    if [ -f "$HOOK_SRC" ] && [ ! -f "$HOOK_DST" ]; then
        mkdir -p "$(pwd)/.claude/hooks"
        cp "$HOOK_SRC" "$HOOK_DST"
        chmod +x "$HOOK_DST"
        ok "  + session-start hook"
    fi

    # Install commands (brainstorm, write-plan, execute-plan)
    CMDS_SRC="$SKILLS_DIR/_superpowers_src/.claude/commands"
    CMDS_DST="$(pwd)/.claude/commands"
    if [ -d "$CMDS_SRC" ]; then
        mkdir -p "$CMDS_DST"
        for cmd in "$CMDS_SRC"/*.md; do
            cmd_name="$(basename "$cmd")"
            [ ! -f "$CMDS_DST/$cmd_name" ] && cp "$cmd" "$CMDS_DST/$cmd_name" && ok "  + /$(basename "$cmd" .md) command"
        done
    fi
fi

# Write SessionStart hook into settings.json if missing
SETTINGS="$(pwd)/.claude/settings.json"
if [ -f "$SETTINGS" ]; then
    if ! grep -q "session-start" "$SETTINGS" 2>/dev/null; then
        warn "settings.json exists but lacks SessionStart hook — add manually:"
        echo '  "hooks": { "SessionStart": [{ "matcher": "", "hooks": [{ "type": "command", "command": "bash \"$(pwd)/.claude/hooks/session-start\"", "timeout": 30 }] }] }'
    fi
else
    mkdir -p "$(pwd)/.claude"
    cat > "$SETTINGS" <<'JSON'
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$(pwd)/.claude/hooks/session-start\"",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
JSON
    ok "settings.json created with SessionStart hook"
fi

# -----------------------------------------------------------------------------
# 3. UI/UX Pro Max — design intelligence database
#    Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
#    Skills: ui-ux-pro-max, ui-styling, design-system, design, brand,
#            banner-design, slides
#    Data:   src/ui-ux-pro-max/data/ (160 palettes, 73 font pairings, 84 styles)
# -----------------------------------------------------------------------------
log "=== UI/UX Pro Max ==="
UIUX_SRC="$SKILLS_DIR/_uiuxpromax_src"
install_skill_repo "nextlevelbuilder/ui-ux-pro-max-skill" "_uiuxpromax_src"

if [ -d "$UIUX_SRC/skills" ]; then
    for skill_dir in "$UIUX_SRC/skills"/*/; do
        skill_name="$(basename "$skill_dir")"
        [ ! -d "$SKILLS_DIR/$skill_name" ] && cp -r "$skill_dir" "$SKILLS_DIR/$skill_name" && ok "  + $skill_name"
    done
fi

# Copy the data + scripts into src/ui-ux-pro-max (used by carousel_design_engine.py)
UIUX_DATA_DST="$(pwd)/src/ui-ux-pro-max"
if [ -d "$UIUX_SRC/data" ] && [ ! -d "$UIUX_DATA_DST/data" ]; then
    mkdir -p "$UIUX_DATA_DST"
    cp -r "$UIUX_SRC/data"    "$UIUX_DATA_DST/data"
    cp -r "$UIUX_SRC/scripts" "$UIUX_DATA_DST/scripts" 2>/dev/null || true
    ok "UI/UX Pro Max data copied to src/ui-ux-pro-max/"
elif [ -d "$UIUX_DATA_DST/data" ]; then
    ok "src/ui-ux-pro-max/data already present"
fi

# -----------------------------------------------------------------------------
# 4. Claude-Mem — persistent cross-session memory
#    Source: https://github.com/thedotmack/claude-mem
#    Skills: mem-search, smart-explore, timeline-report, do, make-plan
# -----------------------------------------------------------------------------
log "=== Claude-Mem ==="
CLAUDEMEM_SRC="$SKILLS_DIR/_claudemem_src"
install_skill_repo "thedotmack/claude-mem" "_claudemem_src"

if [ -d "$CLAUDEMEM_SRC/skills" ]; then
    for skill_dir in "$CLAUDEMEM_SRC/skills"/*/; do
        skill_name="$(basename "$skill_dir")"
        [ ! -d "$SKILLS_DIR/$skill_name" ] && cp -r "$skill_dir" "$SKILLS_DIR/$skill_name" && ok "  + $skill_name"
    done
fi

# Init memory directory
MEMORY_DIR="$(pwd)/.claude/memory"
if [ ! -d "$MEMORY_DIR" ]; then
    mkdir -p "$MEMORY_DIR"
    touch "$MEMORY_DIR/MEMORY.md"
    ok "Memory directory initialised at .claude/memory/"
fi

# -----------------------------------------------------------------------------
# 5. Final summary
# -----------------------------------------------------------------------------
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  Claude skills setup complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Installed skill sets:"
echo "  • Superpowers       — brainstorming, writing-plans, executing-plans,"
echo "                        TDD, debugging, code-review, git-worktrees..."
echo "  • UI/UX Pro Max     — 160 palettes, 73 font pairings, 84 styles,"
echo "                        design, brand, banner-design, slides..."
echo "  • Claude-Mem        — persistent memory, make-plan, smart-explore..."
echo ""
echo "Skills directory: .claude/skills/"
echo "Data directory:   src/ui-ux-pro-max/"
echo ""
echo "Start a new Claude Code session to activate the SessionStart hook."
