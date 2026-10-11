---
"openfilm": patch
---

Faster exports that use more of the computer. A video whose key frames are far apart (most camera, phone and stock footage) gets a copy that seeks fast before a render, kept in the project's cache; the pages draw from the copy and the sound still comes from the original. A film with footage renders about three times as fast. Each of a render's pages gets a browser of its own, and a render uses a browser for every two threads with 3 GB of memory each, up to eight (it was up to four, sharing one browser). H.264 and HEVC below master go through the graphics chip's encoder when it has one that works: the Mac's for HEVC too, and on Windows NVIDIA's, Intel's, AMD's or Windows' own. Each one is tried on a moment of video first, and an export it fails partway is made again without it.
