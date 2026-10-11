# @openfilm/desktop

## 0.1.5

### Patch Changes

- [#18](https://github.com/openfilm/openfilm/pull/18) [`10709ae`](https://github.com/openfilm/openfilm/commit/10709aeec857335c23fad514f9a0233c0fedaf14) Thanks [@PazChen](https://github.com/PazChen)! - Desktop: a new version, once downloaded, is offered in the top bar beside the projects button (Restart to update) instead of in the chat, where a closed chat hid it. A restart that has to wait (an agent working, an export running) says why beside it.

- [#5](https://github.com/openfilm/openfilm/pull/5) [`e4679d2`](https://github.com/openfilm/openfilm/commit/e4679d2d822552bae51ffdd7255ce089bd7c22c4) Thanks [@PazChen](https://github.com/PazChen)! - Desktop: your own key can name several models (Settings → Agents, separated by commas), each checked for reading pictures; the chat's menu switches between them. The menu no longer stays on "Loading" for an agent with nothing to choose.

- [#5](https://github.com/openfilm/openfilm/pull/5) [`e4679d2`](https://github.com/openfilm/openfilm/commit/e4679d2d822552bae51ffdd7255ce089bd7c22c4) Thanks [@PazChen](https://github.com/PazChen)! - Desktop: the installer comes with ffmpeg and the headless browser Studio draws pages in, so the first start downloads nothing (on a slow or blocked connection it used to fail there). A build without them downloads ffmpeg as before, now stopped and tried again when the download stalls.

- Updated dependencies [[`6a1d9b8`](https://github.com/openfilm/openfilm/commit/6a1d9b8363b967f985df6d11b2714d158b4ce245), [`e4679d2`](https://github.com/openfilm/openfilm/commit/e4679d2d822552bae51ffdd7255ce089bd7c22c4), [`12d34cd`](https://github.com/openfilm/openfilm/commit/12d34cdb89e1f9e234f005eee3c749466c21d824), [`74fd6d1`](https://github.com/openfilm/openfilm/commit/74fd6d1faa8bfb8ce88697398b6f4dac91549082), [`70602ab`](https://github.com/openfilm/openfilm/commit/70602ab4bef7ec3b8a9621d88e3734717182213c), [`acae857`](https://github.com/openfilm/openfilm/commit/acae857fe2741163ebcc7e8dbaf54d01bdb6402b), [`e4679d2`](https://github.com/openfilm/openfilm/commit/e4679d2d822552bae51ffdd7255ce089bd7c22c4), [`7f21b61`](https://github.com/openfilm/openfilm/commit/7f21b61f84467437614a7cefe40bf3582da257b6)]:
  - openfilm@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [f486188]
  - openfilm@0.1.4

## 0.1.3

See the release notes of [openfilm 0.1.3](../../packages/openfilm/CHANGELOG.md): the app and the CLI share their version.
