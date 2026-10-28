// Overrides (SPEC §1): a person's tweaks of elements inside a page clip, applied after the page draws a frame. The
// film's timeline applies them to each page clip it plays (timeline.mjs); Studio's thumbnails of a page clip apply them
// too (studio/server/pageframes.mjs), so the timeline's pictures of a clip show what was changed in it. `c` is the
// clip as the timeline keeps it: its page's window (`win`), what its tweaks changed (`touched`), which ones found an
// element (`found`).

/** The attribute a copy of an element carries (SPEC §1 `copy`): the entries after its own name it, or what is in it, by it. */
export const COPY_ATTR = 'data-film-copy';

/**
 * The elements an entry is about: a copy's (`copy`) is that copy; any other finds the page's own elements, and copies
 * only when its selector names them (COPY_ATTR), so a page's tweaks never touch a copy of what they tweak.
 */
export function entryNodes(doc, o) {
  if (o.copy != null) return [...doc.querySelectorAll(`[${COPY_ATTR}="${Number(o.copy)}"]`)];
  let nodes = [];
  try { nodes = [...doc.querySelectorAll(o.at)]; } catch { return []; }
  if (!String(o.at).includes(COPY_ATTR)) nodes = nodes.filter((el) => !el.closest?.(`[${COPY_ATTR}]`));
  return o.n ? nodes.slice(o.n - 1, o.n) : nodes;
}

/**
 * `to` made what `from` is now, keeping its own elements where they match (a layer of a copy in hand stays the same
 * element frame after frame); what does not match is copied anew.
 */
function mirror(from, to) {
  if (from.nodeType === 3) { if (to.data !== from.data) to.data = from.data; return; }
  for (const a of [...to.attributes]) if (a.name !== COPY_ATTR && !from.hasAttribute(a.name)) to.removeAttribute(a.name);
  for (const a of from.attributes) if (to.getAttribute(a.name) !== a.value) to.setAttribute(a.name, a.value);
  mirrorChildren([...from.childNodes], to);
}
function mirrorChildren(nodes, to) {
  const now = [...to.childNodes];
  const same = nodes.length === now.length && nodes.every((n, i) => n.nodeType === now[i].nodeType && n.nodeName === now[i].nodeName);
  if (!same) { to.replaceChildren(...nodes.map((n) => n.cloneNode(true))); return; }
  nodes.forEach((n, i) => { if (n.nodeType === 1 || n.nodeType === 3) mirror(n, now[i]); });
}

/**
 * `to` (a copy of `from`) without what the clip's tweaks put on `from` and what is in it: the page's own element. A
 * value the page wrote since over a tweak's is the page's, and stays.
 */
function untweaked(c, from, to) {
  const saved = c.touched.get(from);
  if (saved) {
    const mine = c.applied?.get(from);
    for (const [prop, [value, priority]] of saved.props) {
      if (mine?.get(prop) !== to.style.getPropertyValue(prop)) continue;
      if (value) to.style.setProperty(prop, value, priority); else to.style.removeProperty(prop);
    }
    if (saved.nodes) { mirrorChildren(saved.nodes, to); return; }
    for (const [node, data] of saved.texts ?? []) {
      const i = [...from.childNodes].indexOf(node);
      if (i >= 0 && to.childNodes[i]?.nodeType === 3) to.childNodes[i].data = data;
    }
  }
  [...from.children].forEach((child, i) => { if (to.children[i]) untweaked(c, child, to.children[i]); });
}

/**
 * Copy `k` of `el` as the page draws it now (untweaked), after the page's own elements in its parent (drawn over what
 * is beside it), where `el` is laid out: an element in the page's flow is held there (`position: absolute`, its
 * size), so nothing else moves. What a canvas in it has drawn is drawn in the copy's. The same copy is kept from frame
 * to frame, made what the element is each time.
 */
function copyOf(c, el, k) {
  const parent = el.parentElement;
  if (!parent) return null;
  let copy = c.copies.get(k);
  if (copy?.localName === el.localName) mirror(el, copy);
  else copy = el.cloneNode(true);
  c.copies.set(k, copy);
  untweaked(c, el, copy);
  copy.setAttribute(COPY_ATTR, String(k));
  if (copy.parentElement !== parent || [...parent.children].slice([...parent.children].indexOf(copy) + 1).some((x) => !x.hasAttribute(COPY_ATTR))) parent.append(copy);
  const view = el.ownerDocument.defaultView;
  const position = view.getComputedStyle(el).position;
  if (position !== 'absolute' && position !== 'fixed') {
    for (const [prop, value] of [['position', 'absolute'], ['box-sizing', 'border-box'], ['width', `${el.offsetWidth}px`], ['height', `${el.offsetHeight}px`], ['margin', '0'], ['left', '0px'], ['top', '0px']]) {
      copy.style.setProperty(prop, value);
    }
    /* from where it lands at 0, 0 of the box it is placed in to where the element is laid out */
    const same = copy.offsetParent === el.offsetParent;
    const a = el.getBoundingClientRect();
    const b = copy.getBoundingClientRect();
    const scale = copy.offsetWidth && b.width ? b.width / copy.offsetWidth : 1;
    copy.style.setProperty('left', `${same ? el.offsetLeft - copy.offsetLeft : (a.left - b.left) / scale}px`);
    copy.style.setProperty('top', `${same ? el.offsetTop - copy.offsetTop : (a.top - b.top) / scale}px`);
  }
  const canvases = (root) => [root, ...root.querySelectorAll('canvas')].filter((n) => n.localName === 'canvas');
  const to = canvases(copy);
  canvases(el).forEach((from, i) => {
    const into = to[i];
    if (!into) return;
    try {
      if (into.width !== from.width) into.width = from.width;
      if (into.height !== from.height) into.height = from.height;
      const g = into.getContext('2d');
      g?.clearRect(0, 0, into.width, into.height);
      g?.drawImage(from, 0, 0);
    } catch { /* a canvas another origin drew, or one in use for WebGL */ }
  });
  return copy;
}

