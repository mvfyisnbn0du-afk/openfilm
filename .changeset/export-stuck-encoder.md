---
"openfilm": patch
---

Export: an ffmpeg that ends before the last frame (not found, an encoder that fails to start) fails the export with ffmpeg's own error; the export used to stay at "preparing" forever. The export dialog finds an ffmpeg that arrives after Studio started (the desktop app downloads it on a first start); every format used to say this computer's ffmpeg could not make it until Studio restarted.
