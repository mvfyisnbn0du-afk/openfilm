---
"openfilm": patch
---

A video frame that is decoded but never shown (a seek made just after its file loaded) is sought again, so a render, an export or `look` no longer takes the clip's first frame for the one asked for.
