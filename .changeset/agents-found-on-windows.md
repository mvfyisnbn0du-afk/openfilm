---
"@openfilm/desktop": patch
"openfilm": patch
---

Desktop: Codex, Claude Code and the other agents are found on Windows where they were missed. The PATH is read as Windows has it now, so an agent installed after signing in to Windows is found without signing out; the folders of pnpm, Volta, nvm-windows, Yarn, Bun, Scoop, Chocolatey and winget are searched, with npm's own global folder; and the shims npm, pnpm and Yarn write are read correctly (npm's current shim was taken for its node.exe). A shim that cannot be read is started through cmd.exe. On a Mac too, the login shell's PATH is read again while the app runs, so an agent installed meanwhile is found without restarting the app.
Settings → Agents: an agent not found has Locate…, which opens the file dialog; the program chosen is tried (it has to answer `--version`) and used from then on, until Find it automatically. "Why isn't it found?" says what to do (installed only in WSL, files that cannot start, nothing found) and copies a report of every folder searched, to send with an issue.
