---
"openfilm": patch
---

Render: a WebM with an alpha (VP9) whose key frames are far apart keeps its alpha. It was given a copy without one for a render, which then showed what lay under the alpha (often a solid color) in the export, and in Studio's picture once the copy was made.
