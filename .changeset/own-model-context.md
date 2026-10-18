---
'@openfilm/desktop': patch
'openfilm': patch
---

Desktop: each of your own models takes its context length in Settings, so the agent compacts before the model's own limit instead of at 128K.
