# Charlton recruitment platform

## Product and users

An internal recruitment platform for Charlton recruitment staff. It supports evaluating players, recording scouting assessments, managing recruitment stages and reviewing scouting coverage and activity. The existing application uses React with TypeScript, FastAPI and Snowflake.

## Durable constraints

Preserve Charlton branding, existing access permissions, data and core recruitment workflows. Keep the incumbent visual language, including IBM Plex typography, restrained Charlton red (`#b91c1c`), theme support and established recruitment-stage semantics. Analytics must link back to existing player profiles and make the meaning and limits of its figures clear.

## Current scope

The current rework covers the whole `/analytics` page within the existing platform shell. It provides a balanced overview, shared filters, manually selected Pipeline / Player map / Coverage / Activity views and drilldowns. The wider platform redesign is explicitly out of scope. Page-specific decisions and evidence belong in `.impeccable/surfaces/analytics.md` and `docs/analytics-rework.md`, not in a replacement global identity.

## Context provenance

No root PRODUCT.md existed before this documentation pass. This file records product truth already confirmed for the scoped analytics work; it does not imply a new discovery interview, a complete platform product specification or a global redesign approval.
