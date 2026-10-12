---
"openfilm": patch
"@openfilm/desktop": patch
---

Desktop: each conversation in the chat is its own session of the agent's, and it goes on where it stopped after a restart, a reload, or switching conversations: the chat keeps the agent's own session id and resumes it, as `claude --resume` or `codex resume` would. A new conversation starts a new session (it carried the last one's context before). A session left idle for 20 minutes closes, and its next message resumes it. A picture attached to a message is sent to the agent beside the text, as one pasted in its own chat is, besides being put in the project. The message goes as written (the first one no longer starts with a line about the language), so a slash command typed first works.
