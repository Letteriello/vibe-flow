#!/bin/bash
# Wrap-up Session Consolidation Script
# Executes all session consolidation operations definitively

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Wrap-up Session Starting"
echo "========================="
echo ""

# Load configuration
source "$SCRIPT_DIR/config.sh"

# Execute each phase definitively
if wrap_up_phase_enabled "ship_it"; then
    source "$SCRIPT_DIR/ship_it.sh"
    wrap_up_ship_it
    echo ""
fi

if wrap_up_phase_enabled "remember_it"; then
    source "$SCRIPT_DIR/memory_router.sh"
    wrap_up_remember_it
    echo ""
fi

if wrap_up_phase_enabled "self_improve"; then
    source "$SCRIPT_DIR/self_improver.sh"
    wrap_up_self_improve
    echo ""
fi

if wrap_up_phase_enabled "publish_it"; then
    source "$SCRIPT_DIR/content_generator.sh"
    wrap_up_publish_it
    echo ""
fi

echo "========================="
echo "Wrap-up Session Complete"
