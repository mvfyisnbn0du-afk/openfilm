/**
 * Copied layers written into a page, as a design tool pastes: each a new element of the page, independent of the one
 * copied from then on. Every other character of the page stays as it was.
 *
 * Into its own page (pastedPage), a copy is the copied element's markup as the file has it (lib/html-source finds it
 * there), right after it, or last in its parent when the page's CSS would draw what is beside it otherwise
 * (studio/server/stage.js `afterCopy`), with:
 *   - new ids (`<id>-copy`), and what in it names them (`url(#…)`, `href="#…"`, `for`, `aria-*`);
 *   - the page's CSS rules of the old ids said again of the new ones, only the parts naming them, in the page's head;
 *   - the clip's changes of it and of what is in it written in (styles, moves, words);
 *   - no scripts and no `on…` handlers (they would run twice, as the page's own code: a copy is a picture);
 *   - when it was in the page's flow, held where it was laid out (`position: absolute`, its size), so nothing else
 *     moves; and `offset` px lower and to the right.
 * Into another page (pastedElsewhere), a copy is the layer as it looks now (the stage's snapshot: its look written in
 * its style, as that page's CSS cannot draw it), last in that page's body, what it loads named from there.
 *
 * Pure: no DOM, so `node --test` runs it.
 */
import type { FilmOverride } from './film.ts';
import { elementAt, elementsOf, readSource, sameShape, sourceBody, type Shape, type SourceElement } from './html-source.ts';

/** A layer as the stage tells it at a copy (studio/server/stage.js `layerSource`). */
export interface PasteLayer {
  /** A selector naming it alone in its page as drawn; null when none does. */
  at: string | null;
  tag: string;
  id: string | null;
  classes: string[];
  /** Its words, spaces collapsed (at most 200 characters): to know it in the page's file. */
  text: string;
  /** Where it is laid out: its `position`, and its box in what places it (px); null inside an SVG (placed by it). */
  place: { position: string; left: number; top: number; width: number; height: number } | null;
  /** The page's CSS rules naming an id in it: the selectors naming one, their rule's body, the at-rules around it. */
  idRules: Array<{ selectors: string[]; body: string; within: string[] }>;
  /** The clip's changes of it and of what is in it, in order: where in it (element after element, from it), its tag. */
  tweaks: Array<{ path: number[]; tag: string } & Omit<FilmOverride, 'at' | 'n' | 'lock'>>;
  /** It as it looks now, for another page: markup holding its look, its fonts, and its project's address (`base`). */
  snapshot?: { html: string; fonts: string[]; base: string };
}

/** Where a layer is in the page's file, as the browser reads the file: its path from `<body>`, and its shape. */
export interface PasteTarget {
  path: number[];
  tags: string[];
  shape: Shape;
}

/**
 * One layer to write: where it is, and whether its copy goes after it or last in its parent; `after`, the copy pasted
 * before at this spot (each paste goes over the one before).
 */
export interface PasteItem { layer: PasteLayer; target: PasteTarget; where?: 'after' | 'end'; after?: PasteTarget }

export interface PastedPage {
  text: string;
  /** Each copy, as an override names it (in the order asked; '' for one copied inside another). */
  ats: string[];
  /** What was written in, as it was written: taken out again by an undo of a page changed since (withoutPaste). */
  inserted: string[];
}

