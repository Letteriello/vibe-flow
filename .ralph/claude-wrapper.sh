#!/bin/bash
# Claude Wrapper - Execute BMAD commands via Claude Code
# This script wraps BMAD commands to work with Claude Code CLI

set -e

COMMAND="$1"

# If no command provided, show help
if [ -z "$COMMAND" ]; then
    echo "Usage: claude-wrapper.sh <command>"
    echo ""
    echo "Examples:"
    echo "  claude-wrapper.sh '/bmalph create-brief'"
    echo "  claude-wrapper.sh '/pm'"
    echo "  claude-wrapper.sh '/dev'"
    exit 0
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Log file for debugging
LOG_FILE="$PROJECT_ROOT/.ralph/wrapper.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

log "Executing: $COMMAND"

# Find Claude CLI - try multiple locations
find_claude() {
    # Check if claude is in PATH
    if command -v claude &> /dev/null; then
        echo "claude"
        return 0
    fi

    # Check Windows-style paths
    for path in "$HOME/AppData/Roaming/npm/claude" "/c/Users/gabri/AppData/Roaming/npm/claude"; do
        if [ -f "$path" ] || [ -f "$path.cmd" ]; then
            echo "$path"
            return 0
        fi
    done

    echo "claude"  # Fallback
}

CLAUDE_BIN=$(find_claude)

# Check if this is a BMAD command (starts with /)
if [[ "$COMMAND" == /* ]]; then
    # Extract the command part (remove leading slash)
    CMD_PART="${COMMAND#/}"

    # Map BMAD commands to Claude Code
    case "$CMD_PART" in
        bmalph*|pm|analyst|architect|sm|dev|qa|ux-designer)
            log "Executing BMAD/Agent command via Claude CLI: $COMMAND"

            # Try to execute via Claude Code CLI
            # Use different approaches for different Claude Code versions

            # Approach 1: Use -p (prompt) flag
            if [[ "$CMD_PART" == bmalph* ]]; then
                # BMAD commands are skills, try with --skill or just pass through
                RESULT=$($CLAUDE_BIN --print "$COMMAND" 2>&1) || true
            else
                # Agent commands
                RESULT=$($CLAUDE_BIN --print "$COMMAND" 2>&1) || true
            fi

            if [ -n "$RESULT" ]; then
                echo "$RESULT"
                log "Command executed successfully"
            else
                # Fallback: show that command was recognized
                echo "BMAD command: $COMMAND"
                echo ""
                echo "To execute this command, ensure Claude Code is running and run:"
                echo "  claude -p \"$COMMAND\""
                log "Command recognized but may need interactive Claude Code session"
            fi

            exit 0
            ;;
        *)
            # Unknown command
            echo "Unknown command: $COMMAND"
            log "Unknown command: $COMMAND"
            exit 1
            ;;
    esac
else
    # Regular shell command - execute directly
    log "Executing shell command: $COMMAND"
    eval "$COMMAND"
fi

log "Command completed: $COMMAND"
