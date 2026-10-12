---
"openfilm": patch
---

`look`, `render` and Studio's exports take the browser from the environment: `OPENFILM_BROWSER_CHANNEL=chrome` draws with the installed Google Chrome, which decodes H.264 and AAC where Chromium's own build on Linux does not (footage from phones and cameras drew black there), and `OPENFILM_BROWSER_ARGS` adds arguments to every launch, separated by spaces or as a JSON array (`--no-sandbox` for a container running as root, `--host-resolver-rules` to keep pages off the network).
