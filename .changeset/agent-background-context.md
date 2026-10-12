---
"openfilm": patch
"@openfilm/desktop": patch
---

Desktop: when a background task of the agent's own ends after its turn (a command Claude Code ran in the background, a subagent) and it takes it up by itself, the chat shows that work as a turn of its own, under "A background task finished; the agent went on", with its log; before, it was lost. It ends with the agent's result, and as soon as you write. A ring beside the composer's tools shows how full the agent's context is in the conversation, with the numbers on hover. The `/` menu has the agent's commands from the start (they were there only after a first message), keeps them between launches, finds them by name, and shows each name whole.