const UNITLESS = /opacity|z-index|font-weight|line-height|flex/;
const kebab = (k: string) => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`));
const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NAMES_IDS = new Set(['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'list', 'form', 'headers']);
const FILE_ATTRS = new Set(['src', 'href', 'poster', 'xlink:href']);

/** The CSS a change writes into an element's own style (an override's `t`, `s`, `r` and `style`), by property. */
function declarations(t: Omit<FilmOverride, 'at' | 'n' | 'lock'>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (t.t) out.push(['translate', `${t.t[0]}px ${t.t[1]}px`]);
  if (t.s != null) out.push(['scale', Array.isArray(t.s) ? `${t.s[0]} ${t.s[1]}` : String(t.s)]);
  if (t.r != null) out.push(['rotate', `${t.r}deg`]);
  for (const [k, v] of Object.entries(t.style ?? {})) {
    const prop = kebab(k);
    out.push([prop, typeof v === 'number' && !prop.startsWith('--') && !UNITLESS.test(prop) ? `${v}px` : String(v)]);
  }
  return out;
}

/** A free id for a copy of `base`: `base-copy`, `base-copy-2` … (a copy's copy is named from the first). */
export function copyId(base: string, taken: Set<string>): string {
  const stem = `${base.replace(/-copy(-\d+)?$/, '') || 'layer'}-copy`;
  let id = stem;
  for (let n = 2; taken.has(id); n++) id = `${stem}-${n}`;
  taken.add(id);
  return id;
}

/** The `translate` a style says, in px ([0, 0] without one). */
function translateOf(style: string | null | undefined): [number, number] {
  const m = /(?:^|;)\s*translate\s*:\s*(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(style ?? '');
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : [0, 0];
}

interface CopyOptions {
  /** The new ids, by the old ones; the copy's own (root) id. */
  renamed: ReadonlyMap<string, string>;
  rootId: string;
  /** Per element of it, CSS to write in its style, and words. */
  css: ReadonlyMap<SourceElement, ReadonlyMap<string, string>>;
  words: ReadonlyMap<SourceElement, string>;
  /** An address of a file, as the page it goes into names it. */
  url?: (url: string) => string;
}

/** `el` of `text` as a copy (see the top): its markup with the edits made. */
function copyMarkup(text: string, el: SourceElement, o: CopyOptions): string {
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const url = o.url ?? ((u: string) => u);
  /* `url(…)` in a value: an id renamed, a file named from the page it goes into */
  const inValue = (value: string) => value.replace(/url\((&quot;|["']?)(.*?)\1\)/g, (_m, q: string, raw: string) => {
    const u = q === '&quot;' ? raw.replace(/&amp;/g, '&') : raw;
    const id = u.startsWith('#') ? o.renamed.get(u.slice(1)) : undefined;
    const to = id ? `#${id}` : url(u);
    return `url(${q}${q === '&quot;' ? escAttr(to) : to}${q})`;
  });
  const walk = (n: SourceElement) => {
    /* a script goes, with all in it */
    if (n.tag === 'script') { edits.push({ start: n.start, end: n.end, text: '' }); return; }
    const extra = o.css.get(n);
    let styled = false;
    for (const a of n.attrs) {
      if (/^on/.test(a.name)) { edits.push({ start: a.start - (/\s/.test(text[a.start - 1] ?? '') ? 1 : 0), end: a.end, text: '' }); continue; }
      let value = a.value;
      if (a.name === 'id' && value) value = n === el ? o.rootId : o.renamed.get(value) ?? value;
      else if (value && NAMES_IDS.has(a.name)) value = value.split(/\s+/).map((v) => o.renamed.get(v) ?? v).join(' ');
      else if (value && FILE_ATTRS.has(a.name)) value = value.startsWith('#') ? `#${o.renamed.get(value.slice(1)) ?? value.slice(1)}` : url(value);
      else if (value) value = inValue(value);
      if (a.name === 'style' && extra?.size) {
        styled = true;
        const own = (value ?? '').trim().replace(/;\s*$/, '');
        value = [own, ...[...extra].map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('; ');
      }
      if (value !== a.value) edits.push({ start: a.start, end: a.end, text: `${a.name}="${escAttr(value ?? '')}"` });
    }
    /* an id added first, a style after its own attributes */
    if (n === el && !n.attrs.some((a) => a.name === 'id')) edits.push({ start: n.nameEnd, end: n.nameEnd, text: ` id="${escAttr(o.rootId)}"` });
    if (extra?.size && !styled) {
      const after = n.attrs.length ? n.attrs[n.attrs.length - 1]!.end : n.nameEnd;
      edits.push({ start: after, end: after, text: ` style="${escAttr([...extra].map(([k, v]) => `${k}: ${v}`).join('; '))}"` });
    }
    const said = o.words.get(n);
    if (said != null) {
      const kids = n.children;
      /* as the film writes words (src/overrides.mjs): all of them, a <br> at each line break, when it holds words and
         <br>s alone; else its first run of words, the other runs taken away, its elements kept */
      if (kids.every((k) => k.kind === 'text' || k.tag === 'br')) {
        edits.push({ start: n.openEnd, end: n.closeStart, text: said.split('\n').map(escText).join('<br>') });
        return;
      }
      let first = true;
      for (const k of kids) {
        if (k.kind !== 'text' || !text.slice(k.start, k.end).trim()) continue;
        edits.push({ start: k.start, end: k.end, text: first ? escText(said) : '' });
        first = false;
      }
    }
    for (const c of elementsOf(n)) walk(c);
  };
  walk(el);
  let copy = text.slice(el.start, el.end);
  for (const e of edits.sort((a, b) => b.start - a.start)) copy = copy.slice(0, e.start - el.start) + e.text + copy.slice(e.end - el.start);
  return copy;
}

