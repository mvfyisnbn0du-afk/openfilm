import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmPendingDiscard } from './pending-dialog.mjs';

for (const visible of [true, false]) {
  test(`discard confirmation is visible with window visible=${visible}, and cancellation releases dispatch`, async () => {
    const calls = [], window = { isVisible: () => visible }, options = { message: 'Pending' };
    const result = await confirmPendingDiscard({ window, options, suspend: (value) => calls.push(value),
      showMessageBox: async (...args) => {
        assert.deepEqual(args, visible ? [window, options] : [options]);
        return { response: 1 };
      },
    });
    assert.equal(result, false);
    assert.deepEqual(calls, [true, false]);
  });
}
test('approved discard keeps dispatch held until the page is destroyed; dialog errors release it', async () => {
  const calls = [];
  assert.equal(await confirmPendingDiscard({ options: {}, suspend: (value) => calls.push(value), showMessageBox: async () => ({ response: 0 }) }), true);
  assert.deepEqual(calls, [true]);
  calls.length = 0;
  await assert.rejects(confirmPendingDiscard({ options: {}, suspend: (value) => calls.push(value), showMessageBox: async () => { throw new Error('dialog failed'); } }));
  assert.deepEqual(calls, [true, false]);
});

test('a second close, reload or quit cannot release the pending confirmation', async () => {
  const calls = [];
  let answer;
  const options = { suspend: value => calls.push(value), showMessageBox: () => new Promise(resolve => { answer = resolve; }) };
  const first = confirmPendingDiscard(options);
  assert.equal(await confirmPendingDiscard(options), false);
  assert.deepEqual(calls, [true]);
  answer({ response: 1 });
  assert.equal(await first, false);
  assert.deepEqual(calls, [true, false]);
});
