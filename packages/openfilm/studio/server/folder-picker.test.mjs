import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filePickerCommand, folderPickerCommand } from './folder-picker.mjs';

test('macOS: the words and the folder are arguments of the script, never inside it', () => {
  const c = folderPickerCommand('darwin', { title: 'Save "here" end tell', at: '/Volumes/Films' });
  assert.equal(c.cmd, 'osascript');
  assert.deepEqual(c.args.slice(-2), ['Save "here" end tell', '/Volumes/Films']);
  assert.ok(c.args.filter((a, i) => c.args[i - 1] === '-e').every((line) => !line.includes('here')));
});

test('a starting folder that is not a full path is left out', () => {
  assert.equal(folderPickerCommand('darwin', { title: 'T', at: 'Desktop' }).args.at(-1), '');
  assert.equal(folderPickerCommand('win32', { title: 'T', at: 'Desktop' }).env.OPENFILM_PICK_AT, '');
});

test('Windows: PowerShell reads the words from its environment', () => {
  const c = folderPickerCommand('win32', { title: "it's mine", at: 'D:\\Films' });
  assert.equal(c.cmd, 'powershell.exe');
  assert.equal(c.env.OPENFILM_PICK_TITLE, "it's mine");
  assert.ok(!c.args.join(' ').includes("it's mine"));
});

test('Linux: zenity, else kdialog, else none', () => {
  assert.equal(folderPickerCommand('linux', { title: 'T', at: '/srv/films' }, (n) => n === 'zenity').cmd, 'zenity');
  assert.equal(folderPickerCommand('linux', { title: 'T' }, (n) => n === 'kdialog').cmd, 'kdialog');
  assert.equal(folderPickerCommand('linux', { title: 'T' }, () => false), null);
});

test('files: several at once, a path a line; the words are arguments, never inside the script', () => {
  const mac = filePickerCommand('darwin', { title: 'Link "media" end tell', at: '/Volumes/NAS' });
  assert.deepEqual(mac.args.slice(-2), ['Link "media" end tell', '/Volumes/NAS']);
  assert.ok(mac.args.some((a) => a.includes('multiple selections allowed')));
  assert.ok(mac.args.filter((a, i) => mac.args[i - 1] === '-e').every((line) => !line.includes('media')));
  const win = filePickerCommand('win32', { title: "it's mine" });
  assert.equal(win.env.OPENFILM_PICK_TITLE, "it's mine");
  assert.match(win.args.at(-1), /Multiselect = \$true/);
  assert.ok(filePickerCommand('linux', { title: 'T' }, (n) => n === 'zenity').args.includes('--multiple'));
  assert.equal(filePickerCommand('linux', { title: 'T' }, () => false), null);
});