/** Each element of `el` by its path from it. */
function byPath(el: SourceElement): Map<string, SourceElement> {
  const at = new Map<string, SourceElement>();
  const walk = (n: SourceElement, path: number[]) => { at.set(path.join('.'), n); elementsOf(n).forEach((c, i) => walk(c, [...path, i])); };
  walk(el, []);
  return at;
}

/** New ids for every id in `el`, the root's from `base` when it has none. */
function newIds(el: SourceElement, base: string, taken: Set<string>): { renamed: Map<string, string>; rootId: string } {
  const renamed = new Map<string, string>();
  for (const n of byPath(el).values()) {
    const id = n.attrs.find((a) => a.name === 'id')?.value;
    if (id && !renamed.has(id)) renamed.set(id, copyId(id, taken));
  }
  const own = el.attrs.find((a) => a.name === 'id')?.value;
  return { renamed, rootId: (own && renamed.get(own)) || copyId(base, taken) };
}

/** Every id the page's file has. */
function idsOf(root: SourceElement): Set<string> {
  const out = new Set<string>();
  const walk = (n: SourceElement) => {
    const id = n.attrs.find((a) => a.name === 'id')?.value;
    if (id) out.add(id);
    elementsOf(n).forEach(walk);
  };
  walk(root);
  return out;
}

/** Where a `<style>` goes in the page's head: at the end of its `<head>`, else just inside `<html>`, else its top. */
function headAt(text: string, root: SourceElement): number {
  const html = elementsOf(root).find((e) => e.tag === 'html');
  const head = elementsOf(html ?? root).find((e) => e.tag === 'head');
  if (head && text.startsWith('</', head.closeStart)) return head.closeStart;
  if (html) return html.openEnd;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(text);
  return doctype ? doctype[0].length : 0;
}

/** The whitespace a line starts with up to `at`, when only whitespace is before it there. */
function indentAt(text: string, at: number): string {
  const line = text.lastIndexOf('\n', at - 1) + 1;
  const before = text.slice(line, at);
  return /^[ \t]*$/.test(before) ? before : '';
}

const lineBreak = (text: string) => (text.includes('\r\n') ? '\r\n' : '\n');

