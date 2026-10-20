import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  writeFileSync(join(source, 'openfilm.json'), '{"cover":"original.png","custom":"keep me"}');
  writeFileSync(join(source, 'original.png'), 'original asset');
  const studio = await startStudio({ port: 0, openBrowser: () => {} });
  t.after(() => studio.close());
  const api = (path, { method = 'GET', body } = {}) => fetch(studio.origin + path, {
    method, headers: { 'x-studio-key': studio.key, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
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
  const endpoint = '/api/skills/covered/cover';
  const replacement = await api(endpoint, { method: 'PUT', body: { cover: `data:image/png;base64,${covers[0]}` } });
  assert.equal(replacement.status, 200);
  const changed = await replacement.json();
  assert.notEqual(changed.cover, urls[1]);
  assert.deepEqual(Buffer.from(await (await api(changed.cover)).arrayBuffer()), Buffer.from(covers[0], 'base64'));
  const invalid = await api(endpoint, { method: 'PUT', body: { cover: 'data:image/png;base64,bm90IGEgcG5n' } });
  assert.equal(invalid.status, 400);
  assert.equal((await api(endpoint, { method: 'PUT', body: {} })).status, 400);
  assert.deepEqual(Buffer.from(await (await api(endpoint)).arrayBuffer()), Buffer.from(covers[0], 'base64'));
  const removed = await api(endpoint, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal((await removed.json()).cover, null);
  assert.equal((await api(endpoint)).status, 404);
  const installed = join(variables.OPENFILM_SKILLS, 'covered');
  assert.deepEqual(JSON.parse(readFileSync(join(installed, 'openfilm.json'), 'utf8')), { custom: 'keep me' });
  assert.ok(existsSync(join(installed, 'original.png')), 'removal preserves the original asset');
  assert.equal(readFileSync(join(installed, 'SKILL.md'), 'utf8'), readFileSync(join(source, 'SKILL.md'), 'utf8'));
  const { skills } = await (await api('/api/skills')).json();
  assert.equal(skills.find((s) => s.name === 'covered').cover, undefined, 'removal persists when listed again');
  const official = skills.find((s) => s.source === 'official');
  assert.ok(official);
  assert.equal((await api(`/api/skills/${official.name}/cover`, { method: 'DELETE' })).status, 403);
  assert.equal((await api('/api/skills/missing-skill/cover', { method: 'DELETE' })).status, 404);
  const project = (await (await api('/api/projects', { method: 'POST', body: { name: 'Override' } })).json()).project;
  mkdirSync(join(project.path, 'skills', 'covered'), { recursive: true });
  writeFileSync(join(project.path, 'skills', 'covered', 'SKILL.md'), '---\nname: covered\n---\nProject steps.');
  assert.equal((await api(`${endpoint}?project=${project.id}`, { method: 'DELETE' })).status, 403);
});
