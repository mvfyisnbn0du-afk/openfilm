import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';

const bridgeSource = readFileSync(new URL('../shell/bridge.ts', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../../../packages/openfilm/studio/ui/src/api.ts', import.meta.url), 'utf8');

// Run the real bridge and API together; only their native, DOM and network boundaries are replaced.
function loadSource(context, source) {
  const js = stripTypeScriptTypes(source.replace(/^import .*;\n/gm, ''), { mode: 'transform' });
  vm.runInContext(js.replace(/^export /gm, '').replace(/^\{\s*\};?$/gm, ''), context);
}
function harness() {
  const requests = [];
  const events = new Map();
  const element = () => ({ style: {}, dataset: {}, toggleAttribute() {} });
  const location = { pathname: '/projects/a' };
  const native = {
    platform: 'linux',
    hello: async () => ({ chatOpen: true, chatWidth: 420, chatMin: 340, studioMin: 640, fullScreen: false }),
    agents: {}, localAgents: {}, chat: {}, skills: {},
    setTheme() {}, onFullScreen() {}, onToggleChat() {},
  };
  const context = vm.createContext({
    window: { openfilmNative: native },
    location,
    history: Object.fromEntries(['pushState', 'replaceState'].map((method) => [method, (_state, _title, url) => { location.pathname = url; }])),
    document: { documentElement: element(), getElementById: element, createElement: element, head: { append() {} } },
    MutationObserver: class { observe() {} },
    innerWidth: 1280,
    addEventListener: (name, listener) => events.set(name, listener),
    flushSync: (fn) => fn(),
    fetch: (url, init) => new Promise((resolve) => {
      requests.push({ url, init, respond: (body, status = 200) => resolve({ ok: status < 400, status, json: async () => body }) });
    }),
  });
  loadSource(context, bridgeSource);
  context.studioHost = context.window.openfilmHost;
  loadSource(context, apiSource);
  const api = vm.runInContext('api', context);
  const bridge = context.window.openfilmDesktop;
  const changed = [];
  bridge.onProject((project) => changed.push({ ...project }));
  return { api, bridge, native, requests, changed, navigate: (path) => context.history.pushState(null, '', path) };
}
const project = (name = 'Untitled', id = 'a') => ({ id, name, path: `/projects/${name}`, openedAt: 1, missing: false });
const shown = (p) => ({ id: p.id, name: p.name, path: p.path });
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function opened(h) {
  h.requests[0].respond({ projects: [project()] });
  await h.bridge.hello();
}

test('a confirmed rename updates the existing chat immediately, ahead of its pending project lookup', async () => {
  const h = harness();
  const chat = h.bridge.chat;
  const renamed = project('My film');
  const rename = h.api.rename('a', renamed.name);
  assert.equal(h.requests[1].url, '/api/projects/a');
  assert.equal(h.requests[1].init.method, 'PATCH');
  h.requests[1].respond({ project: renamed });
  assert.equal((await rename).path, renamed.path);
  assert.deepEqual(h.changed, [shown(renamed)]);
  h.requests[0].respond({ projects: [project()] });
  assert.deepEqual({ ...(await h.bridge.hello()).project }, shown(renamed));
  assert.equal(h.bridge.chat, chat, 'the same chat bridge stays attached');
});

test('a film read begun before rename cannot restore the old folder; a later refresh updates it', async () => {
  const h = harness();
  await opened(h);
  const oldFilm = h.api.film('a');
  const rename = h.api.rename('a', 'My film');
  h.requests[2].respond({ project: project('My film') });
  await rename;
  h.requests[1].respond({ project: project(), text: '' });
  await oldFilm;
  assert.deepEqual({ ...(await h.bridge.hello()).project }, shown(project('My film')));

  const refreshed = h.api.film('a');
  h.requests[3].respond({ project: project('Renamed elsewhere'), text: '' });
  await refreshed;
  assert.deepEqual({ ...(await h.bridge.hello()).project }, shown(project('Renamed elsewhere')));
  assert.deepEqual(h.changed.map((p) => p.name), ['Untitled', 'My film', 'Renamed elsewhere']);
});

test('the newest completed film read wins when replies arrive out of order', async () => {
  const h = harness();
  await opened(h);
  const older = h.api.film('a');
  const newer = h.api.film('a');
  h.requests[2].respond({ project: project('Latest'), text: '' });
  await newer;
  h.requests[1].respond({ project: project('Older'), text: '' });
  await older;
  assert.deepEqual({ ...(await h.bridge.hello()).project }, shown(project('Latest')));
});

test('an earlier project-list response cannot replace the project reached by navigation', async () => {
  const h = harness();
  h.navigate('/projects/b');
  h.requests[1].respond({ projects: [project('Project B', 'b')] });
  await h.bridge.hello();
  h.requests[0].respond({ projects: [project()] });
  await tick();
  assert.deepEqual(h.changed, [shown(project('Project B', 'b'))]);
  assert.deepEqual({ ...(await h.bridge.hello()).project }, shown(project('Project B', 'b')));
});

test('rename and film replies for a previous project cannot replace the newly opened project', async () => {
  const h = harness();
  await opened(h);
  const oldFilm = h.api.film('a');
  const rename = h.api.rename('a', 'Renamed A');
  h.navigate('/projects/b');
  h.requests[3].respond({ projects: [project('Project B', 'b')] });
  await h.bridge.hello();
  h.requests[2].respond({ project: project('Renamed A') });
  h.requests[1].respond({ project: project(), text: '' });
  await Promise.all([rename, oldFilm]);
  assert.deepEqual({ ...(await h.bridge.hello()).project }, shown(project('Project B', 'b')));
});

test('leaving and returning to a project invalidates reads from the earlier visit', async () => {
  const h = harness();
  await opened(h);
  const oldFilm = h.api.film('a');
  h.navigate('/');
  assert.equal((await h.bridge.hello()).project, null);
  h.navigate('/projects/a');
  h.requests[1].respond({ project: project('Earlier visit'), text: '' });
  await oldFilm;
  await tick();
  assert.deepEqual(h.changed.map((p) => p.name), ['Untitled']);
  h.requests[2].respond({ projects: [project('Current visit')] });
  assert.deepEqual({ ...(await h.bridge.hello()).project }, shown(project('Current visit')));
});

test('a refused rename leaves the chat path unchanged and preserves the reason for Studio', async () => {
  const h = harness();
  await opened(h);
  const rename = h.api.rename('a', 'My film');
  h.requests[1].respond({ error: 'Stop the agent first.', code: 'agent-running' }, 409);
  await assert.rejects(rename, (error) => error.status === 409 && error.body.code === 'agent-running');
  assert.deepEqual(h.changed, [shown(project())]);
});
