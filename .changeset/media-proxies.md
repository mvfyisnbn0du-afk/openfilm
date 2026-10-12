---
"openfilm": patch
---

Studio: heavy footage plays from a proxy, as in CapCut. Footage past 1080p, or slow to decode (ProRes, HEVC, 10-bit), gets a lighter copy made in the background (H.264, the same frames at the same times, a key frame every half second), and the preview plays it once it is ready; the media pane shows it being made, then marks it. Settings → General → Playback turns proxies off and sets their size (540p, 720p by default, 1080p). The film's sound, `openfilm render` and every export read the originals; a video's length and size are always the original's.
