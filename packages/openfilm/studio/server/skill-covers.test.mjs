import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addSkills } from '../../src/skills.mjs';
import { startStudio } from './server.mjs';

test('a replacement skill cover has a new gallery URL and serves the chosen bytes', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'of-skill-gallery-'));
  const variables = { OPENFILM_HOME: join(root, 'home'), OPENFILM_LIBRARY: join(root, 'library'), OPENFILM_SKILLS: join(root, 'mine'), OPENFILM_TRASH_DIR: join(root, 'trash') };
  const previous = Object.fromEntries(Object.keys(variables).map((key) => [key, process.env[key]]));
  Object.assign(process.env, variables);
  mkdirSync(variables.OPENFILM_TRASH_DIR);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    rmSync(root, { recursive: true, force: true });
  });
  const source = join(root, 'source');
  mkdirSync(source);
  writeFileSync(join(source, 'SKILL.md'), '---\nname: covered\ndescription: A cover\n---\nSteps.');
  const studio = await startStudio({ port: 0, openBrowser: () => {} });
  t.after(() => studio.close());
  const api = (path) => fetch(studio.origin + path, { headers: { 'x-studio-key': studio.key } });
  const covers = [
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ];
  const urls = [];
  for (const picture of covers) {
    await addSkills(source, { covers: { covered: `data:image/png;base64,${picture}` } });
    const { skills } = await (await api('/api/skills')).json();
    const url = skills.find((s) => s.name === 'covered').cover;
    urls.push(url);
    const response = await api(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from(picture, 'base64'));
  }
  assert.notEqual(urls[0], urls[1], 'the browser must not reuse its cached previous cover');
});
