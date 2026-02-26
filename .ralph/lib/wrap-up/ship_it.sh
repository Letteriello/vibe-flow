#!/bin/bash
# Wrap-up Phase 1: Ship It - Git operations and file organization

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Phase 1: Ship It
wrap_up_ship_it() {
    echo "📦 Phase 1: Ship It"
    echo "===================="

    local auto_commit=$(wrap_up_get "wrap_up.phases.ship_it.auto_commit")
    local auto_push=$(wrap_up_get "wrap_up.phases.ship_it.auto_push")

    # Git status
    echo "🔍 Checking git status..."
    git status --short

    local modified=$(git status --short | grep -E "^( M|M |A |D )" | wc -l)

    if [[ "$modified" -eq 0 ]]; then
        echo "✅ No changes to commit"
        return 0
    fi

    echo "📝 $modified file(s) changed"

    # Generate commit message from session notes
    local commit_msg
    commit_msg=$(generate_commit_message)

    if [[ "$auto_commit" == "true" ]]; then
        echo "📤 Auto-committing..."
        git add -A
        git commit -m "$commit_msg"
        echo "✅ Committed: $(git rev-parse --short HEAD)"
    fi

    if [[ "$auto_push" == "true" ]]; then
        echo "🚀 Pushing to remote..."
        git push
    fi

    echo "✅ Ship It complete"
}

# Generate commit message from session context
generate_commit_message() {
    local claude_md="vibe-flow/CLAUDE.md"

    if [[ -f "$claude_md" ]]; then
        # Get last session notes
        local last_notes=$(grep -A5 "## Session Notes" "$claude_md" | tail -10)
        if echo "$last_notes" | grep -qi "refactor\|fix\|implement"; then
            echo "$(echo "$last_notes" | head -1)"
            return
        fi
    fi

    # Default message
    echo "chore: session updates"
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    wrap_up_ship_it
fi
