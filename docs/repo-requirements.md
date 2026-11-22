# Repo requirements

Solaria draws the GitHub issues of the repos you list as a spatial Universe. It is an open-source, English-only tool that runs locally.

This guide lists what your repos and issues must look like for Solaria to show them as expected. The conventions are fixed. You cannot configure them.

Solaria only reads. It never writes to GitHub, and there is nothing to install in your repos. It reads two things: issues (with their sub-issues, assignees and blocking links) and pull requests (with the issues they close and whether they are drafts).

Each rule below ends with what you see if you skip it.

## Tier 1: Required

You need three things:

1. The repo is listed in `solaria.config.json` as `owner/repo`.
2. Issues are turned on for the repo (Settings, Features, Issues).
3. Your token can read the repo. A fine-grained, read-only token with Issues and Pull requests read access is enough. Metadata read is implicit. For private repos owned by an organization, the org may need to approve the token or you may need to authorize it for SSO. A fine-grained token has one owner, so private repos under several owners need one token each, set as `GITHUB_TOKEN_<OWNER>` (see below). A classic token also works: it needs the `repo` scope for private repos, and it can write, so prefer fine-grained.

With only this, every open issue appears as Gas (an issue that belongs to no Map), and each issue is either To do or Done. Each repo is a Galaxy.

If you skip a requirement, you see an error on that Galaxy: Token rejected, No access, or Repo not found.

Per-owner tokens: name the variable `GITHUB_TOKEN_<OWNER>` with the owner uppercased and `-` replaced by `_`, for example `GITHUB_TOKEN_MY_ORG` for `my-org`. It wins over `GITHUB_TOKEN` for that owner's repos. Solaria does not fall back to the main token if an owner token fails.

## Tier 2: Recommended

### Maps

A Map is an open issue whose title starts with `Map: ` and that has sub-issues. `Mapa: ` is also accepted, but use `Map: `. A Map is drawn as a Sun, and its sub-issues orbit it as Planets.

Example:

```
Map: Dark mode            <- open issue with sub-issues
  Add a dark mode toggle
  Dark palette for charts
  Remember the theme choice
```

Use GitHub's native sub-issues feature to attach the children. Sub-issues can live in another repo. If that repo is also in your config, the child is a normal Planet. If it is not, the child is shown as an External Planet, tagged "external", with no pull request signals. Closed sub-issues are read too, so a Map's progress shows as "3 of 8".

Traps:

- A parent without the `Map: ` prefix is not a Map. Its sub-issues become Gas.
- A Map without sub-issues is not drawn as a Map. Add at least one.
- A sub-issue titled `Map: …` never becomes a Planet.
- Closed Maps disappear.

If you skip this, every issue is Gas. The Galaxy shows the "No Maps yet" card: "These issues belong to no Map yet. Open an issue titled "Map: …" and add sub-issues to it."

### Blocked issues

An open issue is Blocked when:

- its body has a line starting with `Blocked by:` followed by issue references, or
- it has GitHub's native "blocked by" link to another issue.

Example body line:

```
Blocked by: #12, acme/api#4
```

References can be written three ways: `#12` is the same repo, `repo#12` is the same owner, and `owner/repo#12` is any repo. The issue stays Blocked only while at least one blocker is still open.

References to repos that are not in `solaria.config.json` do not block anything. They show as plain text in the issue's detail card.

If you skip this, blocked issues show as To do.

### Pull requests

Solaria links a pull request to an issue through GitHub's own list of issues the PR closes. That list comes from closing keywords in the PR description (`Closes #42`, `Fixes #42`, `Resolves acme/api#42`) and from links made in the PR's Development box.

Example PR description:

```
Closes #42
```

- A linked draft PR makes the issue Draft PR open.
- A linked ready PR makes the issue In review.
- Merged or closed PRs are shown as events (see below).

Text that merely mentions an issue number, such as "see #42", is not a link.

A PR that closes an issue in a repo not in `solaria.config.json` does not change that issue. The ref is not shown anywhere: the PR still appears, but its log line reads `PR #12 opened` with no ref. Add that repo to the config to see the link.

If you skip this, issues with PRs stay To do, and Solaria cannot tell that work is under way.

### Assignees

Assign people to issues on GitHub. Any open issue with an assignee gets a Satellite, in every open state. The Satellite is labelled with the first assignee, plus a count when there are more, such as `alice +2`. Hover to see all names. Done issues have no Satellite.

Assigning someone does not change the issue's state. Only a draft PR does.

