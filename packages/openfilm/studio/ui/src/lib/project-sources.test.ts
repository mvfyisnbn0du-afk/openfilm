import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SourceError, createSpeedMeter, examplesCollapsed, fetchErrorKey, followFetch, formatBytes, formatSeconds, looksLikeRepoUrl,
  pathCrumbs, secondsLeft, setExamplesCollapsed, type FetchJob,
  SKILLS_CHANGED, watchSkills, type SkillEntry,
} from './project-sources.ts';

test('an open skills gallery reloads the current project after an addition and stops when closed', async (t) => {
  const events = new EventTarget();
  const lists: SkillEntry[][] = [];
  const paths: string[] = [];
  let skills: SkillEntry[] = [];
  t.mock.method(globalThis, 'fetch', async (path: string) => {
    paths.push(path);
    return new Response(JSON.stringify({ skills }));
  });
  const stop = watchSkills('film 1', (list) => lists.push(list), events);
  await new Promise(setImmediate);
  assert.deepEqual(lists, [[]]);
  skills = [{ name: 'new-skill', description: 'Added', source: 'mine', scripts: 0 }];
  events.dispatchEvent(new Event(SKILLS_CHANGED));
  await new Promise(setImmediate);
  assert.deepEqual(lists.at(-1), skills);
  assert.deepEqual(paths, ['/api/skills?project=film%201', '/api/skills?project=film%201']);
  stop();
  events.dispatchEvent(new Event(SKILLS_CHANGED));
  await new Promise(setImmediate);
  assert.equal(paths.length, 2);
});

test('a pre-addition request or closed gallery cannot publish a stale list', async (t) => {
  const events = new EventTarget();
  const pending: Array<(response: Response) => void> = [];
  t.mock.method(globalThis, 'fetch', () => new Promise<Response>((resolve) => pending.push(resolve)));
  const lists: SkillEntry[][] = [];
  const stop = watchSkills(null, (list) => lists.push(list), events);
  events.dispatchEvent(new Event(SKILLS_CHANGED));
  const added: SkillEntry[] = [{ name: 'added', description: '', source: 'mine', scripts: 0 }];
  pending[1]!(new Response(JSON.stringify({ skills: added })));
  await new Promise(setImmediate);
  pending[0]!(new Response(JSON.stringify({ skills: [] })));
  await new Promise(setImmediate);
  assert.deepEqual(lists, [added]);
  events.dispatchEvent(new Event(SKILLS_CHANGED));
  stop();
  pending[2]!(new Response(JSON.stringify({ skills: [] })));
  await new Promise(setImmediate);
  assert.deepEqual(lists, [added]);
});

test('what looks like a repository address enables "Get"', () => {
  assert.ok(looksLikeRepoUrl('https://github.com/openfilm/examples/tree/main/one-prompt'));
  assert.ok(looksLikeRepoUrl('  github.com/openfilm/examples '));
  assert.ok(looksLikeRepoUrl('https://gitlab.com/group/film'));
  assert.ok(!looksLikeRepoUrl('https://github.com/openfilm'));
  assert.ok(!looksLikeRepoUrl('https://example.com/a/b'));
  assert.ok(!looksLikeRepoUrl(''));
});

test('sizes and lengths as people read them', () => {
  assert.equal(formatBytes(0), '0 KB');
  assert.equal(formatBytes(51_452), '50 KB');
  assert.equal(formatBytes(12.4 * 1024 * 1024), '12.4 MB');
  assert.equal(formatBytes(1.25 * 1024 ** 3), '1.3 GB');
  assert.equal(formatSeconds(89), '1:29');
  assert.equal(formatSeconds(5.6), '0:06');
});

test('a download\'s speed is what came over the last few seconds; the time left follows from it', () => {
  const speed = createSpeedMeter(5000);
  assert.equal(speed(0, 0), null, 'nothing to go on yet');
  assert.equal(speed(500_000, 500), null, 'under a second');
  assert.equal(speed(1_000_000, 1000), 1_000_000);
  for (let s = 2; s <= 10; s++) speed(1_000_000 * s, s * 1000);
  /* it stalls: within the window the speed falls, it does not keep the old average */
  assert.equal(speed(10_000_000, 14_000), 1_000_000 * 1 / 5);
  assert.equal(speed(10_000_000, 16_000), 0);
  /* fewer bytes: another download, measured afresh */
  assert.equal(speed(0, 17_000), null);
  assert.equal(secondsLeft(2_000_000, 10_000_000, 1_000_000), 8);
  assert.equal(secondsLeft(2_000_000, null, 1_000_000), null, 'no total');
  assert.equal(secondsLeft(2_000_000, 10_000_000, 0), null, 'nothing coming');
});

