---
name: Charlton Recruitment Platform
description: Existing staff interface for recruitment lists and positional shortlists.
colors:
  primary: "#b91c1c"
  pitch-heading: "#d60000"
  pitch-surface: "#234b3b"
  pitch-panel: "#17382d"
  pitch-text: "#f5f5f7"
  stage-one: "#6b7280"
  stage-two: "#f59e0b"
  stage-three: "#3b82f6"
  stage-four: "#16a34a"
  stage-five: "#7c3aed"
  light-surface: "#ffffff"
  light-background: "#f8f9fa"
typography:
  display:
    fontFamily: "IBM Plex Sans Condensed, Arial Narrow, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "IBM Plex Sans, Arial, sans-serif"
    lineHeight: 1.5
  mono:
    fontFamily: "IBM Plex Mono, monospace"
rounded:
  control: "4px"
  card: "8px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
---

# Design System: Charlton Recruitment Platform

## Overview

This is a descriptive record of the existing implementation for live refinement, not a new design direction. Preserve the Charlton identity, IBM Plex typography, existing theme support and football-specific positional layout.

## Colors

Red identifies club and selected-list controls. Shared recruitment-stage colours carry the same meaning in tables and pitches; do not repurpose them as decoration. The shortlist pitch uses restrained green field and panel tokens, white player names and pale green club labels. The page inherits the shared site theme, including surface, text, border and form colours. The navigation carries the club crest; avoid repeating it inside the pitch. Recruitment-stage colours retain their meanings. Position labels remain light against the field.

## Typography

Global display typography uses IBM Plex Sans Condensed; UI copy uses IBM Plex Sans; numerical and technical roles can use IBM Plex Mono. Internal Lists uses a restrained IBM Plex Sans page title and player labels, with smaller club names beneath. Preserve the loaded fonts.

## Layout

Internal Lists uses a desktop sidebar with name search and collapsible advanced filters above a vertical list selector, beside a wider table/pitch workspace. Stage selection and stage counts form one control group; there is no duplicate shortlist heading or date. The shortlist pitch keeps a vertical football formation with attack at the top and goalkeeper at the bottom. It uses two equal-height halves: the full-back groups start at the top of the defensive half, exactly at halfway, and reserve their full height in outer columns. Wingers start calc(4.5rem + 10px) below CF. Centre-backs start 8.5rem below the full-backs in inner columns and GK is centred below. No JavaScript positioning or translated full-back panels are used. The pitch uses a single coherent set of component rules, subdued grass bands, a truly circular centre marking and quiet outlines. Player names are 13px and clubs 11px; comfortable midfield groups use up to three columns. Compact density is the pitch default: 26px desktop rows, responsive player columns inside each position and club names hidden until enabled. The Compact/Comfortable controls and Club names toggle preserve all player entries. Focus opens the same pitch in a viewport-filling workspace with navigation and filters hidden; Exit focus or Escape returns to the workspace and restores keyboard focus. Mobile keeps 44px rows and scrolls naturally rather than shrinking names. All names remain visible. Phones use an explicit reading layout, with CF, midfield and GK spanning the width; touch rows are at least 44px. Stage selection keeps at least one stage active and provides an explicit All stages reset. Compact filters provide one persistent search, one reset action, an active-category count, and explicit score-range inputs. Stage selection is shown above the pitch rather than duplicated in the sidebar. Keep the pitch and controls visible while filtered data refreshes.

## Elevation & Depth

The pitch is predominantly flat, with tonal separation between player groups and position headers. A fine border separates the main workspace from the surrounding page; the sidebar uses spacing and a divider rather than stacked cards.

## Shapes

The pitch uses rectangular player panels with gently rounded corners and a straight field outline. Stage controls and sidebar list buttons use small corner radii; selected lists show a red check. Empty positions use quiet dashed outlines. The main workspace has a larger corner radius.

## Components

Stage controls are toggle buttons exposing pressed state. Player names link to profiles. List selectors are toggle buttons in both pill and positional layouts. Keep selected state, visible keyboard focus and existing profile navigation intact in variants.

## Do's and Don'ts

- Preserve recruitment-stage colour meanings and factual player content.
- Keep shortlist counts labelled as positional entries.
- Preserve keyboard interaction and filter semantics.
- Refine within the existing identity unless explicitly asked to redesign.
- Do not treat today's heading date as proof of data freshness.


## Pitch review refinements

Both densities read across player rows, ordered by highest stage then name. Sorting and profile-navigation guidance remain visible. Stage badges retain colour-coded borders and numbers with subdued tinted fills. Focus is a labelled modal dialog with background inertness, a complete focus loop, Escape and focus restoration. The context strip retains selected-list count and applied filter values. A position selector with Alt+J focuses semantic position headings without hiding any players. Display density and club labels persist locally, with graceful storage failure. Empty positions distinguish unselected lists from no matching players. Compact rows stay 26px on desktop and 44px on mobile; Comfortable remains available for larger reading targets.


## Loading feedback

Initial loading reserves the sidebar and table workspace using static theme-aware skeletons, with a single accessible loading announcement. Refreshes retain existing results, controls and keyboard focus. A reserved status line prevents loading text from pushing the pitch down; after eight seconds it explains the delay without inventing progress. Retry is available on failures, including inside Focus. Loading never triggers an empty-result message. Only the small indicator rotates; reduced-motion users receive a static indicator.


## Filter actions

Compact filter criteria scroll within a bounded panel, keeping full-width Apply and Reset buttons directly beneath them. Search and the filter toggle remain separate from the action group. Draft edits show Changes not applied; Apply is enabled only for pending changes and Enter submits the filter form. Reset clears draft and applied criteria immediately and remains available when an active filter is cleared in the draft. The help line reserves its space to avoid moving the actions. Competition and reason menus use fixed positioning to escape the scrolling panel.


## Approved filter drawer

The user selected concept 1, the wide right-hand drawer (reference: exec-9a299c76-37b2-4b97-b29b-6bef9d92a308.png). Internal Lists now keeps only list selection in the left sidebar. The Filters launcher and removable applied-filter chips sit above the workspace. A 560px drawer groups Player, Reports and Recruitment; its body scrolls independently of a fixed Apply/Reset footer. Apply submits the complete draft and closes the drawer; closing alone retains the draft and shows Unapplied changes. Reset clears both draft and applied criteria. Table-only stage and archived-player controls remain available in table view; pitch stages remain above the pitch. On mobile the drawer fills the viewport with fixed actions. Bootstrap Offcanvas supplies dialog focus management, Escape and restoration. The drawer follows site light/dark tokens and preserves the chosen pitch geometry.
