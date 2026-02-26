#!/bin/bash
# Wrap-up Phase 2: Remember It - Memory hierarchy routing

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Memory hierarchy locations
CLAUDE_MD="vibe-flow/CLAUDE.md"
CLAUDE_LOCAL="vibe-flow/CLAUDE.local.md"
RULES_DIR="vibe-flow/.claude/rules"

# Phase 2: Remember It
wrap_up_remember_it() {
    echo "🧠 Phase 2: Remember It"
    echo "======================"

    local consolidate=$(wrap_up_get "wrap_up.phases.remember_it.consolidate_claude_md")
    local update_rules=$(wrap_up_get "wrap_up.phases.remember_it.update_rules")

    if [[ "$consolidate" == "true" ]]; then
        echo "📝 Updating CLAUDE.md..."
        update_claude_md
    fi

    if [[ "$update_rules" == "true" ]]; then
        echo "📁 Checking rules directory..."
        check_rules_dir
    fi

    echo "✅ Remember It complete"
}

# Update CLAUDE.md with session notes
update_claude_md() {
    local today=$(date +%Y-%m-%d)

    if [[ ! -f "$CLAUDE_MD" ]]; then
        echo "⚠️ CLAUDE.md not found"
        return 1
    fi

    # Check if session notes section exists
    if grep -q "## Session Notes" "$CLAUDE_MD"; then
        echo "   Session notes section exists"
    else
        echo "   Adding session notes section..."
        echo -e "\n## Session Notes\n- Session wrap-up executed" >> "$CLAUDE_MD"
    fi
}

# Check rules directory
check_rules_dir() {
    if [[ ! -d "$RULES_DIR" ]]; then
        echo "   Creating rules directory..."
        mkdir -p "$RULES_DIR"
    fi

    local rule_count=$(find "$RULES_DIR" -name "*.md" 2>/dev/null | wc -l)
    echo "   Found $rule_count rule file(s)"
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    wrap_up_remember_it
fi
