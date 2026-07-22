# Phase 4 (Agent Portal reconciliation) — Pass 1: auth pages + portal shell

## Context

This is the first pass of Phase 4 from `docs/DESIGN_SYSTEM_REFRESH.md`. Phase 4 brings
`pages/agents/*` / `components/agents/*` onto the same design-system token set as the rest of
the app (Phases 0-3.5), instead of leaving it as a third, unreconciled visual language.

Current state of the Agent Portal:
- Zero `useTheme` wiring anywhere in the subtree — no dark-mode support at all.
- Auth pages (`AgentLoginPage.tsx`, `AgentRegisterPage.tsx`, `AgentResetPasswordPage.tsx`) use a
  split-panel layout (brand panel + form panel) that is visually unrelated to the internal app's
  `LoginPage.tsx` (a centered card with a faint crest watermark, the Phase 0 style-tile winner).
- `AgentPortalShell.tsx` (the persistent nav header for logged-in agent pages) hardcodes
  `font-family: 'Inter'` (never loaded — silently degrades to system font), `#cc0000` (a
  near-miss of the real brand red `#B91C1C`), and `#0f172a` for its header background instead of
  the app's `--color-header-bg` graphite token.

Decisions confirmed with the user before writing this spec:
- **Dark mode is in scope for the Agent Portal.** Not staying fixed-appearance.
- **Sequencing**: auth pages + portal shell first (this pass); Dashboard/Submit/Detail/Edit
  forms + `RecommendationForm.tsx` (712 lines) as a second pass.
- **Login layout should be one shared, reusable component** between internal staff login and
  agent login — not two separate files that happen to look alike. This is a purely visual/code
  change: routing, the `/agents/login` URL, and the backend role-based redirect
  (`me.data.role === 'agent' ? '/agents/dashboard' : '/'`) are completely untouched.
- **Visual identity**: the Agent Portal should look like the *same system* as the internal app
  (same red/graphite palette, same IBM Plex fonts, same radius/shadow rules) — not a distinct
  "external" variant with its own emphasis.

## Scope (this pass)

1. `frontend/src/components/auth/AuthShell.tsx` — new shared component
2. `frontend/src/pages/LoginPage.tsx` — refactored to render through `AuthShell`
3. `frontend/src/pages/agents/AgentLoginPage.tsx` — refactored to render through `AuthShell`
4. `frontend/src/pages/agents/AgentRegisterPage.tsx` — refactored to render through `AuthShell`
   (wide variant)
5. `frontend/src/pages/agents/AgentResetPasswordPage.tsx` — refactored to render through
   `AuthShell`
6. `frontend/src/pages/agents/AgentLandingPage.tsx` — refactored to render through `AuthShell`
   (wide variant). **Added during self-review**: this page also uses the split-panel shell
   classes (confirmed via grep before finalizing this spec — it was originally scoped to Pass 2,
   but leaving it on the old shell would make deleting those classes in step 7 unsafe). Its other
   dependencies (`.agent-portal-card`, `.agent-portal-section-title`, `.agent-portal-grid`,
   `.agent-portal-surface-muted`, `.agent-portal-meta`, `.agent-portal-inline-actions`) are
   already dark-mode-fixed from the External/Internal Recommendations round, so the marginal
   cost of including it here is low: swap its shell to `AuthShell` and tokenize its two remaining
   inline hex values (`#111827`, `#0F172A`).
7. `frontend/src/components/agents/AgentPortalShell.tsx` — token/font swap, dark-mode wiring,
   and a reused `DarkModeToggle.tsx` added to the nav (previously no way for an agent to reach
   dark mode at all)
8. `frontend/src/styles/professional-theme.css` — new `AuthShell` variant CSS (wide-card
   modifier), dark-mode overrides for `AgentPortalShell`'s classes, and removal of now-dead
   split-panel auth CSS (`.agent-auth-page`, `.agent-auth-layout`, `.agent-auth-brand-panel`,
   `.agent-auth-brand-content`, `.agent-auth-heading`, `.agent-auth-badge`, `.agent-auth-copy`,
   `.agent-auth-form-panel`, `.agent-auth-card`, `.agent-auth-card-wide`, `.agent-mobile-brand`,
   `.agent-auth-title`, `.agent-auth-subtitle`) once all four pages above stop using them.

**Explicitly out of scope for this pass** (Pass 2): `AgentDashboardPage.tsx`,
`AgentSubmitPage.tsx`, `AgentEditSubmissionPage.tsx`, `AgentSubmissionDetailPage.tsx`,
`RecommendationForm.tsx`, `SubmissionStatusBadge.tsx`.

**Frozen, not touched by this or any pass** (per the standing constraint across this whole
engagement): `colorUtils.ts`, `playerLists.theme.ts`, the `getAttributeGroupColor` blocks,
Kanban card-state border colors, `ScoutingAssessmentModal.tsx`.

## Design

### `AuthShell.tsx`

Extracted from `LoginPage.tsx`'s existing markup/CSS (`.login-shell`, `.login-watermark`,
`.login-card`, `.login-card-header`, `.login-crest`, `.login-masthead`, `.login-heading`,
`.login-divider`), which is already fully token-based (`var(--color-*)`, `var(--font-*)`) and
therefore already dark-mode-correct. No new color decisions needed — this is a lift-and-
parameterize, not a redesign.

