Method: dual-agent (A: /root/pitch_design_critique · B: /root/pitch_evidence_critique)

# Shortlist pitch critique and redesign

Audience: Charlton recruitment staff. Operate mode. Baseline: `a345cfe`, before this redesign. The independent baseline assessments were source-based; the isolated app initially reached sign-in. The implementation was subsequently checked using the actual component rendered with labelled illustrative data, not real recruitment records.

## Baseline design health

| Heuristic | /4 | Main finding |
|---|---:|---|
| System status | 3 | Counts and stage states are visible. |
| Real-world match | 3 | Recognisable formation; full-back placement uses corrective translation. |
| Control and freedom | 2 | Removing the last stage unexpectedly selects all stages. |
| Consistency | 2 | Repeated overrides and varied panel rules weaken coherence. |
| Error prevention | 2 | Uneven long lists can collide after full-back translation. |
| Recognition | 3 | Position, player, club and stage are explicit. |
| Efficiency | 2 | Five narrow defensive columns constrain readable density. |
| Minimalism | 2 | Small type and layered panel rules add clutter. |
| Recovery | 3 | Useful no-results guidance and a reset path. |
| Help | 3 | Caption explains positional counts and navigation. |
| Total | 25/40 | Useful workflow, inconsistent visual and geometric execution. |

Design specificity: the football grouping and recruitment stages are appropriate; the prior board feels bolted onto the shared workspace rather than deliberately composed within it. Preserve the product-specific positional structure, site typography, red action semantics and existing stage colours.

Working well: explicit role labels, correct player-profile links, accurate positional-entry totals, pending-edit/removal handling and archived-player exclusion.

## Priorities and implemented fixes

1. **P1 — translated full-backs do not reserve space.** Their heights never enter the offset calculation, so longer lists can overrun other content. Replaced the ResizeObserver and transforms with two equal-height halves. Full-backs begin in the first defensive track, exactly at halfway; their outer columns reserve the full list height. Centre-backs and GK occupy separate inner tracks. Suggested command: harden/layout.
2. **P2 — density sacrifices readability.** Prior 10–12px labels and inconsistent widths make scanning difficult. Standardised 13px player names, 11px club text and consistent rows; wider midfield groups use up to three columns. Attack groups share vertical tracks to avoid adding unnecessary height. Suggested command: typeset/distill.
3. **P2 — inconsistent styling and responsive behavior.** Replaced the accumulated overrides with a single pitch stylesheet and removed page-level pitch styling. Added an explicit phone reading layout and a correctly circular centre marking. Suggested command: adapt/polish.
4. **P2 — last-stage deselection unexpectedly selects everything.** At least one stage now remains selected; an explicit All stages control resets the shared filter. Suggested command: clarify/harden.
5. **P2 — custom-list hover text can be dark on green in the light theme.** Scoped neutral hover and foreground colours to Other selected lists. Suggested command: harden.

Persona checks: a staff member comparing full-back coverage can scan aligned groups at halfway; keyboard users retain named toggles, visible focus and profile links; phone users get a readable order and 44px touch rows. The all-player density choice preserves every name, so unusually dense shortlists grow vertically rather than becoming unreadably small or silently dropping players.

## Verification and limits

- TypeScript typecheck and all 15 relevant tests passed, including production filter tests, pending changes/removals, last-stage behavior and formation structure.
- Desktop and phone visual checks used the actual component with a labelled illustrative 26-entry dataset. Desktop field: 723px high; full-back group tops equal the measured halfway coordinate. Phone content width equals viewport width, with no horizontal overflow.
- Uneven dense fixture: 113 visible entries, zero intersecting position groups and zero groups outside the pitch. Full-backs remain exactly at halfway.
- Automated detector: zero findings; it did not catch the behavioural or geometry issues above.
- Signed-in application verification completed on 27 October using actual lists on port 3002: 82 positional entries across Stages 4 and 5, no overlapping groups, no groups outside the pitch and both full-back groups exactly at halfway. Stage 5 alone showed 8 entries; restoring Stages 4 and 5 restored all 82. Phone verification retained all 82 names with no hidden rows or horizontal overflow. No authentication bypass, recruitment-data modification, production deployment or analytics-checkout edits occurred.

Questions skipped for settled layout constraints. The user explicitly confirmed keeping every player name visible at once and completed sign-in. All names remain rendered without expansion controls; larger shortlists grow vertically rather than shrinking the type or hiding entries.


## Compact workspace and focus mode

Implemented the two selected preview directions: Compact as the default pitch density, with an optional Comfortable density and Club names toggle; Focus moves the same filtered pitch into a viewport-filling workspace. All player names and stage controls remain available. Escape and Exit focus return to the main workspace, restoring keyboard focus and page scrolling. Background controls are inert while focused. Desktop uses responsive columns rather than scaling typography; mobile retains 44px touch rows. At the current desktop viewport, the signed-in 82-entry shortlist fits in Focus. Larger datasets and narrower screens retain natural scrolling.


## Critique fixes

Added selected-list and applied-filter context, persistent sorting/profile hints, consistent row-first ordering, quiet numbered stage badges, labelled Focus dialog semantics, complete focus-loop coverage for form controls, a position selector with Alt+J, live entry counts and locally saved display preferences. Empty groups identify unselected lists separately from no matching players. Preserved the accepted winger and centre-back offsets. Targeted coverage includes filter context, position-jump focus, display persistence and Focus cleanup.


## Wide filter drawer

Implemented the user's approved drawer concept. Filters moved out of the sidebar into a 560px right-hand Offcanvas with Player, Reports and Recruitment sections and fixed footer actions. Applied chips support individual removal and Reset all. Tested Apply batching and closing, draft reset, Enter submission, chip removal and view-specific controls. Browser verified applying a club filter then removing its chip, Escape dismissal and full-width mobile layout with visible footer and no horizontal overflow.
