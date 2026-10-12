---
"openfilm": patch
"@openfilm/desktop": patch
---

Settings → About in the desktop app shows the version and its update without going to the menu: it looks for one on opening (unless it looked a few minutes ago), shows "Up to date" with when it last checked, or the new version downloading with its progress, then "Restart to update" once it is ready (it installs at the next quit too). A failed check says why, with Try again. A build run from source says it doesn't update itself. The menu's Check for Updates… is still there.
