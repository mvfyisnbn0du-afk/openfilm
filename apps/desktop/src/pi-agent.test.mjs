import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentSession } from './agents.mjs';

/** A service on the Chat Completions API that answers "ok" and notes the model each request named. */
async function service() {
  const asked = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const { model } = JSON.parse(body || '{}');
      asked.push(model);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (choice, extra = {}) => `data: ${JSON.stringify({ id: 'c', object: 'chat.completion.chunk', created: 0, model, choices: [choice], ...extra })}\n\n`;
      res.end(chunk({ index: 0, delta: { role: 'assistant', content: 'ok' }, finish_reason: null })
        + chunk({ index: 0, delta: {}, finish_reason: 'stop' }, { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
        + 'data: [DONE]\n\n');
    });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return { asked, url: `http://127.0.0.1:${server.address().port}/v1`, close: () => server.close() };
}

test('the own key\'s agent offers its models as the session\'s model option, and a turn after a switch goes to that model', { timeout: 60_000 }, async () => {
  const svc = await service();
  const session = new AgentSession({
    agent: 'byok',
    cwd: mkdtempSync(join(tmpdir(), 'of-pi-')),
    harness: {
      home: mkdtempSync(join(tmpdir(), 'of-pi-home-')),
      provider: { id: 'byok', api: 'openai-completions', baseUrl: svc.url, apiKeyEnv: 'OPENFILM_BYOK_KEY' },
      model: 'vision', models: ['vision', 'big'],
      env: { OPENFILM_BYOK_KEY: 'sk-test' },
    },
  });
  try {
    const info = await session.start();
    const option = info.configOptions.find((o) => o.id === 'model');
    assert.equal(option.category, 'model');
    assert.equal(option.currentValue, 'vision', 'the first model to begin with');
    assert.deepEqual(option.options.map((o) => o.value), ['vision', 'big']);
    await session.prompt([{ type: 'text', text: 'hi' }]);
    const switched = await session.setConfigOption('model', 'big');
    assert.equal(switched.configOptions[0].currentValue, 'big');
    await session.prompt([{ type: 'text', text: 'again' }]);
    assert.deepEqual(svc.asked, ['vision', 'big']);
    await assert.rejects(session.setConfigOption('model', 'other'), 'a model the key does not name is refused');
  } finally {
    session.close();
    svc.close();
  }
});
