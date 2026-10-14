---
"@openfilm/desktop": patch
"openfilm": patch
---

Desktop: Claude Code runs on your Claude subscription only. An `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or `ANTHROPIC_BASE_URL` in your shell is no longer given to it, so a stale key or gateway can no longer make it look connected and fail every message (a gateway of your own goes in Settings → Agents → Own key). Signing in uses the way Claude Code's adapter offers it (ACP terminal sign-in). Claude Code is connected when you connect it; Codex still is from the start. On Windows, signing in opens a PowerShell window that runs a script, so an install path with a space in it no longer breaks it.
