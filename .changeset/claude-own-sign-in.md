---
"@openfilm/desktop": patch
"openfilm": patch
---

Desktop: Claude Code takes the keys in the shell as it does in a terminal. An `ANTHROPIC_API_KEY` is used only once you said yes to it in Claude Code's terminal; one you said no to, or were never asked about, no longer takes the place of your own sign-in (it made Claude look connected and fail every message). Settings → Agents says when Claude Code goes through a custom gateway (`ANTHROPIC_BASE_URL` or `ANTHROPIC_AUTH_TOKEN`).
