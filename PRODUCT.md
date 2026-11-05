# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Charlton Athletic recruitment staff reviewing positional shortlists and recruitment stages.

## Product Purpose

Support internal football recruitment review through player lists, stages and player profiles.

## Operating Context

Internal Lists provides table and shortlist pitch views. The pitch groups selected lists by football position. Stage filters control which positional entries appear. A player can appear in more than one position.

## Capabilities and Constraints

Existing React and TypeScript frontend with a local FastAPI backend. Internal Lists requires staff sign-in and existing access checks. Live design work changes the local interface, not recruitment records. Stage 1 through Stage 5 are active stages; archived entries are excluded from the shortlist pitch.

## Brand Commitments

Preserve existing Charlton branding and incumbent interface appearance unless the user requests a redesign. Preserve player data and existing recruitment functionality.

## Evidence on Hand

Existing application, club logo assets, shared stage colours and shortlist pitch components. The current task concerns Internal Lists at /lists/internal.

## Product Principles

- Keep positional coverage and recruitment stages understandable.
- Preserve accurate player data and existing access controls.
- Make filters and selection controls consistent across views.

## Open Decisions

Whether the pitch primarily supports Stage 4/5 meetings or everyday work across all stages remains undecided.

## Analytics context

### Product and users

An internal recruitment platform for Charlton recruitment staff. It supports evaluating players, recording scouting assessments, managing recruitment stages and reviewing scouting coverage and activity. The existing application uses React with TypeScript, FastAPI and Snowflake.

### Durable constraints

Preserve Charlton branding, existing access permissions, data and core recruitment workflows. Keep the incumbent visual language, including IBM Plex typography, restrained Charlton red (`#b91c1c`), theme support and established recruitment-stage semantics. Analytics must link back to existing player profiles and make the meaning and limits of its figures clear.

### Analytics scope

The current rework covers the whole `/analytics` page within the existing platform shell. It provides a balanced overview, shared filters, manually selected Pipeline / Player map / Coverage / Activity views and drilldowns. The wider platform redesign is explicitly out of scope. Page-specific decisions and evidence belong in `.impeccable/surfaces/analytics.md` and `docs/analytics-rework.md`, not in a replacement global identity.

### Context provenance

No root PRODUCT.md existed before this documentation pass. This file records product truth already confirmed for the scoped analytics work; it does not imply a new discovery interview, a complete platform product specification or a global redesign approval.
