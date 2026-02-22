#!/bin/bash
# Claude Code hooks for tune-in integration
#
# Installation:
# 1. Start the daemon: tune-in daemon
# 2. Add these hooks to your ~/.claude/hooks.json (see hooks.json example)

case "$HOOK_EVENT" in
  "tool_use:before")
    # Music starts when Claude begins using a tool (like Bash, Read, etc.)
    if [[ "$TOOL_NAME" == "Bash" ]] || [[ "$TOOL_NAME" == "Task" ]]; then
      tune-in signal start 2>/dev/null
    fi
    ;;

  "tool_use:after")
    # Music pauses when Claude finishes using a tool
    if [[ "$TOOL_NAME" == "Bash" ]] || [[ "$TOOL_NAME" == "Task" ]]; then
      tune-in signal stop 2>/dev/null
    fi
    ;;

  "turn:before")
    # Alternative: Start music at the beginning of Claude's turn
    tune-in signal start 2>/dev/null
    ;;

  "turn:after")
    # Alternative: Pause music when Claude is done and waiting for user
    tune-in signal stop 2>/dev/null
    ;;
esac
