import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync, rmSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectProgram, detectAgentInstallation, searchReport } from './agent-installation.mjs';
import { launchProgram } from './agent-launch.mjs';
import { checkAgentProgram } from './agents.mjs';

const agent = { label: 'Another ACP agent', names: ['another'], identity: { npmPackage: '@example/another' }, runtime: 'node' };
function fixture(t, { name = '@example/another', entry = 'dist/nested/cli/commands/main.mjs', bin = { another: entry } } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'of-program-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, entry);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, '', { mode: 0o755 });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, bin }));
  return { dir, file };
}

test('a new agent definition verifies deeply nested entries without a registry or name-specific code', (t) => {
  const { file } = fixture(t);
  assert.deepEqual(inspectProgram(agent, file), { ok: true, path: file });
});

test('identity requires the declared executable, not just an ancestor package name', (t) => {
  const { dir } = fixture(t);
  const unrelated = join(dir, 'unrelated.mjs'); writeFileSync(unrelated, '');
  assert.equal(inspectProgram(agent, unrelated).code, 'identity-mismatch');
});

test('the nearest named package owns an entry; an outer package cannot override its identity', (t) => {
  const { file } = fixture(t);
  writeFileSync(join(dirname(file), 'package.json'), JSON.stringify({ name: 'unrelated' }));
  const result = inspectProgram(agent, file);
  assert.equal(result.code, 'identity-mismatch');
  assert.match(result.error, /unrelated/);
});

test('missing or malformed identity evidence remains unverified', (t) => {
  const { dir, file } = fixture(t);
  for (const manifest of ['{broken', 'null', '[]', '{"name":42}']) {
    writeFileSync(join(dir, 'package.json'), manifest);
    assert.equal(inspectProgram(agent, file).code, 'unverified-program');
  }
  rmSync(join(dir, 'package.json'));
  assert.equal(inspectProgram(agent, file).code, 'unverified-program');
});

test('declared bin aliases and symlinks resolve to their actual entry', { skip: process.platform === 'win32' }, (t) => {
  const { dir, file } = fixture(t);
  const alias = join(dir, 'renamed-command'); symlinkSync(file, alias);
  assert.equal(inspectProgram(agent, alias).path, file);
  rmSync(file);
  assert.equal(inspectProgram(agent, alias).code, 'not-a-program');
});

test('Windows npm shims use the same package and bin verification', (t) => {
  const { dir, file } = fixture(t, { entry: 'cli' });
  const shim = join(dir, 'another.cmd');
  writeFileSync(shim, '@echo off\r\nnode "%dp0%cli" %*\r\n');
  assert.deepEqual(inspectProgram(agent, shim, { win: true }), { ok: true, path: file });
  writeFileSync(shim, '@echo off\r\necho not an npm shim\r\n');
  assert.equal(inspectProgram(agent, shim, { win: true }).code, 'unverified-program');
});

test('identity rules apply to manually chosen and fallback programs', (t) => {
  const { dir, file } = fixture(t, { name: 'dancers-shell', bin: { dsh: 'main.mjs' }, entry: 'main.mjs' });
  const opts = { home: dir, env: { PATH: '' }, pathDirs: [], applicationDirs: [], win: false };
  assert.equal(detectAgentInstallation('deepseek', { ...opts, chosen: file }).installed, false);
  assert.equal(detectAgentInstallation('deepseek', { ...opts, others: [file] }).installed, false);
});

test('diagnostics explain why a same-name program was rejected', (t) => {
  const { dir } = fixture(t, { name: 'dancers-shell', bin: { dsh: 'dsh' }, entry: 'dsh' });
  const report = searchReport('deepseek', { home: dir, env: { PATH: dir }, pathDirs: [], win: false });
  const found = report.files.find((f) => f.file === join(dir, 'dsh'));
  assert.equal(found.usable, false);
  assert.match(found.reason, /dancers-shell/);
});

test('manual selection rejects a wrong program before executing its version command', async (t) => {
  const { dir, file } = fixture(t, { name: 'dancers-shell', entry: 'main.mjs' });
  const marker = join(dir, 'executed');
  writeFileSync(file, `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)},'yes'); console.log('1.0');`);
  const result = await checkAgentProgram('deepseek', file);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'identity-mismatch');
  assert.equal(existsSync(marker), false);
});

