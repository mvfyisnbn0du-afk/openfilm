---
"@openfilm/desktop": patch
---

Keep the app running when its window is closed on macOS, so the Dock can reopen it without losing tabs or stopping agents. Command-W closes the window when no project tab is open on macOS. Explicit Quit exits even while Studio is starting or after startup fails; Windows and Linux keep their existing Close Tab behavior.
