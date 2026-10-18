import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationMenuTemplate } from './menu.mjs';

function fixture(platform, packaged = true, updates = null) {
  let opened = 0;
  const noop = () => {};
  const menu = applicationMenuTemplate({
    productName: 'OpenFilm', packaged, toggleChat: noop, openProject: noop,
    reload: noop, devTools: noop, openSettings: () => { opened++; },
    tabs: { open: noop, close: noop, reopen: noop, step: noop, pick: noop },
    updates,
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

for (const updates of [null, { check: async () => {}, beta: false, setBeta: () => {} }]) {
  test(`macOS puts updates before Settings and Services after it, updates=${!!updates}`, () => {
    const { menu } = fixture('darwin', true, updates);
    const items = menu.find((item) => item.label === 'OpenFilm').submenu;
    const settings = items.findIndex((item) => item.label === 'Settings…');
    const services = items.findIndex((item) => item.role === 'services');
    assert.equal(items[0].role, 'about');
    assert.equal(items[settings - 1].type, 'separator');
    assert.equal(items[settings + 1].type, 'separator');
    assert.equal(services, settings + 2);
    if (updates) {
      const check = items.findIndex((item) => item.label === 'Check for Updates…');
      const channel = items.findIndex((item) => item.type === 'checkbox');
      assert.ok(check > 0 && check < settings);
      assert.ok(channel > check && channel < settings);
    } else {
      assert.equal(settings, 2);
    }
  });
}
