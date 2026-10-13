---
"openfilm": patch
"@openfilm/desktop": patch
---

Your own services: in Settings → Providers, add any service you run or use (your own voice, a transcription server on this computer, an API that isn't listed) with its address, its key if it takes one, and what it does. Your agent reaches it with `openfilm get call`: Studio adds the key (it never reaches the agent or the chat), and whatever the service answers comes back as it is, text and JSON for the agent to read, files saved under `assets/<service>/`.
