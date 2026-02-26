#!/bin/bash
# Ralph Loop - Main execution loop for Ralph agent
# Executes agent cycles and triggers wrap-up session after each cycle

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Default configuration
MAX_CALLS_PER_HOUR=100
CLAUDE_TIMEOUT_MINUTES=15
LIVE_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --live)
            LIVE_MODE=true
            shift
            ;;
        --calls)
            MAX_CALLS_PER_HOUR="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

# Log file
LOG_FILE="$PROJECT_ROOT/.ralph/live.log"
LOGS_DIR="$PROJECT_ROOT/.ralph/logs"

# Ensure logs directory exists
mkdir -p "$LOGS_DIR"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Find Claude CLI
find_claude() {
    if command -v claude &> /dev/null; then
        echo "claude"
        return 0
    fi

    for path in "$HOME/AppData/Roaming/npm/claude" "/c/Users/gabri/AppData/Roaming/npm/claude"; do
        if [ -f "$path" ] || [ -f "$path.cmd" ]; then
            echo "$path"
            return 0
        fi
    done

    echo "claude"
}

CLAUDE_BIN=$(find_claude)

# Main loop
LOOP_COUNT=0
log "Starting Ralph Loop..."

while true; do
    LOOP_COUNT=$((LOOP_COUNT + 1))
    TIMESTAMP=$(date '+%Y-%m-%d_%H-%M-%S')
    LOOP_LOG="$LOGS_DIR/claude_output_$TIMESTAMP.log"

    log "=== Loop #$LOOP_COUNT - $(date) ==="

    # Execute Claude Code with the main prompt
    if [ "$LIVE_MODE" = true ]; then
        $CLAUDE_BIN -p "$(cat "$PROJECT_ROOT/.ralph/PROMPT.md")" 2>&1 | tee -a "$LOOP_LOG"
    else
        $CLAUDE_BIN -p "$(cat "$PROJECT_ROOT/.ralph/PROMPT.md")" >> "$LOOP_LOG" 2>&1
    fi

    EXIT_CODE=$?

    # Check for exit signal
    if grep -q "EXIT_SIGNAL: true" "$LOOP_LOG" 2>/dev/null; then
        log "Exit signal detected. Stopping loop."
        break
    fi

    # After agent completes implementation, trigger wrap-up session
    log "Triggering wrap-up session..."
    bash "$PROJECT_ROOT/.ralph/lib/wrap-up/wrap_up.sh" .

    # Check if we've reached the call limit
    if [ $LOOP_COUNT -ge $MAX_CALLS_PER_HOUR ]; then
        log "Reached maximum calls per hour ($MAX_CALLS_PER_HOUR). Stopping."
        break
    fi

    # Small delay between iterations
    sleep 2
done

log "Ralph Loop finished after $LOOP_COUNT iterations."
