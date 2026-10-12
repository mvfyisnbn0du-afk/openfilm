import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandWindowsVars, parseRegQuery, windowsFreshPath } from './environment.mjs';

const PROFILE = ['C:', 'Users', 'someone'].join('\\');

const USER = `\r
HKEY_CURRENT_USER\\Environment\r
    Path    REG_EXPAND_SZ    %USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps;%NVM_HOME%;%NVM_SYMLINK%;C:\\Users\\someone\\AppData\\Roaming\\npm\r
    NVM_HOME    REG_SZ    C:\\Users\\someone\\AppData\\Local\\nvm\r
    NVM_SYMLINK    REG_SZ    C:\\nvm4w\\nodejs\r
    OneDrive Consumer    REG_SZ    C:\\Users\\someone\\OneDrive\r
    TEMP    REG_EXPAND_SZ    %USERPROFILE%\\AppData\\Local\\Temp\r
    Count    REG_DWORD    0x1\r
`;

test('reg query output is read: text values by name, other kinds left out', () => {
  const values = parseRegQuery(USER);
  assert.equal(values.NVM_SYMLINK, 'C:\\nvm4w\\nodejs');
  assert.equal(values['OneDrive Consumer'], 'C:\\Users\\someone\\OneDrive');
  assert.match(values.Path, /^%USERPROFILE%\\AppData/);
  assert.equal(values.Count, undefined);
  assert.deepEqual(parseRegQuery(''), {});
});

test('%VARIABLES% are expanded whatever their case; one not set stays as it is', () => {
  assert.equal(expandWindowsVars('%userprofile%\\bin;%NOPE%\\x', { USERPROFILE: PROFILE }), `${PROFILE}\\bin;%NOPE%\\x`);
});

test("the PATH a program started now gets: the system's, the person's (with their own variables), then the app's own", () => {
  const machine = { Path: '%SystemRoot%\\system32;C:\\Program Files\\nodejs\\', SystemRoot: 'C:\\Windows' };
  const user = parseRegQuery(USER);
  const source = { Path: 'C:\\Windows\\System32;C:\\Old\\stale', USERPROFILE: PROFILE };
  assert.equal(windowsFreshPath({ machine, user, source }), [
    'C:\\Windows\\system32', 'C:\\Program Files\\nodejs\\',
    'C:\\Users\\someone\\AppData\\Local\\Microsoft\\WindowsApps', 'C:\\Users\\someone\\AppData\\Local\\nvm', 'C:\\nvm4w\\nodejs', 'C:\\Users\\someone\\AppData\\Roaming\\npm',
    'C:\\Old\\stale',
  ].join(';'));
});
