import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { planNleTimeline } from './nle.mjs';
import { jianyingDraft, jianyingDraftsRoot } from './jianying.mjs';

const facts = { w: 960, h: 540, duration: 10, hasVideo: true, hasAudio: true, channels: 2, sampleRate: 48000 };
const sound = { duration: 20, hasVideo: false, hasAudio: true, channels: 2, sampleRate: 48000 };

/** A film: a page over footage placed small, its own sound, music fading in on a muted track's neighbour, a still. */
const plan = (/** @type {Partial<{ musicOn: boolean }>} */ o = {}) => planNleTimeline({
  stage: { w: 1920, h: 1080 }, duration: 6,
  pictures: [
    { id: 'title', kind: 'page', src: 'title.html', path: '/p/title.html', at: 0, end: 2, from: 0, speed: 1, track: 0, hidden: false, facts: null },
    { id: 'shot', kind: 'video', src: 'a.mp4', path: '/p/a.mp4', at: 1, end: 5, from: 2, speed: 1, track: 1, hidden: false, box: { x: 480, y: 0, w: 960 }, facts },
    { id: 'still', kind: 'still', src: 'b.png', path: '/p/b.png', at: 5, end: 6, from: 0, speed: 1, track: 1, hidden: true, facts: { w: 1920, h: 1080 } },
  ],
  sounds: [
    { id: 'shot', src: 'a.mp4', path: '/p/a.mp4', at: 1, from: 2, to: 6, speed: 1, volume: 0.5, enabled: true, role: 'footage', picture: 'shot', facts },
    { id: 'bed', src: 'assets/audio/music/bed.wav', path: '/p/bed.wav', at: 0, from: 0, to: 6, speed: 1, volume: 0.8, enabled: o.musicOn ?? true, role: 'music', facts: sound, fade: [1, 0] },
  ],
}, { title: 'Film', fps: 30, audio: 'clips', media: 'copy', mediaDir: '/drafts/Film/media' });

test('a 剪映 draft: microseconds edge by edge, the plan\'s tracks, bottom first, as 剪映 stacks them', () => {
  const { info, meta } = jianyingDraft(plan(), { name: 'Film', folder: '/drafts/Film', root: '/drafts', now: 1_700_000_000_000 });
  assert.deepEqual(info.canvas_config, { width: 1920, height: 1080, ratio: 'original' });
  assert.equal(info.fps, 30);
  assert.equal(info.duration, 6_000_000);
  assert.deepEqual(info.tracks.map((t) => t.type), ['video', 'video', 'audio']);
  /* the film's second track is under its first: 剪映's first video track is the bottom one */
  const [bottom, top] = info.tracks;
  assert.deepEqual(bottom.segments.map((s) => s.target_timerange), [{ start: 1_000_000, duration: 4_000_000 }, { start: 5_000_000, duration: 1_000_000 }]);
  assert.deepEqual(top.segments[0].target_timerange, { start: 0, duration: 2_000_000 });
  /* footage from its second 2 */
  assert.deepEqual(bottom.segments[0].source_timerange, { start: 2_000_000, duration: 4_000_000 });
  assert.equal(meta.draft_name, 'Film');
  assert.equal(meta.draft_fold_path, '/drafts/Film');
  assert.equal(meta.draft_root_path, '/drafts');
  assert.equal(meta.draft_id, info.id);
  assert.equal(meta.tm_duration, 6_000_000);
});

test('placement: fitted in the canvas, then the plan\'s scale; moved in half-canvas units, y upward', () => {
  const { info } = jianyingDraft(plan(), { name: 'Film', folder: '/d/Film', root: '/d' });
  const shot = info.tracks[0].segments[0];
  /* 960 × 540 at its own size is half of a 1920 × 1080 canvas it would fill: scale 0.5; its middle a quarter up */
  assert.deepEqual(shot.clip.scale, { x: 0.5, y: 0.5 });
  assert.deepEqual(shot.clip.transform, { x: 0, y: 0.5 });
  /* the page fills the canvas as it is */
  assert.deepEqual(info.tracks[1].segments[0].clip.scale, { x: 1, y: 1 });
  const still = info.tracks[0].segments[1];
  assert.equal(still.visible, false, 'a hidden track\'s clip comes hidden');
  const photo = info.materials.videos.find((m) => m.id === still.material_id);
  assert.equal(photo.type, 'photo');
  assert.deepEqual(still.source_timerange, { start: 0, duration: 1_000_000 });
});

test('footage plays its own sound at its level; other sounds are audio clips with 剪映\'s fades', () => {
  const { info } = jianyingDraft(plan(), { name: 'Film', folder: '/d/Film', root: '/d' });
  const shot = info.tracks[0].segments[0];
  assert.equal(shot.volume, 0.5);
  const audio = info.tracks.filter((t) => t.type === 'audio');
  assert.equal(audio.length, 1, 'the footage\'s sound is not a second clip');
  const bed = audio[0].segments[0];
  assert.equal(bed.volume, 0.8);
  const fade = info.materials.audio_fades.find((f) => bed.extra_material_refs.includes(f.id));
  assert.equal(fade.fade_in_duration, 1_000_000);
  assert.equal(fade.fade_out_duration, 0);
  for (const s of info.tracks.flatMap((t) => t.segments)) {
    assert.ok(s.extra_material_refs.some((id) => info.materials.speeds.some((m) => m.id === id)), 'each clip has its speed');
  }
  /* each file one material */
  assert.equal(new Set(info.materials.videos.map((m) => m.path)).size, info.materials.videos.length);
  const silent = jianyingDraft(plan({ musicOn: false }), { name: 'Film', folder: '/d/Film', root: '/d' });
  assert.equal(silent.info.tracks.find((t) => t.type === 'audio').segments[0].volume, 0, 'a sound not heard comes silent');
});

test('subtitles: a text track over all, one clip a cue, white with a dark edge, low in the picture', () => {
  const { info } = jianyingDraft(plan(), { name: 'Film', folder: '/d/Film', root: '/d', cues: [{ text: '你好 world', startMs: 500, durMs: 1500 }, { text: ' ', startMs: 2000, durMs: 500 }] });
  const text = info.tracks.at(-1);
  assert.equal(text.type, 'text');
  assert.equal(text.segments.length, 1, 'an empty cue is left out');
  assert.deepEqual(text.segments[0].target_timerange, { start: 500_000, duration: 1_500_000 });
  assert.equal(text.segments[0].clip.transform.y, -0.8);
  const content = JSON.parse(info.materials.texts[0].content);
  assert.equal(content.text, '你好 world');
  assert.deepEqual(content.styles[0].range, [0, 8]);
  assert.deepEqual(content.styles[0].strokes[0].content.solid.color, [0, 0, 0]);
});

test('剪映\'s drafts folder: where it keeps them on a Mac and on Windows, when it is there', () => {
  const mac = join('/mac-home', 'Movies', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft');
  assert.equal(jianyingDraftsRoot({ platform: 'darwin', home: '/mac-home', exists: (p) => p === mac }), mac);
  assert.equal(jianyingDraftsRoot({ platform: 'darwin', home: '/mac-home', exists: () => false }), null);
  const win = join('D:\\local-app-data', 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft');
  assert.equal(jianyingDraftsRoot({ platform: 'win32', home: 'D:\\win-home', localAppData: 'D:\\local-app-data', exists: (p) => p === win }), win);
  assert.equal(jianyingDraftsRoot({ platform: 'linux', home: '/linux-home', exists: () => true }), null);
});
