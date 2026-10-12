---
"openfilm": patch
"@openfilm/desktop": patch
---

Desktop: less work around a running agent. Studio no longer redraws the film when the agent writes a file no page loads (its notes, scripts, logs). The chat around a turn no longer re-renders for every word the agent streams. A model menu whose agent did not answer is asked again only when the menu opens or on Retry, not on every render (each try was a whole session of the agent's). A turn's log open while it runs is read again only once it has grown.