/** The page's CSS rules of a layer's old ids, of the new ones: only the selectors naming them, in their at-rules. */
function rulesFor(rules: PasteLayer['idRules'], renamed: ReadonlyMap<string, string>): string[] {
  return rules.flatMap((r) => {
    const selectors = r.selectors.flatMap((sel) => {
      let out = sel;
      let named = false;
      for (const [from, to] of renamed) {
        const re = new RegExp(`#${escRe(from)}(?![\\w-])`, 'g');
        if (re.test(out)) { named = true; out = out.replace(re, `#${to}`); }
      }
      return named ? [out] : [];
    });
    if (!selectors.length) return [];
    return [r.within.reduceRight((inner, at) => `${at} { ${inner} }`, `${selectors.join(', ')} { ${r.body} }`)];
  });
}

/**
 * The page `text` with a copy of each layer of `items` written in (see the top), `offset` px lower and to the right.
 * Every layer is found in the file before anything is written; one inside another asked is copied with it. Null when
 * the file does not hold one as the browser reads it (an element the page's code makes as it runs).
 */
export function pastedPage(text: string, items: readonly PasteItem[], offset: number): PastedPage | null {
  const root = readSource(text);
  const body = sourceBody(root);
  const els = items.map(({ target }) => {
    const el = elementAt(body, target.path, target.tags);
    return el && !el.implied && sameShape(el, target.shape) ? el : null;
  });
  if (els.some((el) => !el)) return null;
  const taken = idsOf(root);
  const nl = lineBreak(text);
  const writes: Array<{ at: number; text: string }> = [];
  const rules: string[] = [];
  const ats: string[] = [];
  items.forEach(({ layer, target, where, after }, i) => {
    const el = els[i]!;
    /* inside another one copied (or the same twice): copied with it */
    if (els.some((o, k) => k !== i && o!.start <= el.start && o!.end >= el.end && (o!.start < el.start || o!.end > el.end || k < i))) {
      ats.push('');
      return;
    }
    const at = byPath(el);
    const { renamed, rootId } = newIds(el, layer.classes[0] ?? layer.tag, taken);
    const css = new Map<SourceElement, Map<string, string>>();
    const words = new Map<SourceElement, string>();
    const put = (n: SourceElement, decls: Array<[string, string]>) => {
      const m = css.get(n) ?? new Map<string, string>();
      for (const [k, v] of decls) { m.delete(k); m.set(k, v); }
      css.set(n, m);
    };
    for (const { path, tag, ...tweak } of layer.tweaks) {
      const n = at.get(path.join('.'));
      if (!n || n.tag !== tag.toLowerCase()) continue;
      put(n, declarations(tweak));
      if (tweak.text != null) words.set(n, tweak.text);
    }
    /* held where it is laid out, moved by `offset` (and by its own move, a change's or its style's) */
    const p = layer.place;
    if (p && p.position !== 'absolute' && p.position !== 'fixed') {
      put(el, [['position', 'absolute'], ['left', `${p.left}px`], ['top', `${p.top}px`], ['width', `${p.width}px`], ['height', `${p.height}px`], ['margin', '0'], ['box-sizing', 'border-box']]);
    }
    if (offset) {
      const moved = css.get(el)?.get('translate')?.match(/^(-?[\d.]+)px (-?[\d.]+)px$/);
      const [x, y] = moved ? [Number(moved[1]), Number(moved[2])] : translateOf(el.attrs.find((a) => a.name === 'style')?.value);
      put(el, [['translate', `${x + offset}px ${y + offset}px`]]);
    }
    const copy = copyMarkup(text, el, { renamed, rootId, css, words });
    rules.push(...rulesFor(layer.idRules, renamed));
    const parent = where === 'end' ? elementAt(body, target.path.slice(0, -1), target.tags.slice(0, -1)) : null;
    /* last in its parent: right after its last element (what is after that, the end tag's line, stays) */
    const before = after ? elementAt(body, after.path, after.tags) : null;
    const into = parent && !parent.implied ? (elementsOf(parent).at(-1)?.end ?? parent.closeStart) : (before?.end ?? el.end);
    writes.push({ at: into, text: `${nl}${indentAt(text, el.start)}${copy}` });
    ats.push(`#${rootId}`);
  });
  if (rules.length) writes.push({ at: headAt(text, root), text: `<style>${rules.join(' ')}</style>${nl}` });
  return written(text, writes, ats);
}

