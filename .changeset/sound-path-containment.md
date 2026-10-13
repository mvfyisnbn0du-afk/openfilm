---
"openfilm": patch
---

A sound's file is always read from inside the film's folder. A path with a slash written as `%2F` was decoded after the URL had resolved its `..`, so a page's script could name a file above the folder and `look`, `render` and Studio's exports read it; such a path, or a link that leads out of the folder, is now refused with its name. A link to media the person linked (Studio's linked places) is still read, as the file server reads it. A sound's timing and volume have to be numbers before they go into ffmpeg's filters.
