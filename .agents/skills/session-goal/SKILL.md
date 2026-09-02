---
name: session-goal
description: Define or revise one concise goal for the current WWW conversation. Use when the user invokes $session-goal or explicitly asks to set the session-wide goal shown above T-notes.
---

# Session Goal

Treat the user's invocation as confirmation that WWW may adopt the returned goal.

Derive one outcome-oriented Korean sentence from the user's request. Preserve the user's scope and avoid implementation details, file lists, task steps, promises, or invented success criteria. Keep the goal under 160 characters and make it understandable without prior conversation.

Do not call tools, edit files, or describe your reasoning. If the request does not contain enough information to state a reliable goal, ask one short clarification question and do not emit the marker.

When the goal is clear, return exactly one plain-text line in this format and nothing else:

SESSION_GOAL: <goal>