/** `writes` made in `text`, from the last place up (two at one place: in the order given). */
function written(text: string, writes: Array<{ at: number; text: string }>, ats: string[]): PastedPage {
  let out = text;
  const order = writes.map((w, i) => ({ ...w, i })).sort((a, b) => b.at - a.at || b.i - a.i);
  for (const w of order) out = `${out.slice(0, w.at)}${w.text}${out.slice(w.at)}`;
  return { text: out, ats, inserted: writes.map((w) => w.text) };
}

/** `path` (project relative) as a page at `page` names it. */
export function relativeTo(page: string, path: string): string {
  const from = page.split('/').slice(0, -1);
  const to = path.split('/');
  let k = 0;
  while (k < from.length && k < to.length - 1 && from[k] === to[k]) k++;
  return [...from.slice(k).map(() => '..'), ...to.slice(k)].join('/');
}

/**
 * The page `text` (the project's page `page`) with a copy of each of `layers` written last in its `<body>` (drawn
 * over the rest), as it looks now (its snapshot), where it was in its page, `offset` px lower and to the right of where
 * it is drawn (its own move kept). Its ids are new ones in this page, what names them in it too. What it loads from its
 * project is named from this page; `moved` says where a file of its project is in this one (another project's are
 * brought in first). Null when one has no snapshot.
 */
export function pastedElsewhere(
  text: string, page: string, layers: readonly PasteLayer[], offset: number, moved: (path: string) => string = (p) => p,
): PastedPage | null {
  if (layers.some((l) => !l.snapshot)) return null;
  const root = readSource(text);
  const body = sourceBody(root);
  const taken = idsOf(root);
  const nl = lineBreak(text);
  const at = body.tag === 'body' && text.startsWith('</', body.closeStart) ? body.closeStart : text.length;
  const writes: Array<{ at: number; text: string }> = [];
  const fonts = new Set<string>();
  const ats: string[] = [];
  for (const layer of layers) {
    const shot = layer.snapshot!;
    const local = (url: string) => (url.startsWith(shot.base) ? relativeTo(page, moved(decodeURI(url.slice(shot.base.length)))) : url);
    const el = elementsOf(readSource(shot.html))[0];
    if (!el) return null;
    const { renamed, rootId } = newIds(el, layer.id ?? layer.classes[0] ?? layer.tag, taken);
    const css = new Map<SourceElement, Map<string, string>>();
    if (offset) {
      const [x, y] = translateOf(el.attrs.find((a) => a.name === 'style')?.value);
      css.set(el, new Map([['translate', `${x + offset}px ${y + offset}px`]]));
    }
    writes.push({ at, text: `${copyMarkup(shot.html, el, { renamed, rootId, css, words: new Map(), url: local })}${nl}` });
    for (const f of shot.fonts) fonts.add(f.replace(/url\((["']?)([^"')]+)\1\)/g, (_m, _q, u: string) => `url("${local(u)}")`));
    ats.push(`#${rootId}`);
  }
  if (fonts.size) writes.push({ at: headAt(text, root), text: `<style>${[...fonts].join(' ')}</style>${nl}` });
  return written(text, writes, ats);
}

/**
 * The page `text` without what a paste wrote in (`inserted`, as pastedPage says it), for an undo of a page written
 * since (by the agent): each piece taken out where it is, once. Null when one is not there as it was written.
 */
export function withoutPaste(text: string, inserted: readonly string[]): string | null {
  let out = text;
  for (const piece of inserted) {
    const i = out.indexOf(piece);
    if (i < 0 || out.indexOf(piece, i + 1) >= 0) return null;
    out = out.slice(0, i) + out.slice(i + piece.length);
  }
  return out;
}
