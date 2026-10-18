---
'openfilm': patch
---

Render: on Windows, WARP ("Microsoft Basic Render Driver", what a computer without a GPU driver or a remote session falls back to) counts as software, so `look` warns about it and render doesn't keep Vulkan on it.
