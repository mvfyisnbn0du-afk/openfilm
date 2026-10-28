import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementAt, elementsOf, readSource, sourceBody } from './html-source.ts';
import { pastedElsewhere, pastedPage, relativeTo, type PasteLayer, type PasteTarget } from './layer-paste.ts';

const PAGE = `<!doctype html>
<html><head><style>#card{background:#c33} #title{color:#ff0}</style></head>
<body>
  <!-- a card <div> -->
  <div id="card" class="card">
    <h1 id="title">Hello</h1>
    <p class=sub>world<br>again</p>
    <svg><linearGradient id="g"/><rect fill="url(#g)"/></svg>
  </div>
  <p>Open paragraph
  <div id="dot"></div>
  <script>if (a < b && "</div>") go();</script>
</body></html>`;

test('a page\'s file read as it is written: comments, raw text, end tags left out, attributes quoted or not', () => {
  const body = sourceBody(readSource(PAGE));
  assert.deepEqual(elementsOf(body).map((e) => e.tag), ['div', 'p', 'div', 'script']);
  const card = elementAt(body, [0], ['div'])!;
  assert.equal(PAGE.slice(card.start, card.end).split('\n')[0], '<div id="card" class="card">');
  assert.ok(PAGE.slice(card.start, card.end).endsWith('</div>'));
  assert.deepEqual(elementsOf(card).map((e) => e.tag), ['h1', 'p', 'svg']);
  assert.equal(elementAt(body, [0, 1], ['div', 'p'])!.attrs[0]!.value, 'sub');
  assert.equal(elementAt(body, [1], ['p'])!.end, elementAt(body, [2], ['div'])!.start, 'a <p> left open ends at the next block');
  assert.equal(elementAt(body, [0, 0], ['div', 'div']), null, 'a step of another tag: not it');
});

const layer = (over: Partial<PasteLayer> = {}): PasteLayer => ({
  at: '#card', tag: 'div', id: 'card', classes: ['card'], text: 'Hello worldagain',
  place: { position: 'static', left: 200, top: 100, width: 900, height: 500 },
  idRules: ['#card { background: rgb(204, 51, 51); }', '#title { color: rgb(255, 255, 0); }'],
  tweaks: [], ...over,
});
const target = (): PasteTarget => ({
  path: [0], tags: ['div'],
  shape: { tag: 'div', children: [{ tag: 'h1', children: [] }, { tag: 'p', children: [{ tag: 'br', children: [] }] }, { tag: 'svg', children: [{ tag: 'linearGradient', children: [] }, { tag: 'rect', children: [] }] }] },
  ids: new Set(['card', 'title', 'g', 'dot']),
});

test('a copy written right after the layer: new ids and what names them, its id rules, held in place and moved', () => {
  const out = pastedPage(PAGE, layer({ tweaks: [{ path: [0], tag: 'h1', text: 'Hi & bye', style: { fontSize: 48 } }, { path: [], tag: 'div', t: [10, 0] }] }), target(), 24)!;
  assert.equal(out.at, '#card-2');
  const added = out.text.slice(out.text.indexOf('</div>') + '</div>'.length, out.text.indexOf('<p>Open'));
  assert.ok(added.includes('<style>#card-2 { background: rgb(204, 51, 51); } #title-2 { color: rgb(255, 255, 0); }</style>'), added);
  assert.ok(added.includes('<div id="card-2" class="card" style="position: absolute; left: 200px; top: 100px; width: 900px; height: 500px; margin: 0; box-sizing: border-box; translate: 34px 24px">'), added);
  assert.ok(added.includes('<h1 id="title-2" style="font-size: 48px">Hi &amp; bye</h1>'), added);
  assert.ok(added.includes('<linearGradient id="g-2"/><rect fill="url(#g-2)"/>'), added);
  assert.ok(added.includes('<p class=sub>world<br>again</p>'), 'what was not changed is written as it was');
  const cardEnd = PAGE.indexOf('</div>') + '</div>'.length;
  assert.ok(out.text.startsWith(PAGE.slice(0, cardEnd)) && out.text.endsWith(PAGE.slice(cardEnd)), 'the rest of the page as it was');
});

test('a layer the file does not hold as the browser reads it (made by the page\'s code): no copy', () => {
  assert.equal(pastedPage(PAGE, layer(), { ...target(), path: [5] }, 24), null);
  assert.equal(pastedPage(PAGE, layer(), { ...target(), shape: { tag: 'div', children: [] } }, 24), null);
});

test('an element placed by the page already keeps its place; one without an id gets one', () => {
  const page = '<body><span class="tag" style="position:absolute;left:5px">New</span></body>';
  const out = pastedPage(page, layer({ at: 'body > span', tag: 'span', id: null, classes: ['tag'], place: { position: 'absolute', left: 5, top: 0, width: 30, height: 10 }, idRules: [] }),
    { path: [0], tags: ['span'], shape: { tag: 'span', children: [] }, ids: new Set() }, 24)!;
  assert.equal(out.at, '#tag-2');
  assert.equal(out.text, '<body><span class="tag" style="position:absolute;left:5px">New</span>\n<span id="tag-2" class="tag" style="position:absolute;left:5px; translate: 24px 24px">New</span></body>');
});

test('a path named from a page: up and down from its folder', () => {
  assert.equal(relativeTo('scene.html', 'assets/a.png'), 'assets/a.png');
  assert.equal(relativeTo('scenes/two/scene.html', 'assets/a.png'), '../../assets/a.png');
  assert.equal(relativeTo('scenes/scene.html', 'scenes/img/a.png'), 'img/a.png');
});

test('into another page: the layer as it looks, last in its body, what it loads named from there', () => {
  const page = '<html><body>\n<h2>Two</h2>\n</body></html>';
  const base = 'http://127.0.0.1:1/p1/';
  const shot = {
    html: `<div style="position: absolute; left: 10px; top: 20px; background-image: url(&quot;${base}assets/a%20b.png&quot;)"><img src="${base}assets/logo.png"><a href="https://openfilm.dev">x</a></div>`,
    fonts: [`@font-face { font-family: Brand; src: url("${base}fonts/b.woff2"); }`],
    base,
  };
  const out = pastedElsewhere(page, 'scenes/two.html', layer({ snapshot: shot }), new Set(['card-2']), 24, (p) => `pasted/p1/${p}`)!;
  assert.equal(out.at, '#card-3');
  assert.equal(out.text, '<html><body>\n<h2>Two</h2>\n'
    + '<style>@font-face { font-family: Brand; src: url("../pasted/p1/fonts/b.woff2"); }</style>\n'
    + '<div id="card-3" style="position: absolute; left: 10px; top: 20px; background-image: url(&quot;../pasted/p1/assets/a b.png&quot;); translate: 24px 24px">'
    + '<img src="../pasted/p1/assets/logo.png"><a href="https://openfilm.dev">x</a></div>\n</body></html>');
  assert.equal(pastedElsewhere(page, 'two.html', layer(), new Set(), 0), null, 'copied before its look was known');
});
