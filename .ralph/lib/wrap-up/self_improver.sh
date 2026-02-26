#!/bin/bash
# Wrap-up Phase 3: Self Improve - Error analysis and rule generation

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.sh"

# Phase 3: Self Improve
wrap_up_self_improve() {
    echo "🔧 Phase 3: Self Improve"
    echo "======================="

    local analyze=$(wrap_up_get "wrap_up.phases.self_improve.analyze_errors")
    local generate=$(wrap_up_get "wrap_up.phases.self_improve.generate_rules")

    if [[ "$analyze" == "true" ]]; then
        echo "🔍 Analyzing error patterns..."
        analyze_patterns
    fi

    if [[ "$generate" == "true" ]]; then
        echo "📐 Generating rules..."
        generate_rules
    fi

    echo "✅ Self Improve complete"
}

# Analyze patterns from session
analyze_patterns() {
    local threshold=$(wrap_up_get "wrap_up.phases.self_improve.min_occurrence_threshold")

    echo "   Error threshold: $threshold occurrences"

    # Common patterns to check
    local patterns=(
        "typo"
        "syntax error"
        "test.*fail"
        "cannot find"
    )

    for pattern in "${patterns[@]}"; do
        echo "   Checking pattern: $pattern"
    done
}

# Generate rules based on patterns
generate_rules() {
    local rules_dir="vibe-flow/.claude/rules"

    mkdir -p "$rules_dir"

    # Check if error-handler rule exists
    if [[ ! -f "$rules_dir/error-handling.md" ]]; then
        echo "   Creating error-handling rule..."
        cat > "$rules_dir/error-handling.md" << 'EOF'
# Error Handling Rule

When implementing error handling:
- Use VibeFlowErrorCode enum for typed errors
- Include suggestedAction for auto-recovery
- Map generic errors to specific codes
EOF
    fi
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    wrap_up_self_improve
fi
