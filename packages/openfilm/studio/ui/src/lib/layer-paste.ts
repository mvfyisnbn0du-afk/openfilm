/**
 * A copied layer written into its page, as a design tool pastes: a new element of the page right after the one copied
 * (lib/html-source finds it in the file), independent of it from then on. It is the copied one's markup, with new ids
 * (and what in it names them), the page's CSS rules of the old ids said again of the new ones, and the clip's changes
 * of it and of what is in it written in (styles, moves, words). An element in the page's flow is held where it was
 * laid out (`position: absolute`, its size), so nothing else moves; it goes `offset` px lower and to the right.
 * Every other character of the page stays as it was.
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
  /** Where it is laid out: its `position`, and its box in its offset parent (px). */
  place: { position: string; left: number; top: number; width: number; height: number };
  /** The page's CSS rules naming an id in it, as the page has them. */
  idRules: string[];
  /** The clip's changes of it and of what is in it, in order: where in it (element after element, from it), its tag. */
  tweaks: Array<{ path: number[]; tag: string } & Omit<FilmOverride, 'at' | 'n' | 'lock'>>;
  /** It as it looks now, for another page: markup holding its look, its fonts, and its project's address (`base`). */
  snapshot?: { html: string; fonts: string[]; base: string };
}

/** Where the layer is in the page's file, as the browser reads the file: its path from `<body>`, and its shape. */
export interface PasteTarget {
  path: number[];
  tags: string[];
  shape: Shape;
  /** Every id the page's file has. */
  ids: ReadonlySet<string>;
}

