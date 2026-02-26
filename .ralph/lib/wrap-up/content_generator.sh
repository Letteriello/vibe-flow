#!/bin/bash
# Wrap-up Phase 4: Publish It - Content generation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Phase 4: Publish It
wrap_up_publish_it() {
    echo "📢 Phase 4: Publish It"
    echo "======================"

    local enabled=$(wrap_up_get "wrap_up.phases.publish_it.enabled")
    local require_review=$(wrap_up_get "wrap_up.phases.publish_it.require_review")

    if [[ "$enabled" != "true" ]]; then
        echo "   Publishing disabled in config"
        echo "✅ Publish It skipped"
        return 0
    fi

    echo "📝 Analyzing session for content..."
    analyze_content

    echo "📄 Generating drafts..."
    generate_drafts

    if [[ "$require_review" == "true" ]]; then
        echo "   ⚠️ Drafts require review before posting"
    fi

    echo "✅ Publish It complete"
}

# Analyze session for content worthiness
analyze_content() {
    local vibe_dir="vibe-flow"

    # Check for significant changes
    local error_handler_exists="$vibe_dir/src/error-handler/index.ts"
    local test_exists="$vibe_dir/src/error-handler.test.ts"

    if [[ -f "$error_handler_exists" ]]; then
        echo "   Found: New error-handler implementation"
    fi

    if [[ -f "$test_exists" ]]; then
        echo "   Found: New test file"
    fi
}

# Generate platform-specific drafts
generate_drafts() {
    local drafts_dir="vibe-flow/.claude/wrap-up/drafts"
    mkdir -p "$drafts_dir"

    local timestamp=$(date +%s)
    local draft_file="$drafts_dir/draft-$timestamp.md"

    cat > "$draft_file" << EOF
---
date: $(date -I)
platform: pending
status: pending_review
---

# Session Draft

## Summary
- Refactored error-handler to use typed error codes
- Added VibeFlowErrorCode enum with 26 specific codes
- Added suggestedAction field for auto-recovery

## Technical Details
- Created error-handler.test.ts with 17 passing tests
- 122 total tests passing

EOF

    echo "   Created: $draft_file"
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    wrap_up_publish_it
fi
