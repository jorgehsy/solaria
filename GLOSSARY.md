# Glossary

**Solaria**: The tool. Shows the issues of the repos a person configures as a universe they can pan, zoom and watch change.

**Universe**: The whole picture Solaria draws, built from every configured repo.

**Galaxy**: One configured repo, as it appears in the universe.

**Focus**: The up to 3 Galaxies with the most open issues, drawn full size in the centre of the universe. Chosen automatically from every snapshot, never by clicking.

**Horizon**: The ring of small Galaxies near the screen edges: every Galaxy not in Focus, labelled by repo name only.

**Map**: An open issue whose title starts with `Map: ` or `Mapa: `. Groups other issues (its sub-issues). Drawn as a **Sun**.
_Avoid_: epic, parent issue.

**Planet**: An issue that belongs to a Map, orbiting that Map's Sun.

**External Planet**: A Planet whose issue lives in a repo outside the universe. Shown orbiting its Map's Sun, but without pull request signals.

**Gas**: The cloud of issues in a repo that belong to no Map.
_Avoid_: orphan (in user-facing text).

**Satellite**: The mark on an open issue showing who it is assigned to. Its label is the first assignee, plus a count when there are more (`alice +2`).

**Comet**: A newly opened pull request, travelling to the issue it closes.

**Event**: One change between two snapshots, shown as a line in the Activity log and as an animation in the universe. Every event has one of the space names below.

**Big Bang**: The event of a new Map appearing.

**Rift**: The event of a new issue that belongs to no Map, so it joins the Gas.

**Flare**: The event of a new issue that is born inside a Map.

**Adopt**: The event of an existing issue being added to a Map.

**Close**: The event of an issue being closed.

**Supernova**: The event of a pull request being merged.

**Fade**: The event of a pull request being closed without merging.

**Repo requirements**: The conventions a repo and its issues must follow for Solaria to show them as expected. Fixed, not configurable.
_Avoid_: setup, configuration (those mean the user's own config file).
