---
'@openfilm/desktop': patch
---

Desktop: Codex connects once it is found, with no sign-in from OpenFilm; it is signed in in Codex itself. An agent's failure says why: what the agent said, or, when it says nothing, the step it stopped at, how its process ended and what it last wrote, and a start that fails is in the turn's log too. Codex's reconnects ("Reconnecting... 2/5", "waiting for network") show in the chat as it retries, and a message its model service refuses fails the turn with the reason instead of showing it as the reply; a model the Codex on the computer is too old for says to update Codex or choose another model.
