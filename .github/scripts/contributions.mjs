import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const START = '<!-- contributions:start -->';
export const END = '<!-- contributions:end -->';
const author = 'IgorDaniel45';

// Encode external titles as text, never as executable HTML or Markdown.
export function escapeText(text) {
  return text.replace(/\s+/g, ' ').replace(/[&<>|\[\]\\`*_!]/g,
    char => `&#${char.codePointAt(0)};`);
}

export function render(nodes) {
  const projects = new Map();
  for (const pr of nodes) {
    if (pr.repository.isPrivate || pr.repository.owner.login.toLowerCase() === author.toLowerCase()
      || !['OPEN', 'MERGED'].includes(pr.state)) continue;
    const name = pr.repository.nameWithOwner;
    if (!/^[\w.-]+\/[\w.-]+$/.test(name) || !Number.isSafeInteger(pr.number) || pr.number < 1
      || typeof pr.title !== 'string') throw new Error('Invalid pull request data');
    if (!projects.has(name) && projects.size < 6) projects.set(name, []);
    const entries = projects.get(name);
    if (entries && entries.length < 2) {
      entries.push(`[${escapeText(pr.title)}](https://github.com/${name}/pull/${pr.number}) — ${pr.state === 'MERGED' ? 'Merged' : 'Open'}`);
    }
  }
  if (!projects.size) throw new Error('No contributions returned; preserving README');
  return ['| Project | Pull requests |', '| --- | --- |', ...Array.from(projects,
    ([name, entries]) => `| [${escapeText(name)}](https://github.com/${name}) | ${entries.join('<br>')} |`)].join('\n');
}

export function updateReadme(readme, table) {
  if (readme.split(START).length !== 2 || readme.split(END).length !== 2
    || readme.indexOf(START) > readme.indexOf(END)) throw new Error('Invalid contribution markers');
  return readme.slice(0, readme.indexOf(START) + START.length)
    + '\n\n' + table + '\n\n' + readme.slice(readme.indexOf(END));
}

export async function fetchContributions(token, request = fetch) {
  if (!token) throw new Error('GITHUB_TOKEN is required');
  const nodes = [];
  let cursor = null;
  // GitHub search exposes up to 1,000 results; inspect the most recently updated.
  for (let page = 0; page < 10; page++) {
    const response = await request('https://api.github.com/graphql', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query($query: String!, $cursor: String) {
          search(query: $query, type: ISSUE, first: 100, after: $cursor) {
            nodes { ... on PullRequest { number title state repository { nameWithOwner isPrivate owner { login } } } }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        variables: { query: `is:pr author:${author} is:public -user:${author} -is:draft sort:updated-desc`, cursor },
      }),
    });
    if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
    const result = await response.json();
    if (result.errors || !Array.isArray(result.data?.search?.nodes)) throw new Error('GitHub query failed');
    nodes.push(...result.data.search.nodes);
    const info = result.data.search.pageInfo;
    if (!info.hasNextPage) return nodes;
    if (!info.endCursor || info.endCursor === cursor) throw new Error('Invalid pagination cursor');
    cursor = info.endCursor;
  }
  return nodes;
}

export async function main() {
  const readme = await readFile('README.md', 'utf8');
  const table = render(await fetchContributions(process.env.GITHUB_TOKEN));
  const updated = updateReadme(readme, table);
  if (updated !== readme) await writeFile('README.md', updated);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