/**
 * Overrides: a person's tweak of one element inside a page, applied after the page draws each frame. `found` keeps,
 * per tweak, whether its selector ever found an element (a page rewritten since may have lost it). What a tweak
 * changes is remembered as it was before (`touched`), so a tweak taken away, or changed, leaves nothing behind. An
 * entry with `copy` draws a copy of its element instead (copyOf), the entry's tweaks on the copy; the copies are
 * drawn anew each frame, from the element as the page draws it then.
 */
export function override(c, list = []) {
  const win = c.win;
  if (!win) return;
  const touch = (el, prop) => {
    let saved = c.touched.get(el);
    if (!saved) { saved = { props: new Map(), texts: null }; c.touched.set(el, saved); }
    if (!saved.props.has(prop)) saved.props.set(prop, [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
  };
  c.applied ??= new Map();
  const set = (el, prop, value, priority = '') => {
    touch(el, prop);
    el.style.setProperty(prop, value, priority);
    if (!c.applied.has(el)) c.applied.set(el, new Map());
    c.applied.get(el).set(prop, el.style.getPropertyValue(prop));
  };
  /* the copies first, of the page's own elements; then every entry's tweaks, a copy's on the copy */
  c.copies ??= new Map();
  const copies = new Map();
  for (const o of list) {
    if (o.at === undefined || o.copy == null) continue;
    const [el] = entryNodes(win.document, { at: o.at, n: o.n });
    const copy = el && copyOf(c, el, o.copy);
    if (copy) copies.set(o, copy);
  }
  /* a copy no entry draws now (taken away, or another reading's) goes */
  const kept = new Set(copies.values());
  for (const el of win.document.querySelectorAll(`[${COPY_ATTR}]`)) if (!kept.has(el)) el.remove();
  for (const [k, el] of c.copies) if (!kept.has(el)) c.copies.delete(k);
  for (const [i, o] of list.entries()) {
    if (o.at === undefined) continue; // the clip's own entry (its fades): not an element's
    const nodes = o.copy != null ? (copies.has(o) ? [copies.get(o)] : []) : entryNodes(win.document, o);
    if (nodes.length) c.found[i] = true;
    for (const el of nodes) {
      if (o.t) set(el, 'translate', `${o.t[0]}px ${o.t[1]}px`);
      if (o.s != null) set(el, 'scale', Array.isArray(o.s) ? `${o.s[0]} ${o.s[1]}` : String(o.s));
      if (o.r != null) set(el, 'rotate', `${o.r}deg`);
      for (const [k, v] of Object.entries(o.style ?? {})) {
        /* a custom property (`--accent`) is set as it is named, its value as it is: what a number means is the page's */
        if (k.startsWith('--')) { set(el, k, String(v), 'important'); continue; }
        const prop = k.replace(/[A-Z]/g, (ch) => '-' + ch.toLowerCase());
        set(el, prop, typeof v === 'number' && !/opacity|z-index|font-weight|line-height|flex/.test(prop) ? v + 'px' : String(v), 'important');
      }
      if (o.text != null) {
        const saved = (touch(el, 'translate'), c.touched.get(el));
        if ([...el.children].every((ch) => ch.localName === 'br')) {
          /* words alone, or lines between <br>s: all of them change, a <br> at each line break (SPEC §1) */
          saved.nodes ??= [...el.childNodes];
          if (linesOf(el) !== o.text) {
            const doc = el.ownerDocument;
            el.replaceChildren(...o.text.split('\n').flatMap((line, k) => (k ? [doc.createElement('br'), doc.createTextNode(line)] : [doc.createTextNode(line)])));
          }
        } else {
          const parts = [...el.childNodes].filter((n) => n.nodeType === 3 && n.data.trim());
          saved.texts ??= parts.map((n) => [n, n.data]);
          /* a heading with other inline parts (`Quiet<br><em>you</em>`): its own words change, the parts stay */
          parts.forEach((n, k) => { n.data = k ? '' : o.text; });
        }
      }
    }
  }
}

/** An element's words with a line break for each <br>, as a `text` override writes them. */
export function linesOf(el) {
  return [...el.childNodes].map((n) => (n.nodeType === 3 ? n.data : n.localName === 'br' ? '\n' : '')).join('');
}

/** Put back what a clip's tweaks changed (before a changed list is applied, or when it is taken away). */
export function restore(c) {
  for (const [el, saved] of c.touched) {
    for (const [prop, [value, priority]] of saved.props) {
      if (value) el.style.setProperty(prop, value, priority); else el.style.removeProperty(prop);
    }
    if (saved.nodes) el.replaceChildren(...saved.nodes);
    else if (saved.texts) for (const [node, data] of saved.texts) node.data = data;
  }
  c.touched = new Map();
  c.applied = new Map();
  c.found = [];
}
