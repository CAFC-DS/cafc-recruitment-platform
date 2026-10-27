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

Internal Lists uses a desktop sidebar with name search and collapsible advanced filters above a vertical list selector, beside a wider table/pitch workspace. Stage selection and stage counts form one control group; there is no duplicate shortlist heading or date. The shortlist pitch keeps a vertical football formation with attack at the top and goalkeeper at the bottom. It uses two equal-height halves: the full-back groups start at the top of the defensive half, exactly at halfway, and reserve their full height in outer columns. Centre-backs sit below that line in inner columns and GK is centred below. No JavaScript positioning or translated full-back panels are used. The pitch uses a single coherent set of component rules, subdued grass bands, a truly circular centre marking and quiet outlines. Player names are 13px and clubs 11px; wide midfield groups use up to three columns. All names remain visible. Phones use an explicit reading layout, with CF, midfield and GK spanning the width; touch rows are at least 44px. Stage selection keeps at least one stage active and provides an explicit All stages reset. Compact filters provide one persistent search, one reset action, an active-category count, and explicit score-range inputs. Stage selection is shown above the pitch rather than duplicated in the sidebar. Keep the pitch and controls visible while filtered data refreshes.

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
