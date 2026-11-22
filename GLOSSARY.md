# Glossary

**Solaria**: The tool. Shows the issues of the repos a person configures as a universe they can pan, zoom and watch change.

**Universe**: The whole picture Solaria draws, built from every configured repo.

**Galaxy**: One configured repo, as it appears in the universe.

**Map**: An open issue whose title starts with `Map: ` or `Mapa: `. Groups other issues (its sub-issues). Drawn as a **Sun**.
_Avoid_: epic, parent issue.

**Planet**: An issue that belongs to a Map, orbiting that Map's Sun.

**External Planet**: A Planet whose issue lives in a repo outside the universe. Shown orbiting its Map's Sun, but without pull request signals.

**Gas**: The cloud of issues in a repo that belong to no Map.
_Avoid_: orphan (in user-facing text).

**Satellite**: The mark on an open issue showing who it is assigned to. Its label is the first assignee, plus a count when there are more (`alice +2`).

**Comet**: A newly opened pull request, travelling to the issue it closes.

**Repo requirements**: The conventions a repo and its issues must follow for Solaria to show them as expected. Fixed, not configurable.
_Avoid_: setup, configuration (those mean the user's own config file).