const UNITLESS = /opacity|z-index|font-weight|line-height|flex/;
const kebab = (k: string) => (k.startsWith('--') ? k : k.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`));
const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/** A free id from `base`: `base-2`, `base-3` … */
function freeId(base: string, taken: Set<string>): string {
  const stem = base.replace(/-\d+$/, '') || 'layer';
  let n = 2;
  while (taken.has(`${stem}-${n}`)) n++;
  const id = `${stem}-${n}`;
  taken.add(id);
  return id;
}

export interface PastedPage {
  text: string;
  /** The copy, as an override names it. */
  at: string;
}

/**
 * The page `text` with a copy of `layer` written right after it (see the top), `offset` px lower and to the right.
 * Null when the file does not hold it as the browser reads it (an element the page's code makes as it runs).
 */
export function pastedPage(text: string, layer: PasteLayer, target: PasteTarget, offset: number): PastedPage | null {
  const body = sourceBody(readSource(text));
  const el = elementAt(body, target.path, target.tags);
  if (!el || !sameShape(el, target.shape)) return null;
  /* its elements by where they are in it */
  const at = new Map<string, SourceElement>();
  const walk = (n: SourceElement, path: number[]) => { at.set(path.join('.'), n); elementsOf(n).forEach((c, i) => walk(c, [...path, i])); };
  walk(el, []);
  const all = [...at.values()];
  /* new ids, and what in it named the old ones */
  const taken = new Set(target.ids);
  const renamed = new Map<string, string>();
  for (const n of all) {
    const id = n.attrs.find((a) => a.name === 'id')?.value;
    if (id) renamed.set(id, freeId(id, taken));
  }
  const rootId = renamed.get(el.attrs.find((a) => a.name === 'id')?.value ?? '') ?? freeId(layer.classes[0] ?? layer.tag, taken);
  const rename = (value: string) => {
    let v = value;
    for (const [from, to] of renamed) {
      v = v.replace(new RegExp(`(url\\(\\s*['"]?#)${escRe(from)}(?=['"]?\\s*\\))`, 'g'), `$1${to}`);
      if (v === `#${from}`) v = `#${to}`;
    }
    return v;
  };
  const NAMES_IDS = new Set(['for', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'list', 'form', 'headers']);
  /* the changes, by element: CSS of its own, and its words */
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
  /* held where it is laid out, moved by `offset` */
  if (layer.place.position !== 'absolute' && layer.place.position !== 'fixed') {
    const p = layer.place;
    put(el, [['position', 'absolute'], ['left', `${p.left}px`], ['top', `${p.top}px`], ['width', `${p.width}px`], ['height', `${p.height}px`], ['margin', '0'], ['box-sizing', 'border-box']]);
  }
  if (offset) {
    const moved = css.get(el)?.get('translate')?.match(/^(-?[\d.]+)px (-?[\d.]+)px$/);
    const [x, y] = moved ? [Number(moved[1]), Number(moved[2])] : [0, 0];
    put(el, [['translate', `${x + offset}px ${y + offset}px`]]);
  }
  /* the edits, by where they are in the file */
  const edits: Array<{ start: number; end: number; text: string }> = [];
  for (const n of all) {
    const extra = css.get(n);
    let styled = false;
    for (const a of n.attrs) {
      let value = a.value;
      if (a.name === 'id' && value) value = n === el ? rootId : renamed.get(value) ?? value;
      else if (value && NAMES_IDS.has(a.name)) value = value.split(/\s+/).map((v) => renamed.get(v) ?? v).join(' ');
      else if (value) value = rename(value);
      if (a.name === 'style' && extra?.size) {
        styled = true;
        const own = (value ?? '').trim().replace(/;\s*$/, '');
        value = [own, ...[...extra].map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('; ');
      }
      if (value !== a.value) edits.push({ start: a.start, end: a.end, text: `${a.name}="${escAttr(value ?? '')}"` });
    }
    /* an id added first, a style after its own attributes */
    if (n === el && !n.attrs.some((a) => a.name === 'id')) edits.push({ start: n.nameEnd, end: n.nameEnd, text: ` id="${escAttr(rootId)}"` });
    if (extra?.size && !styled) {
      const after = n.attrs.length ? n.attrs[n.attrs.length - 1]!.end : n.nameEnd;
      edits.push({ start: after, end: after, text: ` style="${escAttr([...extra].map(([k, v]) => `${k}: ${v}`).join('; '))}"` });
    }
    const said = words.get(n);
    if (said != null) {
      const kids = n.children;
      const linesOnly = kids.every((k) => k.kind === 'text' || k.tag === 'br');
      if (linesOnly) {
        edits.push({ start: n.openEnd, end: n.closeStart, text: said.split('\n').map(escText).join('<br>') });
      } else {
        const first = kids.find((k) => k.kind === 'text' && text.slice(k.start, k.end).trim());
        if (first) edits.push({ start: first.start, end: first.end, text: escText(said) });
      }
    }
  }
  let copy = text.slice(el.start, el.end);
  for (const e of edits.sort((a, b) => b.start - a.start)) copy = copy.slice(0, e.start - el.start) + e.text + copy.slice(e.end - el.start);
  /* the page's rules of its old ids, of the new ones */
  const rules = layer.idRules.map((rule) => {
    let r = rule;
    for (const [from, to] of renamed) r = r.replace(new RegExp(`#${escRe(from)}(?![\\w-])`, 'g'), `#${to}`);
    return r;
  });
  const line = text.lastIndexOf('\n', el.start - 1) + 1;
  const indent = /^\s*$/.test(text.slice(line, el.start)) ? text.slice(line, el.start) : '';
  const style = rules.length ? `\n${indent}<style>${rules.join(' ')}</style>` : '';
  return { text: `${text.slice(0, el.end)}${style}\n${indent}${copy}${text.slice(el.end)}`, at: `#${rootId}` };
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
 * The page `text` (the project's page `page`) with a copy of `layer` written last in its `<body>` (drawn over the rest),
 * as it looks now (its snapshot: another page's CSS and code cannot draw it as its own page does), where it was in its
 * page, `offset` px lower and to the right. What it loads from its project is named from this page; `moved` says where
 * a file of its project is in this one (another project's are brought in first). Null without a snapshot.
 */
export function pastedElsewhere(
  text: string, page: string, layer: PasteLayer, ids: ReadonlySet<string>, offset: number, moved: (path: string) => string = (p) => p,
): PastedPage | null {
  const shot = layer.snapshot;
  if (!shot) return null;
  const rootId = freeId(layer.id ?? layer.classes[0] ?? layer.tag, new Set(ids));
  const local = (url: string) => (url.startsWith(shot.base) ? relativeTo(page, moved(decodeURI(url.slice(shot.base.length)))) : url);
  const urls = (s: string) => s
    .replace(/url\(&quot;(.*?)&quot;\)/g, (_m, u: string) => `url(&quot;${escAttr(local(u.replace(/&amp;/g, '&')))}&quot;)`)
    .replace(/url\((["']?)([^"')&]+)\1\)/g, (_m, _q, u: string) => `url("${local(u)}")`)
    .replace(/\b(src|href|poster)="([^"]*)"/g, (_m, a: string, u: string) => `${a}="${escAttr(local(u.replace(/&amp;/g, '&')))}"`);
  const html = urls(shot.html).replace(/^<([A-Za-z][\w-]*)/, `<$1 id="${rootId}"`)
    .replace(/^(<[^>]*style=")([^"]*)"/, (_m, head: string, st: string) => `${head}${st}${offset ? `; translate: ${offset}px ${offset}px` : ''}"`);
  const fonts = shot.fonts.length ? `<style>${shot.fonts.map(urls).join(' ')}</style>\n` : '';
  const body = sourceBody(readSource(text));
  const at = body.closeStart < text.length && body.tag === 'body' ? body.closeStart : text.length;
  return { text: `${text.slice(0, at)}${fonts}${html}\n${text.slice(at)}`, at: `#${rootId}` };
}