```tsx
interface AuthShellProps {
  eyebrow: string;       // small uppercase label above the heading, e.g. "Charlton Athletic"
  heading: string;        // e.g. "Recruitment & Scouting" / "External Recommendation Portal"
  wide?: boolean;          // widens the card for multi-column forms (Register)
  children: React.ReactNode;
}
```

Renders: watermark div, card (width driven by `wide`), crest + eyebrow + heading header block,
divider, then `children` (the page-specific form).

- `LoginPage.tsx`: `<AuthShell eyebrow="Charlton Athletic" heading="Recruitment & Scouting">` —
  visually unchanged, only the shell code moves.
- `AgentLoginPage.tsx`: `<AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal">`
  wrapping its existing sign-in form fields, register link, and reset-password copy.
- `AgentRegisterPage.tsx`: `<AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal" wide>`
  wrapping its existing 2-column field grid (agent name / agency / email / password / phone).
- `AgentResetPasswordPage.tsx`: `<AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal">`
  wrapping its existing new-password/confirm-password form.
- `AgentLandingPage.tsx`: `<AuthShell eyebrow="Charlton Athletic FC" heading="External Recommendation Portal" wide>`
  wrapping its existing three-step explainer and Register/Log In CTAs.

Copy (labels, helper text, "External Recommendation Portal" badge wording) is preserved as-is —
only the surrounding visual shell changes, so agents still land somewhere clearly labeled as the
agent portal, not a generic-looking staff login.

### `AgentPortalShell.tsx` + CSS

**Dark-mode toggle added to the nav.** The existing `components/DarkModeToggle.tsx` (used in the
internal Navbar) is fully generic — no internal-app-specific styling or props — so it's reused
as-is, dropped into the nav next to "Log Out". Without this, the dark-mode CSS work below would
be shipped but unreachable: `ThemeContext`'s `isDark` defaults to `false` and only changes via an
explicit toggle (no `prefers-color-scheme` fallback), and the Agent Portal currently has no
settings/nav menu of any kind to put one in.

```
Dashboard | Submit a Player | (dark-mode icon toggle) | Log Out
```

Token substitutions only, no structural/layout change beyond the toggle above:
- `font-family: 'Inter'` → `var(--font-body)`
- `#cc0000` (header accent bar, nav-link hover/active) → `var(--color-primary)`
- `#0f172a` (header background) → `var(--color-header-bg)`
- `.agent-portal-shell` background (currently a fixed light gradient behind the header/cards) →
  `var(--color-background)`, with the existing gradient kept as the light-mode value and a dark
  counterpart added
- `.agent-portal-eyebrow` (`#fca5a5`, a fixed light-red) and `.agent-portal-subtitle`
  (`rgba(255,255,255,0.7)`) sit on the always-dark header and don't need theme-conditional
  values — left as-is
- `.agent-portal-nav-link` background/text (`rgba(255,255,255,0.06)` / `#e5e7eb`) also sits on
  the always-dark header — left as-is

### CSS cleanup

Once `AgentLoginPage.tsx`, `AgentRegisterPage.tsx`, `AgentResetPasswordPage.tsx`, and
`AgentLandingPage.tsx` no longer render the split-panel layout, the following become dead and
get removed in the same pass (not deferred to Phase 5, since we're already touching every
consumer):
`.agent-auth-page`, `.agent-auth-layout`, `.agent-auth-brand-panel`, `.agent-auth-brand-content`,
`.agent-auth-heading`, `.agent-auth-copy`, `.agent-auth-form-panel`, `.agent-auth-card`,
`.agent-auth-card-wide`, `.agent-mobile-brand`.

**Correction found during implementation planning:** `.agent-auth-badge` and `.agent-auth-title`/
`.agent-auth-subtitle` were originally listed here too, but all three are still genuinely used —
`AgentLandingPage.tsx` keeps one `.agent-auth-badge` (its second, kept badge instance) and all
five migrated pages render `.agent-auth-title`/`.agent-auth-subtitle` inside `AuthShell`'s
children. None of the three are dead; moved to the "stays" list below.

Classes that stay (still consumed by the migrated `AuthShell` forms, the dashboard/submission
side, or Pass 2 territory): `.agent-auth-badge`, `.agent-auth-title`, `.agent-auth-subtitle`,
`.agent-auth-label`, `.agent-auth-input`, `.agent-auth-phone-input`, `.agent-auth-button`,
`.agent-auth-alert`, `.agent-auth-inline-link`, `.agent-auth-actions`.

## Verification

- `tsc --noEmit`, `eslint` per changed file (compare warning count against `main` baseline),
  frozen-file diff (`colorUtils.ts`, `playerLists.theme.ts`, Kanban border files,
  `ScoutingAssessmentModal.tsx`) — same Track 1 discipline as every prior round this session.
- Live check in both light and dark mode: internal `LoginPage.tsx` unchanged, agent login/
  register/reset/landing pages render through the shared shell correctly, `AgentPortalShell`
  header/nav correct in both themes (including the new toggle actually switching), no regression
  to the routing/redirect behavior (agent → `/agents/dashboard`, staff → `/`).

## Not decided by this spec (Pass 2 will cover)

- `RecommendationForm.tsx` and the rest of the dashboard/submission pages' token conversion.
- Whether the auth pages (pre-login, so no `AgentPortalShell` nav) need their own dark-mode
  toggle. Pass 1 leaves them theme-*aware* (they'll render correctly in whichever mode is
  currently active in `localStorage`) but without a toggle control, since there's no established
  place to put one on an unauthenticated page and `LoginPage.tsx` doesn't have one either —
  consistent with existing behavior, not a new gap introduced by this pass.
