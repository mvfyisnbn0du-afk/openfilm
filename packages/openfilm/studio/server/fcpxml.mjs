// @ts-check
import { pathToFileURL } from 'node:url';
import { nleRate, xmlEscape } from './nle.mjs';

/**
 * FCPXML 1.10: the lowest picture track is the primary storyline, as in Studio.
 * Higher pictures and sounds connect to its clips; gaps only fill actual empty time.
 * Media is shared with the other editor exports. HTML pages are already rendered to ProRes with alpha.
 * @param {import('./nle.mjs').NleTimeline} timeline
 */
export function fcpxmlDocument(timeline) {
  const { rate, width, height } = timeline;
  /** Exact rational seconds, including 1001-based rates, without decimal time drift. @param {number} frames @param {typeof rate} [r] */
  const time = (frames, r = rate) => `${frames * (r.ntsc ? 1001 : 1)}/${r.timebase * (r.ntsc ? 1000 : 1)}s`;
  const number = (/** @type {number} */ n) => String(Math.round(n * 1e6) / 1e6);
  const db = (/** @type {number} */ gain) => `${number(20 * Math.log10(Math.max(0.000001, gain)))}dB`;
  const format = (/** @type {string} */ id, /** @type {number} */ w, /** @type {number} */ h, r = rate) =>
    `    <format id="${id}" frameDuration="${time(1, r)}" width="${w}" height="${h}" colorSpace="1-1-1 (Rec. 709)"/>`;
  const resources = [format('sequence-format', width, height)];
  for (const file of timeline.files) {
    const video = file.video;
    if (video) resources.push(format(`format-${file.id}`, video.w, video.h, video.fps ? nleRate(video.fps) : rate));
    resources.push(
      `    <asset id="${file.id}" name="${xmlEscape(file.name)}" start="0s" duration="${time(file.durationFrames)}"`
        + (video ? ` hasVideo="1" format="format-${file.id}" videoSources="1"` : '')
        + (file.audio ? ` hasAudio="1" audioSources="1" audioChannels="${file.audio.channels}" audioRate="${file.audio.sampleRate}"` : '') + '>',
      `      <media-rep kind="original-media" src="${xmlEscape(pathToFileURL(file.path).href)}"/>`,
      '    </asset>',
    );
  }
  /**
   * Connections use the parent's source time, while primary clips use sequence time.
   * @param {import('./nle.mjs').NleClip} clip @param {boolean} enabled @param {number} lane
   * @param {number} offset @param {'video' | 'audio'} kind @param {string[]} children @param {string} pad
   */
  const clipXml = (clip, enabled, lane, offset, kind, children, pad) => {
    const lines = [`${pad}<asset-clip ref="${clip.fileId}" name="${xmlEscape(clip.name)}" lane="${lane}" offset="${time(offset)}" start="${time(clip.in)}" duration="${time(clip.end - clip.start)}" enabled="${enabled && clip.enabled ? 1 : 0}" srcEnable="${kind}">`];
    if (kind === 'video') {
      // Disable automatic fitting: the planner's scale is relative to the source's own pixels.
      lines.push(`${pad}  <adjust-conform type="none"/>`);
      if (clip.motion) {
        const { scale, center } = clip.motion;
        lines.push(`${pad}  <adjust-transform position="${number(center.h * width / height * 100)} ${number(-center.v * 100)}" scale="${number(scale / 100)} ${number(scale / 100)}"/>`);
      }
    } else if (clip.levels?.length) {
      lines.push(`${pad}  <adjust-volume>`, `${pad}    <param name="amount">`, `${pad}      <keyframeAnimation>`);
      for (const key of clip.levels) lines.push(`${pad}        <keyframe time="${time(clip.in + key.when)}" value="${db(key.value)}" interp="linear" curve="linear"/>`);
      lines.push(`${pad}      </keyframeAnimation>`, `${pad}    </param>`, `${pad}  </adjust-volume>`);
    } else if (clip.gain !== undefined) lines.push(`${pad}  <adjust-volume amount="${db(clip.gain)}"/>`);
    return [...lines, ...children, `${pad}</asset-clip>`];
  };
  /** @type {{ start: number, end: number, in: number, clip?: import('./nle.mjs').NleClip, children: string[] }[]} */
  const primary = [];
  let cursor = 0;
  const main = timeline.video[0];
  for (const clip of [...(main?.clips ?? [])].sort((a, b) => a.start - b.start)) {
    if (clip.start > cursor) primary.push({ start: cursor, end: clip.start, in: 0, children: [] });
    primary.push({ start: clip.start, end: clip.end, in: clip.in, clip, children: [] });
    cursor = clip.end;
  }
  if (cursor < timeline.durationFrames) primary.push({ start: cursor, end: timeline.durationFrames, in: 0, children: [] });
  const connect = (/** @type {import('./nle.mjs').NleTrack} */ track, /** @type {number} */ lane, /** @type {'video' | 'audio'} */ kind) => {
    for (const clip of track.clips) {
      const parent = primary.find((p) => clip.start >= p.start && clip.start < p.end) ?? primary.at(-1);
      if (!parent) continue;
      parent.children.push(...clipXml(clip, track.enabled, lane, parent.in + clip.start - parent.start, kind, [], '              '));
    }
  };
  timeline.video.slice(1).forEach((track, i) => connect(track, i + 1, 'video'));
  timeline.audio.forEach((track, i) => connect(track, -i - 1, 'audio'));
  const spine = primary.flatMap((p) => p.clip
    ? clipXml(p.clip, main?.enabled ?? true, 0, p.start, 'video', p.children, '            ')
    : [`            <gap name="OpenFilm" offset="${time(p.start)}" start="0s" duration="${time(p.end - p.start)}">`, ...p.children, '            </gap>']);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>', '<!DOCTYPE fcpxml>', '<fcpxml version="1.10">', '  <resources>',
    ...resources, '  </resources>', '  <library>', `    <event name="${xmlEscape(timeline.name)}">`,
    `      <project name="${xmlEscape(timeline.name)}">`,
    `        <sequence format="sequence-format" duration="${time(timeline.durationFrames)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">`,
    '          <spine>', ...spine, '          </spine>', '        </sequence>', '      </project>',
    '    </event>', '  </library>', '</fcpxml>', '',
  ].join('\n');
}
