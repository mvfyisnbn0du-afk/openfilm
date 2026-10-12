---
"openfilm": patch
"@openfilm/desktop": patch
---

Desktop: the chat's agents are told to use the app's own `openfilm` command, not `npx openfilm` (which an installed OpenFilm skill says), so they work on the Studio in the window at its version; and only not to open Studio in a browser, rather than never to open a browser.
