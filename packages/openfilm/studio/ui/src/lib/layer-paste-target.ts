/**
 * Where a copied layer is in its page's file, as the browser reads the file (no script run): the element the stage
 * named, known by its tag, id and classes (and its words, among elements alike), by its path from `<body>` and its
 * shape (lib/layer-paste finds it there in the text). Null when the file has no such element: the page's code makes
 * it as it runs.
 */
import type { PasteLayer, PasteTarget } from './layer-paste';
import type { Shape } from './html-source';

const words = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
const shapeOf = (el: Element): Shape => ({ tag: el.localName, children: [...el.children].map(shapeOf) });

export function pasteTarget(text: string, layer: PasteLayer): PasteTarget | null {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  let found: Element[] = [];
  try { found = layer.at ? [...doc.querySelectorAll(layer.at)] : []; } catch { /* a selector this reading cannot take */ }
  if (layer.id) found = [doc.getElementById(layer.id), ...found].filter((x): x is Element => Boolean(x));
  /* its words only tell apart elements alike (the clip may have changed its words) */
  const alike = [...new Set(found)].filter((x) => (
    x.localName === layer.tag && (x.id || null) === layer.id && layer.classes.every((c) => x.classList.contains(c))
  ));
  const el = alike.length === 1 ? alike[0] : alike.find((x) => words(x) === layer.text);
  if (!el || !doc.body.contains(el)) return null;
  const path: number[] = [];
  const tags: string[] = [];
  for (let n: Element = el; n !== doc.body; n = n.parentElement!) {
    path.unshift([...n.parentElement!.children].indexOf(n));
    tags.unshift(n.localName);
  }
  return { path, tags, shape: shapeOf(el), ids: new Set([...doc.querySelectorAll('[id]')].map((x) => x.id)) };
}
