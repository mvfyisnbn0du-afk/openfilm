---
"openfilm": patch
---

Studio: getting a film from GitHub works like a download. A public repository comes over https, without git, so its size is known from the start: the bar shows how much of how much has come, how fast, and how long is left, and a dropped connection is tried again. Opening an example shows just its download and Cancel. Cancel stops it at once and leaves nothing behind (before, it started again straight away). A private repository, or one on GitLab, still comes through git. A download is stopped only when nothing has come for two minutes, not after ten minutes in all, so a big film on a slow line gets there.