If you skip this, no Satellites appear.

## Tier 3: Optional

Empty for now. Tier 2 gives every signal Solaria reads.

## How Solaria picks a state

For each issue, the first rule that applies wins:

1. Done: the issue is closed.
2. In review: a ready PR closes it.
3. Blocked: it has an open blocker.
4. Draft PR open: a draft PR closes it.
5. To do: none of the above.

## Events

Solaria also shows changes between refreshes as events in the Activity log and the Universe: Big Bang (new Map), Rift (new issue with no Map), Flare (new issue inside a Map), Adopt (existing issue added to a Map), Comet (PR opened), Close (issue closed), Supernova (PR merged), and Fade (PR closed without merging). No extra setup is needed.

## What you do on GitHub, what Solaria shows

| What you do on GitHub | What Solaria shows |
| --- | --- |
| List the repo in `solaria.config.json` | A Galaxy for the repo |
| Open an issue | A Planet in a Map, or Gas if it has no Map |
| Open an issue titled `Map: …` and add sub-issues | A Sun with its sub-issues as Planets |
| Add an existing issue as a sub-issue of a Map | Adopt event; the issue moves out of the Gas |
| Add a sub-issue from a repo that is not configured | An External Planet, tagged "external" |
| Write `Blocked by: #12, acme/api#4` in the body, or use GitHub's blocked-by link | Blocked, until all blockers are closed |
| Open a draft PR with `Closes #42` | Issue #42 shows Draft PR open; Comet event |
| Mark the PR ready for review | Issue #42 shows In review |
| Merge the PR | Supernova event; issue #42 is Done once GitHub closes it |
| Close the PR without merging | Fade event |
| Assign people to an open issue | A Satellite, such as `alice +2` |
| Close an issue | Done; Close event |

## Not read by Solaria

- Branches and branch names
- Commits and commit trailers
- Labels, including `en-curso`
- GitHub Actions and checks
- Issue text other than the `Blocked by:` line

Because of this, the token never needs Contents permission.

## Starting fresh

1. Create the repo and turn on Issues.
2. Create a token (fine-grained, read-only, Issues and Pull requests read) and add the repo to `solaria.config.json`.
3. Open one issue titled `Map: <your goal>`.
4. Add the first issues as its sub-issues.
5. Write `Closes #N` in your PR descriptions, and open them as drafts while work is under way.

## Troubleshooting

| What you see | Likely cause | Fix |
| --- | --- | --- |
| An issue is in the Gas, but you expected it in a Map | It is not a sub-issue of a Map. The parent may lack the `Map: ` prefix, the parent may be closed, or the issue is only mentioned in the parent's text | Add it as a sub-issue (not a task-list line) of an open `Map: ` issue |
| The Map is not drawn as a Sun | The title does not start with `Map: ` (check the colon and the space), the issue has no sub-issues, or it is closed | Fix the prefix, add a sub-issue, or reopen it |
| The whole repo is Gas, with a "No Maps yet" card | The repo has no open issue titled `Map: …` with sub-issues | Create one and add sub-issues |
| A child titled `Map: …` is missing as a Planet | A Map never becomes a Planet | Rename the child if it should be a Planet |
| A private repo is missing or shows "No access" | The token lacks access to that owner, the org has not approved it, or SSO is not authorized | Approve or authorize the token, or add a `GITHUB_TOKEN_<OWNER>` for that owner |
| A repo shows "Token rejected" | The token used for that owner (`GITHUB_TOKEN_<OWNER>` if set, otherwise `GITHUB_TOKEN`) is invalid or expired | Make a new token, put it in `.env`, then restart |
| A repo shows "Repo not found" | Typo in `solaria.config.json` or the token cannot see it | Check the `owner/repo` spelling |
| A cross-repo reference appears only as text in the issue card | That repo is not in `solaria.config.json` | Add the repo to the config |
| An issue with a PR still shows To do | The PR does not close it: the PR body only mentions the number, or the keyword is missing | Write `Closes #42` or link it in the Development box |
| An issue is not Blocked when you expected it | The `Blocked by:` line does not start the line, the reference is to a repo outside your config, or the blocker is already closed | Put `Blocked by:` at the start of a line, and check that the blocker is open and in a configured repo |
| An assigned issue is not marked Draft PR open | Assignees show a Satellite but do not change the state | Open a draft PR that closes it |
| An issue branch or `en-curso` label has no effect | Solaria does not read branches, commits or labels | Use assignees and draft PRs |
