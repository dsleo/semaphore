# Compacting the git history (manual, rare)

Every data run can add a commit, so history grows. Measured on 2026-11-10 (14 data commits over 5 days): packed, a data commit
costs about 25 to 40 KB (transit.json about 46 %, roads.json 18 %, state.json 11 %, news-local.json 9 %). At the 30-minute floor that is
at most about 50 MB a month, far below GitHub's 1 GB guideline, so you probably need this only after a year, or if clones feel slow.
Cheaper first steps: raise the commit floor (`SHOULD_COMMIT_MIN_MINUTES=60` in the workflow's commit step halves growth).

## What it does
`compact.yml` (Actions tab → compact-history → Run workflow) squashes everything older than `keep_days` into ONE commit and
replays the newer commits on top. Code history older than the cut is squashed too, not only data.

## Safety
- **It rewrites `main` (force-push). Never run it unattended and never schedule it.** Run it only when nobody is pushing.
- Default is a dry run: it prints how many commits would be squashed and changes nothing.
- To apply: `apply=true` and `confirm=REWRITE-MAIN`. It first pushes a backup branch `backup/pre-compact-<timestamp>` with the old history.
- Everyone with a clone must re-clone (or `git fetch && git reset --hard origin/main`). Open pull requests need rebasing. Tags are not moved.
- Merge commits after the cut are flattened (history is linear here).

## Undo
```bash
git push --force origin backup/pre-compact-<timestamp>:main
```
Delete the backup branch only once you are sure; GitHub then reclaims the space (it can take a while, or ask support to run GC).

## Stronger option
Keep the data on an orphan branch that is force-pushed each run and serve Pages from it (no data history at all). That needs a workflow change.
