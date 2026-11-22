# Signals come from issues and pull requests only

The original artifact read branches (`<type>/<N>-slug`, `claude/…`), commit trailers (`Co-authored-by: Claude`, `Claude-Session:`) and an `en-curso` label to show who was working on an issue right now, and whether it was a person or Claude. Solaria drops all of that. A Satellite now means "this open issue is assigned", labelled with the first assignee (`alice +2` when there are more, all names on hover). A linked **draft** pull request counts as *doing*; a ready one counts as *in review*.

We chose this over keeping a "busy now" signal because every option for it was fragile: the `en-curso` label stays forever unless someone removes it (it needed a hook to add it), and branch activity only shows once a branch is pushed and costs extra API calls per repo. Assignees and draft PRs are plain GitHub data that every team already uses, and they cannot get stuck.

## Consequences

- The token needs only Issues and Pull requests read access; no Contents permission.
- Fewer API calls per refresh: no branch or commit lookups.
- Solaria no longer tells Claude's work apart from a person's, and galaxies no longer glow from `claude/…` branches.
- "Who is on it" is shown, not "is anyone typing right now". An assigned issue nobody touches still shows a Satellite.
- This overrides the charting note that said to keep every current signal.
