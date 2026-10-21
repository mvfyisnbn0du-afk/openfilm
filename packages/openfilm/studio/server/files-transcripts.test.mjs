import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { filmHtml, readFilmFile } from '../../src/film-doc.mjs';
import { filmCaptions } from './captions.mjs';
import { FileError, moveFile } from './files.mjs';
import { CUT_NOTE, transcriptPath } from './transcripts.mjs';

const MEDIA = Buffer.from('the original media bytes');
const ORIGINAL = Buffer.from(`\ufeffWEBVTT\r\n\r\nNOTE Keep this production note exactly.\r\n\r\n${CUT_NOTE}\r\n\r\ncue-1\r\n00:00:00.125 --> 00:00:01.875 align:start\r\n<v Ann><00:00:00.125>Hello <00:00:00.875>world.\r\n`);
const FRENCH = Buffer.from('WEBVTT\n\nNOTE French translation.\n\n00:00:00.125 --> 00:00:01.875\nBonjour le monde.\n');
const CHINESE = Buffer.from('WEBVTT\r\n\r\n00:00:00.125 --> 00:00:01.875\r\n你好，世界。\r\n');
const TRANSCRIPTS = new Map([['', ORIGINAL], ['fr', FRENCH], ['zh-CN', CHINESE]]);
const NO_PROBE = { duration: async () => 2 };
const LINKS = { skip: process.platform === 'win32' && 'links need Developer Mode on Windows' };

function put(root, rel, body) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
}

