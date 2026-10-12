---
"openfilm": patch
"@openfilm/desktop": patch
---

Desktop: a conversation's messages are kept as the agent works, not only once its turn ends. Quitting the app, a crash or a restart in the middle of a turn no longer loses it: it comes back as it was, marked Interrupted, and the next message goes on from there (the agent resumes its own session, so it still has everything it did). Turns lost this way before (their logs were kept) come back when their project opens.
