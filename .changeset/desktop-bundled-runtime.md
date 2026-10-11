---
"@openfilm/desktop": patch
---

Desktop: the installer comes with ffmpeg and the headless browser Studio draws pages in, so the first start downloads nothing (on a slow or blocked connection it used to fail there). A build without them downloads ffmpeg as before, now stopped and tried again when the download stalls.
