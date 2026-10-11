# openfilm

## 0.1.5

### Patch Changes

- [#18](https://github.com/openfilm/openfilm/pull/18) [`10709ae`](https://github.com/openfilm/openfilm/commit/10709aeec857335c23fad514f9a0233c0fedaf14) Thanks [@PazChen](https://github.com/PazChen)! - Desktop: a new version, once downloaded, is offered in the top bar beside the projects button (Restart to update) instead of in the chat, where a closed chat hid it. A restart that has to wait (an agent working, an export running) says why beside it.

- [#8](https://github.com/openfilm/openfilm/pull/8) [`6a1d9b8`](https://github.com/openfilm/openfilm/commit/6a1d9b8363b967f985df6d11b2714d158b4ce245) Thanks [@lubobill1990](https://github.com/lubobill1990)! - Studio: Azure Speech (Azure AI Speech) can be connected under Settings → Providers for voice-over with its neural voices. The key carries the resource's region (`<region>:<key>`, or `AZURE_SPEECH_KEY` with `AZURE_SPEECH_REGION`), and one without a region is refused where it is pasted; Azure times no words, so subtitles spread the text over the line, as with OpenAI's voices.

- [#5](https://github.com/openfilm/openfilm/pull/5) [`e4679d2`](https://github.com/openfilm/openfilm/commit/e4679d2d822552bae51ffdd7255ce089bd7c22c4) Thanks [@PazChen](https://github.com/PazChen)! - Desktop: your own key can name several models (Settings → Agents, separated by commas), each checked for reading pictures; the chat's menu switches between them. The menu no longer stays on "Loading" for an agent with nothing to choose.

- [#15](https://github.com/openfilm/openfilm/pull/15) [`12d34cd`](https://github.com/openfilm/openfilm/commit/12d34cdb89e1f9e234f005eee3c749466c21d824) Thanks [@PazChen](https://github.com/PazChen)! - Faster exports that use more of the computer. A video whose key frames are far apart (most camera, phone and stock footage) gets a copy that seeks fast before a render, kept in the project's cache; the pages draw from the copy and the sound still comes from the original. A film with footage renders about three times as fast. Each of a render's pages gets a browser of its own, and a render uses a browser for every two threads with 3 GB of memory each, up to eight (it was up to four, sharing one browser). H.264 and HEVC below master go through the graphics chip's encoder when it has one that works: the Mac's for HEVC too, and on Windows NVIDIA's, Intel's, AMD's or Windows' own. Each one is tried on a moment of video first, and an export it fails partway is made again without it.

- [#13](https://github.com/openfilm/openfilm/pull/13) [`74fd6d1`](https://github.com/openfilm/openfilm/commit/74fd6d1faa8bfb8ce88697398b6f4dac91549082) Thanks [@PazChen](https://github.com/PazChen)! - Export: in the desktop app, the export tray (what an export is doing, how far it has got) sits beside the chat instead of under it; pressing Export seemed to do nothing while the film rendered unseen. An ffmpeg that ends before the last frame (not found, an encoder that fails to start) fails the export with ffmpeg's own error; the export used to stay at "preparing" forever. The export dialog finds an ffmpeg that arrives after Studio started (the desktop app downloads it on a first start); every format used to say this computer's ffmpeg could not make it until Studio restarted.

- [#11](https://github.com/openfilm/openfilm/pull/11) [`70602ab`](https://github.com/openfilm/openfilm/commit/70602ab4bef7ec3b8a9621d88e3734717182213c) Thanks [@PazChen](https://github.com/PazChen)! - Studio: a key that Settings → Providers refuses says why under its own field, not at the bottom of the list past every provider.

- [#9](https://github.com/openfilm/openfilm/pull/9) [`acae857`](https://github.com/openfilm/openfilm/commit/acae857fe2741163ebcc7e8dbaf54d01bdb6402b) Thanks [@PazChen](https://github.com/PazChen)! - Studio: Brave Search, Groq, Pexels, Pixabay and Tavily show their own logos in Settings → Providers, in place of a letter or a glyph of ours.

- [#5](https://github.com/openfilm/openfilm/pull/5) [`e4679d2`](https://github.com/openfilm/openfilm/commit/e4679d2d822552bae51ffdd7255ce089bd7c22c4) Thanks [@PazChen](https://github.com/PazChen)! - Studio: the subtitle panel's language and typeface menus are Studio's own, in its colors, grouped and with the chosen one checked, in place of the browser's list, which was light in a dark Studio and read as if every choice were disabled.

- [#12](https://github.com/openfilm/openfilm/pull/12) [`7f21b61`](https://github.com/openfilm/openfilm/commit/7f21b61f84467437614a7cefe40bf3582da257b6) Thanks [@PazChen](https://github.com/PazChen)! - Exact frames (render, look, Studio's exports): a video sought as it comes on waits for its own frame on screen. On a slow machine the old frame, shown again as the video turned visible, could be taken for it, and `look` reported the same t drawing two different pictures.

## 0.1.4

### Patch Changes

- f486188: Windows: an ffmpeg that is stopped (a cancelled render or export, a mix that runs too long) ends with the real ffmpeg
  behind a Chocolatey or Scoop shim; a name with a `:` is cleaned on import, rename and new folders as on macOS and
  Linux, not refused; Studio's supervisor opens the null device by its Windows name.
- A render or `look` frame of a video clip woken ahead of its cut waits for the seek it was woken with before its own:
  on a slow machine the frame showed the clip's first second instead of the one asked for, and `look` said the same t
  drew two pictures.

## 0.1.3

The first release from the open-source repository: the CLI, Studio and the desktop app share this version.

- Media comes only from services you connect with your own key, in Studio's Settings → Providers or from the environment. There are more of them, at least one for every kind of media: ElevenLabs, OpenAI, Google Gemini and fal.ai, now with Groq (fast transcripts with Whisper, voice-over with Orpheus), Pexels and Pixabay (image search), Brave Search and Tavily (web search and reading pages); fal.ai also makes music and sound effects. `openfilm get` names the services that make each kind you have not connected yet.
- Settings → Providers: every service is Connect or Disconnect. A key pasted in Studio wins over one in the environment, which connects its service unless disconnected.
- Studio's Projects page starts from an existing film: Import from a folder, or from GitHub (a repository or a folder in one, without its git history), and a row of example films. `openfilm open <github url>` does the same. A project whose folder moved can be located again.
- A Studio started by `openfilm open` that ends unexpectedly starts again by itself, on the same address; pages reconnect.
- Settings → General shows Studio's version and checks npm for a newer one.
- The Desktop dialog shows what the app does and the agents it works with, and downloads the installer for this computer.
- The desktop app's chat runs your own agents (Codex, Claude Code, Gemini CLI, GitHub Copilot, Cursor, OpenCode and others) or its own agent on your own API key.
