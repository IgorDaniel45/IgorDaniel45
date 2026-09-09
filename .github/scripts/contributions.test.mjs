import test from 'node:test';
import assert from 'node:assert/strict';
import { render, updateReadme, fetchContributions, START, END } from './contributions.mjs';
const pr = (name = 'kyverno/kyverno', state = 'OPEN', title = 'Fix precision') => ({
  number: 42, title, state,
  repository: { nameWithOwner: name, isPrivate: false, owner: { login: name.split('/')[0] } },
});
const response = (nodes, hasNextPage = false, endCursor = null) => ({ ok: true,
  json: async () => ({ data: { search: { nodes, pageInfo: { hasNextPage, endCursor } } } }),
});

test('groups projects, limits rows and links, and shows actual states', () => {
  const table = render([pr(), pr('kyverno/kyverno', 'MERGED'), pr(),
    ...Array.from({ length: 8 }, (_, i) => pr(`org/repo${i}`))]);
  assert.equal(table.split('\n').length, 8);
  assert.equal((table.match(/\/pull\/42/g) || []).length, 7);
  assert.match(table, /— Open<br>.*— Merged/);
  assert.doesNotMatch(table, /repo5/);
});
test('filters private, own, and unmerged closed PRs', () => {
  assert.throws(() => render([pr('igordaniel45/demo'), pr('org/repo', 'CLOSED'),
    { ...pr(), repository: { ...pr().repository, isPrivate: true } }]), /preserving/);
});
test('escapes untrusted titles and rejects unsafe URLs', () => {
  const table = render([pr('org/repo', 'OPEN', '<img> | [x](url)\n`code` & !')]);
  assert.doesNotMatch(table, /<img>|\[x\]|`code`/);
  assert.match(table, /&#124;/);
  assert.throws(() => render([pr('org/evil/path')]), /Invalid/);
  assert.throws(() => render([{ ...pr(), number: -1 }]), /Invalid/);
});
test('preserves surrounding README and is idempotent', () => {
  const source = `intro\n${START}\nold table\n${END}\nfooter`;
  const result = updateReadme(source, render([pr()]));
  assert.ok(result.startsWith(`intro\n${START}`));
  assert.ok(result.endsWith(`${END}\nfooter`));
  assert.equal(updateReadme(result, render([pr()])), result);
  for (const bad of ['', `${END}${START}`, `${START}${START}${END}`]) {
    assert.throws(() => updateReadme(bad, 'table'), /markers/);
  }
});
test('paginates using cursor and a fixed API endpoint', async () => {
  let calls = 0;
  const result = await fetchContributions('test-token', async (url, options) => {
    assert.equal(url, 'https://api.github.com/graphql');
    assert.equal(options.redirect, 'error');
    const variables = JSON.parse(options.body).variables;
    assert.equal(variables.cursor, calls === 0 ? null : 'next');
    return calls++ === 0 ? response([pr()], true, 'next') : response([pr('org/second')]);
  });
  assert.equal(result.length, 2);
});
test('fails on missing credentials, API errors, malformed results, and bad pagination', async () => {
  await assert.rejects(fetchContributions(''), /required/);
  for (const reply of [{ ok: false, status: 403 },
    { ok: true, json: async () => ({ errors: [{}] }) },
    { ok: true, json: async () => ({}) }, response([], true)]) {
    await assert.rejects(fetchContributions('test', async () => reply));
  }
});
test('bounds pagination to 1000 results', async () => {
  let count = 0;
  const result = await fetchContributions('test', async () => response([pr()], true, String(++count)));
  assert.equal(count, 10);
  assert.equal(result.length, 10);
});
