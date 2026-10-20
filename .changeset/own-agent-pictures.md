---
"openfilm": patch
"@openfilm/desktop": patch
---

The app's own agent (your own key) keeps a long conversation going when it looks at many frames. Pictures keep their full quality. A request carries the pictures of the agent's latest five reads, and at most 32 MB of them; an older one is left out of the request with a line naming its file, so the agent can read it again (the conversation keeps them). A model service that refuses a request as too large (HTTP 413, a proxy's page included) is tried again at once with half of the older pictures left out, and says so in the chat; before, every message after it failed the same way. Settings › Agents says that the agent's rules are the project's own AGENTS.md.
