---
"openfilm": patch
"@openfilm/desktop": patch
---

Desktop: Claude Code and Codex in the chat run as they do in your terminal. They get everything your shell sets (an API key or a gateway such as ANTHROPIC_BASE_URL, an MCP server's token, your certificates, your ssh agent), where before they got only its PATH. Their model and reasoning effort are your own config's until you pick another in the menu (the chat no longer sets High). Codex keeps your own developer_instructions, with OpenFilm's after them. Your ffmpeg and Playwright browsers come first for the commands they run; the app's ffmpeg and browser go only to the `openfilm` command (and ffmpeg last on the PATH, for a computer that has none). Electron's ELECTRON_RUN_AS_NODE no longer reaches their commands. A session starts without waiting on your shell to be read again.