test('breadcrumbs from the home folder, on macOS, Linux and Windows paths', () => {
  assert.deepEqual(pathCrumbs('/Volumes/work/Movies/Films', '/Volumes/work'), [
    { name: '~', path: '/Volumes/work' }, { name: 'Movies', path: '/Volumes/work/Movies' }, { name: 'Films', path: '/Volumes/work/Movies/Films' },
  ]);
  assert.deepEqual(pathCrumbs('/srv/me', '/srv/me', 'me'), [{ name: 'me', path: '/srv/me' }]);
  assert.deepEqual(pathCrumbs('D:\\work\\Videos', 'D:\\work').map((c) => c.path), ['D:\\work', 'D:\\work\\Videos']);
  /* a folder beside the root that starts with its name is not in it */
  assert.deepEqual(pathCrumbs('/Volumes/work/Films-old/x', '/Volumes/work/Films'), [{ name: '/Volumes/work/Films-old/x', path: '/Volumes/work/Films-old/x' }]);
});

test('each failure code has its own words; others say the server\'s message', () => {
  assert.equal(fetchErrorKey('no-film'), 'projects.fetch.error.noFilm');
  assert.equal(fetchErrorKey('access'), 'projects.fetch.error.access');
  assert.equal(fetchErrorKey('too-big'), 'projects.fetch.error.tooBig');
  assert.equal(fetchErrorKey('failed'), null);
  assert.equal(fetchErrorKey(undefined), null);
});

const job = (over: Partial<FetchJob> = {}): FetchJob => ({ id: 'j', url: 'u', label: 'o/r', state: 'running', phase: 'lookup', percent: null, bytes: 0, total: null, ...over });
const now = () => Promise.resolve();

test('a fetch is followed until it is done, each state told', async () => {
  const answers = [job({ phase: 'download', bytes: 10 }), job({ phase: 'copy', bytes: 20 }), job({ state: 'done', project: { id: 'p' } })];
  const seen: string[] = [];
  const { done } = followFetch(job(), (j) => seen.push(`${j.state}:${j.phase}`), { get: async () => answers.shift()!, wait: now });
  assert.equal((await done)?.project?.id, 'p');
  assert.deepEqual(seen, ['running:lookup', 'running:download', 'running:copy', 'done:lookup']);
});

test('a job Studio no longer knows has ended; a few missed answers are waited out', async () => {
  let calls = 0;
  const flaky = async () => { calls += 1; if (calls < 3) throw new Error('down'); return job({ state: 'failed', code: 'no-film' }); };
  assert.equal((await followFetch(job(), () => {}, { get: flaky, wait: now }).done)?.code, 'no-film');
  const gone = async (): Promise<FetchJob> => { throw new SourceError('No such fetch.', 404, 'none'); };
  assert.equal((await followFetch(job(), () => {}, { get: gone, wait: now }).done)?.code, 'lost');
});

test('stopped, it tells nothing more', async () => {
  const seen: FetchJob[] = [];
  const follow = followFetch(job(), (j) => seen.push(j), { get: async () => job({ state: 'done' }), wait: now });
  follow.stop();
  assert.equal(await follow.done, null);
  assert.equal(seen.length, 1);
});

test('the examples\' fold is kept, and a storage that throws is no fold', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  assert.equal(examplesCollapsed(storage), false);
  setExamplesCollapsed(storage, true);
  assert.equal(examplesCollapsed(storage), true);
  setExamplesCollapsed(storage, false);
  assert.equal(examplesCollapsed(storage), false);
  assert.equal(examplesCollapsed({ getItem: () => { throw new Error('blocked'); } }), false);
  assert.equal(examplesCollapsed(null), false);
});
