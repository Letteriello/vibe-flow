#!/bin/bash
# Wrap-up Configuration Management

WRAP_UP_CONFIG_DIR="${BASH_SOURCE%/*}/../../../_bmad/core/workflows/wrap-up/config"
DEFAULT_CONFIG="$WRAP_UP_CONFIG_DIR/default-config.json"

# Load configuration
load_wrap_up_config() {
    if [[ -f "$DEFAULT_CONFIG" ]]; then
        WRAP_UP_CONFIG=$(cat "$DEFAULT_CONFIG")
    else
        WRAP_UP_CONFIG='{}'
    fi
}

# Get config value
wrap_up_get() {
    local key="$1"
    echo "$WRAP_UP_CONFIG" | jq -r ".$key // empty" 2>/dev/null
}

# Check if phase is enabled
wrap_up_phase_enabled() {
    local phase="$1"
    wrap_up_get "wrap_up.phases.$phase.enabled" | grep -q "true"
}

# Load config on source
load_wrap_up_config
