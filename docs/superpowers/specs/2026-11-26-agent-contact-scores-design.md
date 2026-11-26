# Agent contact book: scores — design

Status: approved 2026-11-26 (from the mockup). Size: small change. Builds on
`2026-11-26-agent-contact-book-design.md`.

## Intent

Rank agents by the quality of what they send: show each agent's average performance score and
average data score next to their name, and each player's own scores in the accordion.

## What changes

- **Agent row:** two sortable columns after Agent, headed **"Average performance"** and
  **"Average data score"** (no abbreviations). Highest first on first click. A hover gives the basis:
  "Average of 9 scouted players (of 22 recommended)" / "Average of 14 players with a data score (of 22
  recommended)". No scores → "—".
- **Accordion:** two columns after Age, headed **"Performance"** and **"Data score"**, using the same
  chips as External Recommendations (`GradeChip` 1 dp, `ListDataScore`). Missing → "—".

## Decided details

- **Source:** the per-recommendation values External Recommendations already uses —
  `AVG_PERFORMANCE_SCORE` and the linked external player's data score — read through
  `build_recommendation_select()`, so both pages always agree.
- **Averages count each player once:** recommendations are de-duplicated per agent by linked player
  (LINKED_UNIVERSAL_ID, else LINKED_CAFC_PLAYER_ID, else LINKED_PLAYER_ID, else normalised name).
  A player counts towards an average only if they have that score.
- **Data score average** is the mean of the players' headline values (career, else CH index), shown
  in its CH band colour (bands 116/108/103/98/92), rounded to a whole number.
- **Visibility follows today's rules:** performance scores hidden from Intel Reviewers; data scores
  only for admin and senior_manager. The backend returns `null` for hidden values; the page hides
  the columns for Intel Reviewers.

## Non-goals

New data, new tables, changing how per-player scores are computed.
