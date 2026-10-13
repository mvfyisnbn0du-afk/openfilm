---
"@openfilm/desktop": patch
---

Desktop on Windows: the Codex app from the Microsoft Store is no longer taken for the Codex CLI. Its own `Codex.exe` is the app's window, so Codex showed as ready, the model menu could not start it, and each Retry opened the app. Only a console program found there is used now: with no CLI installed, Codex shows as not installed, with where to get it. When the model menu cannot start an agent, the reason is written to the app's log.
