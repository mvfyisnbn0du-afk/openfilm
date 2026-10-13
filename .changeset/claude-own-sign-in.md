---
"@openfilm/desktop": patch
"openfilm": patch
---

Desktop: Claude Code uses its own sign-in again. An `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_BASE_URL` in the shell is no longer given to it, so a stale key or gateway can no longer make it look connected and fail every message, and a computer where it is not signed in is asked to sign in.
