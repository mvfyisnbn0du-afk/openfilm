---
"openfilm": patch
---

Close media file streams when preview requests are cancelled, preventing leaked file handles from blocking project renames on Windows.