function project(t, sources = ['assets/voice.wav']) {
  const root = mkdtempSync(join(tmpdir(), 'of-files-transcripts-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const src of sources) put(root, src, MEDIA);
  put(root, 'film.html', filmHtml({
    stage: { w: 320, h: 180 },
    tracks: [{ clips: sources.map((src, index) => ({ id: `clip-${index}`, src, at: index * 3, time: [0, 2] })) }],
  }));
  return root;
}

function putTranscripts(root, src) {
  for (const [language, bytes] of TRANSCRIPTS) put(root, transcriptPath(src, language || undefined), bytes);
}

function assertTranscriptBytes(root, src) {
  for (const [language, bytes] of TRANSCRIPTS) {
    const rel = transcriptPath(src, language || undefined);
    assert.deepEqual(readFileSync(join(root, rel)), bytes, rel);
  }
}

function assertNoTranscripts(root, src) {
  for (const language of TRANSCRIPTS.keys()) {
    const rel = transcriptPath(src, language || undefined);
    assert.equal(existsSync(join(root, rel)), false, rel);
  }
}

function filmSources(root) {
  return readFilmFile(readFileSync(join(root, 'film.html'), 'utf8')).value.tracks.flatMap((track) => track.clips.map((clip) => clip.src));
}

async function captionSnapshot(root) {
  const captions = await filmCaptions(root, NO_PROBE);
  return { ...captions, cues: captions.cues.map(({ src, ...cue }) => cue) };
}

for (const [kind, from, to] of [
  ['audio renamed in place', 'assets/voice.wav', 'assets/narration.wav'],
  ['video moved to another folder', 'assets/voice.mp4', 'assets/cuts/interview.mp4'],
]) {
  test(`${kind} keeps its transcript and translations, byte for byte and on the film`, async (t) => {
    const root = project(t, [from]);
    putTranscripts(root, from);
    for (const suffix of ['notes.vtt', 'x.vtt', 'zh_CN.vtt', 'fr.txt']) put(root, `assets/voice.${suffix}`, 'unrelated');
    put(root, 'assets/voice.txt', 'not another media file');
    const before = await captionSnapshot(root);
    assert.equal(before.cues.length, 1);
    assert.deepEqual([...before.languages].sort(), ['fr', 'zh-CN']);
    assert.ok(before.cues[0].alt?.fr);
    assert.ok(before.cues[0].alt?.['zh-CN']);

    assert.deepEqual(await moveFile(root, from, to), { path: to, clips: 1, pages: 0 });

    assert.equal(existsSync(join(root, from)), false);
    assert.deepEqual(readFileSync(join(root, to)), MEDIA);
    assertTranscriptBytes(root, to);
    assertNoTranscripts(root, from);
    assert.deepEqual(filmSources(root), [to]);
    assert.deepEqual(await captionSnapshot(root), before);
    assert.deepEqual((await filmCaptions(root, NO_PROBE)).cues.map((cue) => cue.src), [to]);
    for (const suffix of ['notes.vtt', 'x.vtt', 'zh_CN.vtt', 'fr.txt']) {
      assert.equal(readFileSync(join(root, `assets/voice.${suffix}`), 'utf8'), 'unrelated');
      assert.equal(existsSync(join(root, `assets/${kind.startsWith('audio') ? 'narration' : 'cuts/interview'}.${suffix}`)), false);
    }
  });
}

test('moving one of two audio/video files with the same stem copies their shared transcripts', async (t) => {
  const from = 'assets/voice.wav', other = 'assets/voice.mp4', to = 'assets/voiceover/narration.wav';
  const root = project(t, [from, other]);
  putTranscripts(root, from);
  const before = await captionSnapshot(root);
  assert.equal(before.cues.length, 2);

  await moveFile(root, from, to);

  assertTranscriptBytes(root, from);
  assertTranscriptBytes(root, to);
  assert.deepEqual(readFileSync(join(root, other)), MEDIA);
  assert.equal(existsSync(join(root, from)), false);
  assert.deepEqual(filmSources(root), [to, other]);
  assert.deepEqual(await captionSnapshot(root), before);
});

for (const [from, other] of [
  ['assets/voice.wav', 'assets/voice.fr.wav'],
  ['assets/voice.fr.wav', 'assets/voice.wav'],
]) {
  test(`renaming ${from} keeps a sidecar used as another media file's transcript or translation`, async (t) => {
    const to = 'assets/narration.wav';
    const root = project(t, [from, other]);
    put(root, 'assets/voice.vtt', ORIGINAL);
    put(root, 'assets/voice.fr.vtt', FRENCH);
    const before = await captionSnapshot(root);
    assert.equal(before.cues.length, 2);
    assert.deepEqual(before.languages, ['fr']);

    await moveFile(root, from, to);

    assert.deepEqual(await captionSnapshot(root), before);
    assert.deepEqual(readFileSync(join(root, 'assets/voice.vtt')), ORIGINAL);
    assert.deepEqual(readFileSync(join(root, 'assets/voice.fr.vtt')), FRENCH);
    assert.deepEqual(readFileSync(join(root, transcriptPath(to))), from === 'assets/voice.wav' ? ORIGINAL : FRENCH);
    assert.deepEqual(readFileSync(join(root, other)), MEDIA);
    assert.deepEqual(filmSources(root), [to, other]);
    assert.equal(existsSync(join(root, from)), false);
  });
}

test('different media entries sharing one inode still keep their shared sidecars', async (t) => {
  const from = 'assets/voice.wav', other = 'assets/voice.mp4', to = 'assets/narration.wav';
  const root = project(t, [from, other]);
  rmSync(join(root, other));
  linkSync(join(root, from), join(root, other));
  assert.equal(statSync(join(root, from)).ino, statSync(join(root, other)).ino);
  putTranscripts(root, from);
  const before = await captionSnapshot(root);

  await moveFile(root, from, to);

  assertTranscriptBytes(root, from);
  assertTranscriptBytes(root, to);
  assert.deepEqual(await captionSnapshot(root), before);
});

for (const shared of [false, true]) {
  test(`a failed media rename restores ${shared ? 'copied shared' : 'moved unique'} transcripts and leaves the film unchanged`, async (t) => {
    const from = 'assets/voice.wav', to = 'assets/edited/narration.wav';
    const sources = shared ? [from, 'assets/voice.mp4'] : [from];
    const root = project(t, sources);
    putTranscripts(root, from);
    const film = readFileSync(join(root, 'film.html'));
    const before = await captionSnapshot(root);
    const rename = fsPromises.rename;
    const denied = Object.assign(new Error('The media file is locked'), { code: 'EACCES' });
    let mediaRenameAttempted = false;
    let sidecarsBeforeFailure;
    t.mock.method(fsPromises, 'rename', async (source, destination, ...args) => {
      if (source === join(root, from) && destination === join(root, to)) {
        mediaRenameAttempted = true;
        sidecarsBeforeFailure = [...TRANSCRIPTS.keys()].map((language) => ({
          original: existsSync(join(root, transcriptPath(from, language || undefined))),
          destination: existsSync(join(root, transcriptPath(to, language || undefined))),
        }));
        throw denied;
      }
      return rename(source, destination, ...args);
    });
    syncBuiltinESMExports();
    try {
      await assert.rejects(moveFile(root, from, to), (error) => error === denied);
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
    }

    assert.equal(mediaRenameAttempted, true);
    assert.deepEqual(sidecarsBeforeFailure, [...TRANSCRIPTS].map(() => ({ original: shared, destination: true })));
    assert.deepEqual(readFileSync(join(root, from)), MEDIA);
    assert.equal(existsSync(join(root, to)), false);
    assertTranscriptBytes(root, from);
    assertNoTranscripts(root, to);
    assert.deepEqual(readFileSync(join(root, 'film.html')), film);
    assert.deepEqual(filmSources(root), sources);
    assert.deepEqual(await captionSnapshot(root), before);
  });
}

test('pages linking to a renamed video and its subtitle track follow both files', async (t) => {
  const root = project(t, ['assets/voice.mp4', 'scenes/title.html']);
  putTranscripts(root, 'assets/voice.mp4');
  put(root, 'scenes/title.html', '<video src="../assets/voice.mp4"><track src="../assets/voice.fr.vtt"></video>');

  const result = await moveFile(root, 'assets/voice.mp4', 'assets/interview.mp4');

  assert.equal(result.pages, 1);
  assert.equal(readFileSync(join(root, 'scenes/title.html'), 'utf8'), '<video src="../assets/interview.mp4"><track src="../assets/interview.fr.vtt"></video>');
  assertTranscriptBytes(root, 'assets/interview.mp4');
});

for (const language of ['', 'fr']) {
  for (const collision of ['file', 'directory']) {
    test(`a target ${language || 'original'} transcript ${collision} refuses the whole move before anything changes`, async (t) => {
      const from = 'assets/voice.wav', to = 'assets/cuts/narration.wav';
      const root = project(t, [from]);
      putTranscripts(root, from);
      const target = transcriptPath(to, language || undefined);
      const marker = collision === 'directory' ? `${target}/keep.txt` : target;
      put(root, marker, 'the existing target must survive');
      const film = readFileSync(join(root, 'film.html'));

      await assert.rejects(moveFile(root, from, to), (error) => error instanceof FileError && error.status === 409);

      assert.deepEqual(readFileSync(join(root, from)), MEDIA);
      assert.equal(existsSync(join(root, to)), false);
      assert.deepEqual(readFileSync(join(root, 'film.html')), film);
      assertTranscriptBytes(root, from);
      assert.equal(readFileSync(join(root, marker), 'utf8'), 'the existing target must survive');
      assert.equal(statSync(join(root, target)).isDirectory(), collision === 'directory');
      for (const alternative of TRANSCRIPTS.keys()) {
        const rel = transcriptPath(to, alternative || undefined);
        if (rel !== target) assert.equal(existsSync(join(root, rel)), false, `${rel} must not move before conflict checking finishes`);
      }
    });
  }
}

test('changing only the media extension keeps the same sidecars and subtitle choices', async (t) => {
  const from = 'assets/voice.wav', to = 'assets/voice.mp3';
  const root = project(t, [from]);
  putTranscripts(root, from);
  const before = await captionSnapshot(root);

  await moveFile(root, from, to);

  assertTranscriptBytes(root, to);
  assert.deepEqual(filmSources(root), [to]);
  assert.deepEqual(await captionSnapshot(root), before);
});

test('a destination translation absent from the source cannot become captions for the renamed media', async (t) => {
  const from = 'assets/voice.wav', to = 'assets/narration.wav';
  const root = project(t, [from]);
  putTranscripts(root, from);
  put(root, 'assets/narration.de.vtt', 'another recording');
  const film = readFileSync(join(root, 'film.html'));

  await assert.rejects(moveFile(root, from, to), (error) => error instanceof FileError && error.status === 409);

  assert.deepEqual(readFileSync(join(root, from)), MEDIA);
  assert.equal(existsSync(join(root, to)), false);
  assertTranscriptBytes(root, from);
  assert.deepEqual(readFileSync(join(root, 'film.html')), film);
  assert.equal(readFileSync(join(root, 'assets/narration.de.vtt'), 'utf8'), 'another recording');
});

test('a case-only media rename also changes the sidecar names and keeps subtitle choices', async (t) => {
  const from = 'assets/voice.wav', to = 'assets/Voice.wav';
  const root = project(t, [from]);
  putTranscripts(root, from);
  const before = await captionSnapshot(root);

  await moveFile(root, from, to);

  const names = readdirSync(join(root, 'assets'));
  for (const language of TRANSCRIPTS.keys()) {
    const suffix = language ? `.${language}` : '';
    assert.ok(names.includes(`Voice${suffix}.vtt`), `Voice${suffix}.vtt`);
    assert.equal(names.includes(`voice${suffix}.vtt`), false, `voice${suffix}.vtt`);
  }
  assertTranscriptBytes(root, to);
  assert.deepEqual(filmSources(root), [to]);
  assert.deepEqual(await captionSnapshot(root), before);
});

test('a case-only rename of shared-stem media keeps translated captions for both files', async (t) => {
  const from = 'assets/voice.wav', other = 'assets/voice.mp4', to = 'assets/Voice.wav';
  const root = project(t, [from, other]);
  putTranscripts(root, from);
  const before = await captionSnapshot(root);
  assert.equal(before.cues.length, 2);

  await moveFile(root, from, to);

  assertTranscriptBytes(root, other);
  assertTranscriptBytes(root, to);
  assert.deepEqual(filmSources(root), [to, other]);
  assert.deepEqual(await captionSnapshot(root), before);
});

test('moving a whole media folder keeps its nested transcripts, languages and translations', async (t) => {
  const from = 'assets/voices/take/voice.wav', to = 'assets/edited/take/voice.wav';
  const root = project(t, [from]);
  putTranscripts(root, from);
  const before = await captionSnapshot(root);

  await moveFile(root, 'assets/voices', 'assets/edited');

  assert.equal(existsSync(join(root, 'assets/voices')), false);
  assertTranscriptBytes(root, to);
  assert.deepEqual(filmSources(root), [to]);
  assert.deepEqual(await captionSnapshot(root), before);
});

test('moving media without subtitles still repoints the film and creates no sidecars', async (t) => {
  const from = 'assets/voice.wav', to = 'assets/edited/narration.wav';
  const root = project(t, [from]);

  assert.deepEqual(await moveFile(root, from, to), { path: to, clips: 1, pages: 0 });

  assert.deepEqual(readFileSync(join(root, to)), MEDIA);
  assert.equal(existsSync(join(root, from)), false);
  assertNoTranscripts(root, from);
  assertNoTranscripts(root, to);
  assert.deepEqual(filmSources(root), [to]);
});

for (const name of ['voice.VTT', 'VOICE.VTT']) {
  test(`renaming media follows ${name} only when its canonical subtitle path reads the same file`, async (t) => {
    const from = 'assets/voice.wav', to = 'assets/narration.wav';
    const root = project(t, [from]);
    put(root, `assets/${name}`, ORIGINAL);
    const readsCaseAlias = existsSync(join(root, 'assets/voice.vtt'));
    const before = await captionSnapshot(root);
    assert.equal(before.cues.length, readsCaseAlias ? 1 : 0);

    await moveFile(root, from, to);

    if (readsCaseAlias) {
      assert.deepEqual(await captionSnapshot(root), before);
      assert.deepEqual(readFileSync(join(root, 'assets/narration.vtt')), ORIGINAL);
      assert.equal(existsSync(join(root, `assets/${name}`)), false);
    } else {
      assert.equal((await filmCaptions(root, NO_PROBE)).cues.length, 0);
      assert.deepEqual(readFileSync(join(root, `assets/${name}`)), ORIGINAL);
      assert.equal(existsSync(join(root, 'assets/narration.vtt')), false);
    }
  });
}

test('page tracks follow canonical and mixed-case aliases of a moved subtitle on a disk that reads them', async (t) => {
  const root = project(t, ['assets/voice.mp4', 'scenes/title.html']);
  put(root, 'assets/VOICE.VTT', ORIGINAL);
  const alias = 'AsSeTs/VoIcE.vTt';
  if (!existsSync(join(root, alias))) { t.skip('this disk treats the filename as case-sensitive'); return; }
  put(root, 'other/voice.vtt', FRENCH);
  put(root, 'scenes/title.html', '<video src="../assets/voice.mp4"><track src="../assets/voice.vtt"><track src="../AsSeTs/VoIcE.vTt"><track src="../other/voice.vtt"></video>');
  assert.deepEqual(readFileSync(join(root, alias)), ORIGINAL);

  await moveFile(root, 'assets/voice.mp4', 'assets/narration.mp4');

  assert.equal(readFileSync(join(root, 'scenes/title.html'), 'utf8'), '<video src="../assets/narration.mp4"><track src="../assets/narration.vtt"><track src="../assets/narration.vtt"><track src="../other/voice.vtt"></video>');
  assert.deepEqual(readFileSync(join(root, 'assets/narration.vtt')), ORIGINAL);
  assert.deepEqual(readFileSync(join(root, 'other/voice.vtt')), FRENCH);
});

test('a source path using a case alias is not another neighboring media entry', async (t) => {
  const from = 'assets/voice.wav', alias = 'ASSETS/VOICE.WAV', to = 'assets/voice.en.wav';
  const root = project(t, [from]);
  if (!existsSync(join(root, alias))) { t.skip('this disk treats the filename as case-sensitive'); return; }
  putTranscripts(root, from);
  put(root, 'film.html', filmHtml({ stage: { w: 320, h: 180 }, tracks: [{ clips: [{ id: 'clip-0', src: alias, at: 0, time: [0, 2] }] }] }));
  const before = await captionSnapshot(root);

  await moveFile(root, alias, to);

  assertTranscriptBytes(root, to);
  assertNoTranscripts(root, from);
  assert.equal(existsSync(join(root, from)), false);
  assert.deepEqual(filmSources(root), [to]);
  assert.deepEqual(await captionSnapshot(root), before);
});

test('removing a language suffix moves its own sidecars instead of reporting them as target translations', async (t) => {
  const from = 'assets/interview.en.wav', to = 'assets/interview.wav';
  const root = project(t, [from]);
  putTranscripts(root, from);
  const before = await captionSnapshot(root);

  await moveFile(root, from, to);

  assertTranscriptBytes(root, to);
  assertNoTranscripts(root, from);
  assert.deepEqual(filmSources(root), [to]);
  assert.deepEqual(await captionSnapshot(root), before);
});

test('removing a language suffix still refuses a source sidecar that must stay shared', async (t) => {
  const from = 'assets/interview.en.wav', other = 'assets/interview.en.mp4', to = 'assets/interview.wav';
  const root = project(t, [from, other]);
  putTranscripts(root, from);
  const before = await captionSnapshot(root);
  const film = readFileSync(join(root, 'film.html'));

  await assert.rejects(moveFile(root, from, to), (error) => error instanceof FileError && error.status === 409);

  assertTranscriptBytes(root, from);
  assertNoTranscripts(root, to);
  assert.deepEqual(readFileSync(join(root, from)), MEDIA);
  assert.equal(existsSync(join(root, to)), false);
  assert.deepEqual(readFileSync(join(root, 'film.html')), film);
  assert.deepEqual(await captionSnapshot(root), before);
});

for (const [other, to, existing, translation] of [
  ['assets/interview.mp4', 'assets/interview.wav', undefined],
  ['assets/interview.wav', 'assets/interview.fr.wav', 'assets/interview.vtt'],
  ['assets/interview.fr.wav', 'assets/interview.wav', undefined, 'fr'],
]) {
  test(`a published sidecar cannot become another media file's captions or translation (${other})`, async (t) => {
    const from = 'assets/voice.wav';
    const root = project(t, [from, other]);
    put(root, 'assets/voice.vtt', ORIGINAL);
    if (translation) put(root, transcriptPath(from, translation), CHINESE);
    if (existing) put(root, existing, FRENCH);
    const before = await captionSnapshot(root);
    const film = readFileSync(join(root, 'film.html'));

    await assert.rejects(moveFile(root, from, to), (error) => error instanceof FileError && error.status === 409);

    assert.deepEqual(readFileSync(join(root, from)), MEDIA);
    assert.deepEqual(readFileSync(join(root, other)), MEDIA);
    assert.deepEqual(readFileSync(join(root, 'assets/voice.vtt')), ORIGINAL);
    if (translation) assert.deepEqual(readFileSync(join(root, transcriptPath(from, translation))), CHINESE);
    if (existing) assert.deepEqual(readFileSync(join(root, existing)), FRENCH);
    assert.equal(existsSync(join(root, to)), false);
    assert.equal(existsSync(join(root, transcriptPath(to))), false);
    if (translation) assert.equal(existsSync(join(root, transcriptPath(to, translation))), false);
    assert.deepEqual(readFileSync(join(root, 'film.html')), film);
    assert.deepEqual(await captionSnapshot(root), before);
  });
}

test('a relative transcript link inside the project is copied as bytes when its media moves across folders', LINKS, async (t) => {
  const from = 'assets/original/voice.wav', to = 'assets/edited/deep/narration.wav';
  const root = project(t, [from]);
  const linkedTranscript = transcriptPath(from);
  const target = 'transcripts/voice.vtt';
  const relativeTarget = '../../transcripts/voice.vtt';
  put(root, target, ORIGINAL);
  symlinkSync(relativeTarget, join(root, linkedTranscript));
  for (const [language, bytes] of TRANSCRIPTS) {
    if (language) put(root, transcriptPath(from, language), bytes);
  }
  const before = await captionSnapshot(root);

  await moveFile(root, from, to);

  assert.equal(lstatSync(join(root, linkedTranscript)).isSymbolicLink(), true);
  assert.equal(readlinkSync(join(root, linkedTranscript)), relativeTarget);
  assert.deepEqual(readFileSync(join(root, target)), ORIGINAL);
  assert.equal(lstatSync(join(root, transcriptPath(to))).isSymbolicLink(), false);
  assertTranscriptBytes(root, to);
  assert.equal(existsSync(join(root, from)), false);
  assert.deepEqual(readFileSync(join(root, to)), MEDIA);
  assert.deepEqual(filmSources(root), [to]);
  assert.deepEqual(await captionSnapshot(root), before);
});

for (const dangling of [false, true]) {
  test(`a ${dangling ? 'dangling' : 'live'} target transcript link outside the project cannot change external files`, LINKS, async (t) => {
    const from = 'assets/voice.wav', to = 'assets/narration.wav';
    const root = project(t, [from]);
    putTranscripts(root, from);
    const away = mkdtempSync(join(tmpdir(), 'of-transcripts-away-'));
    t.after(() => rmSync(away, { recursive: true, force: true }));
    const external = join(away, 'private.vtt');
    if (!dangling) writeFileSync(external, 'private transcript');
    symlinkSync(external, join(root, transcriptPath(to, 'fr')));
    const film = readFileSync(join(root, 'film.html'));

    await assert.rejects(moveFile(root, from, to), FileError);

    assert.deepEqual(readFileSync(join(root, from)), MEDIA);
    assert.equal(existsSync(join(root, to)), false);
    assert.deepEqual(readFileSync(join(root, 'film.html')), film);
    assertTranscriptBytes(root, from);
    assert.equal(existsSync(external), !dangling);
    if (!dangling) assert.equal(readFileSync(external, 'utf8'), 'private transcript');
  });
}
