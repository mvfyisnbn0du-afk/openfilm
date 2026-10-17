import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationMenuTemplate } from './menu.mjs';

function fixture(platform, packaged = true) {
  let opened = 0;
  const noop = () => {};
  const menu = applicationMenuTemplate({
    productName: 'OpenFilm', packaged, toggleChat: noop, openProject: noop,
    reload: noop, devTools: noop, openSettings: () => { opened++; },
    tabs: { open: noop, close: noop, reopen: noop, step: noop, pick: noop },
  }, platform);
  return { menu, opened: () => opened };
}
for (const platform of ['darwin', 'win32', 'linux']) {
  for (const packaged of [true, false]) {
    test(`Settings is discoverable and has its native accelerator on ${platform}, packaged=${packaged}`, () => {
      const f = fixture(platform, packaged);
      const parent = f.menu.find((item) => item.label === (platform === 'darwin' ? 'OpenFilm' : 'File'));
      const settings = parent.submenu.find((item) => item.label === 'Settings…');
      assert.equal(settings.accelerator, 'CmdOrCtrl+,');
      assert.notEqual(settings.enabled, false);
      settings.click();
      assert.equal(f.opened(), 1);
      assert.equal(f.menu.flatMap((item) => Array.isArray(item.submenu) ? item.submenu : []).filter((item) => item.label === 'Settings…').length, 1);
    });
  }
}
