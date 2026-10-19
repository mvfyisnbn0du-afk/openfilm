---
"openfilm": patch
---

Allow decimal frame rates such as 23.976, 29.97 and 59.94 in `openfilm render --fps`, keeping the existing range of 1 to 240. The NTSC rates render at their exact rates (24000/1001, 30000/1001, 60000/1001), as footage shot at them is.
