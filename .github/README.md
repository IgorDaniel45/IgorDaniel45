# Contribution list automation

`workflows/contributions.yml` refreshes the README daily at 09:23 UTC
(06:23 in Bahia), on generator changes pushed to main, or through Actions →
Update open source contributions → Run workflow.

The generator uses the built-in GITHUB_TOKEN; no personal token or npm packages
are needed. It searches up to 1,000 recently updated public PRs by IgorDaniel45,
excludes own repositories, drafts and closed unmerged PRs, and displays up to
six projects with two PRs each. GitHub's updated time determines ordering.
Titles are escaped and links are constructed from validated repository names.

Only content between the contributions markers in README.md is replaced.
API errors, empty results or invalid markers fail the job without replacing the
existing list. The job commits only README.md, and only when it changes.
Push conflicts fail safely without a force push; rerun the workflow afterward.
Branch rules must permit the bot to push for automatic commits to succeed.
GitHub may delay scheduled jobs or disable schedules after 60 days without
repository activity; re-enable the workflow in Actions if needed.

Run the tests locally with Node.js 20 or newer:

```sh
node --test --experimental-test-coverage .github/scripts/contributions.test.mjs
```