test('runtime policy is driven by an arbitrary agent definition, including extensionless Node entries', (t) => {
  const { file } = fixture(t, { entry: 'cli' });
  const launch = launchProgram(agent, file, ['acp'], { PATH: dirname(process.execPath) });
  assert.equal(launch.args[0], '--import');
  assert.deepEqual(launch.args.slice(2), [file, 'acp']);
  assert.deepEqual(launch.env, {});
  assert.throws(() => launchProgram(agent, file, [], { PATH: '' }), /Another ACP agent.*Node.js/);
});

test('Windows runtime selection can be verified on any host', (t) => {
  const { dir, file } = fixture(t);
  const node = join(dir, 'node.exe'); writeFileSync(node, '');
  const launch = launchProgram(agent, file, ['acp'], { PATH: dir }, { win: true });
  assert.equal(launch.cmd, node);
  assert.equal(launch.args[0], '--import');
});


test('string bin declarations and type-only nested manifests preserve package ownership', (t) => {
  const { file } = fixture(t, { bin: 'dist/nested/cli/commands/main.mjs' });
  writeFileSync(join(dirname(file), 'package.json'), JSON.stringify({ type: 'module' }));
  assert.deepEqual(inspectProgram(agent, file), { ok: true, path: file });
});

test('shim chains resolve without a fixed depth and cycles stop without executing anything', (t) => {
  const { dir, file } = fixture(t, { entry: 'cli' });
  let target = file;
  for (let i = 0; i < 12; i++) {
    const shim = join(dir, `layer${i}.cmd`);
    writeFileSync(shim, `@echo off\r\n"%dp0%${basename(target)}" %*\r\n`);
    target = shim;
  }
  assert.equal(inspectProgram(agent, target, { win: true }).path, file);
  writeFileSync(join(dir, 'layer0.cmd'), `@echo off\r\n"%dp0%layer11.cmd" %*\r\n`);
  assert.equal(inspectProgram(agent, target, { win: true }).code, 'unverified-program');
});

test('Locate on a folder skips an unrelated executable before a valid shim in that same folder', (t) => {
  const { dir, file } = fixture(t);
  const bin = join(dir, 'bin'); mkdirSync(bin);
  writeFileSync(join(bin, 'another.exe'), 'not the declared entry');
  writeFileSync(join(bin, 'another.cmd'), '@echo off\r\nnode "%dp0%..\\dist\\nested\\cli\\commands\\main.mjs" %*\r\n');
  assert.deepEqual(inspectProgram(agent, bin, { win: true }), { ok: true, path: file });
});


test('folder discovery keeps declared alias priority when more than one valid command exists', (t) => {
  const { dir, file } = fixture(t, { entry: 'first', bin: { first: 'first', second: 'second' } });
  writeFileSync(join(dir, 'second'), '', { mode: 0o755 });
  const definition = { ...agent, names: ['first', 'second'] };
  assert.equal(inspectProgram(definition, dir, { win: false }).path, file);
});


test('bin names follow Windows case-insensitivity without changing Unix identity rules', (t) => {
  const { file } = fixture(t, { bin: { ANOTHER: 'dist/nested/cli/commands/main.mjs' } });
  assert.equal(inspectProgram(agent, file, { win: true }).ok, true);
  assert.equal(inspectProgram(agent, file, { win: false }).code, 'identity-mismatch');
});

test('ordinary programs keep their direct, app-Node and Windows-shim launch modes', (t) => {
  const { file } = fixture(t, { entry: 'native' });
  const definition = { label: 'Native agent', names: ['native'] };
  assert.deepEqual(inspectProgram(definition, file), { ok: true, path: file });
  assert.deepEqual(launchProgram(definition, file, ['acp'], {}), { cmd: file, args: ['acp'], env: {}, options: {} });
  const script = launchProgram(definition, file + '.mjs', ['acp'], {});
  assert.ok(script.args[0].endsWith('as-node.mjs'));
  assert.deepEqual(script.args.slice(1), [file + '.mjs', 'acp']);
  assert.equal(script.env.ELECTRON_RUN_AS_NODE, '1');
  const shim = launchProgram(definition, 'C:/Program Files/agent.cmd', ['--acp'], {}, { win: true });
  assert.equal(shim.options.windowsVerbatimArguments, true);
  assert.deepEqual(shim.args.slice(0, 3), ['/d', '/s', '/c']);
});
