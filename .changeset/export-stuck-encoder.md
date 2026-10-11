---
"openfilm": patch
---

Export: in the desktop app, the export tray (what an export is doing, how far it has got) sits beside the chat instead of under it; pressing Export seemed to do nothing while the film rendered unseen. An ffmpeg that ends before the last frame (not found, an encoder that fails to start) fails the export with ffmpeg's own error; the export used to stay at "preparing" forever. The export dialog finds an ffmpeg that arrives after Studio started (the desktop app downloads it on a first start); every format used to say this computer's ffmpeg could not make it until Studio restarted.
