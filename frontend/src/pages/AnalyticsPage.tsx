import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  lazy,
  Suspense,
} from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Container,
  Form,
  OverlayTrigger,
  Row,
  Spinner,
  Table,
  Tooltip,
} from "react-bootstrap";
import { ArrowRight, X } from "lucide-react";
import { Link as RouterLink, useSearchParams } from "react-router-dom";
import axiosInstance from "../axiosInstance";
import { useCurrentUser } from "../hooks/useCurrentUser";
import PipelineChart from "../components/analytics/recruitment/PipelineChart";
import SimpleStatsCard from "../components/analytics/SimpleStatsCard";
import PositionMultiSelect from "../components/analytics/PositionMultiSelect";
import AnalyticsDashboardShimmer from "../components/analytics/AnalyticsDashboardShimmer";
import PlayerMap from "../components/analytics/recruitment/PlayerMap";
import {
  AnalyticsData,
  COLORS,
  flowLabel,
  number,
  percentage,
  playerPath,
  positionLabel,
  ReportRow,
  STAGES,
} from "../components/analytics/recruitment/types";
import "./AnalyticsPage.css";

const PlayerAnalytics = lazy(
  () => import("../components/analytics/PlayerAnalyticsTab"),
);
const MatchTeamAnalytics = lazy(
  () => import("../components/analytics/MatchTeamAnalyticsTab"),
);
const ScoutAnalytics = lazy(
  () => import("../components/analytics/ScoutAnalyticsTab"),
);
const StageAnalytics = lazy(
  () => import("../components/analytics/StageMovementAnalyticsTab"),
);
const SECTIONS = [
  {
    id: "overview",
    label: "Overview",
    description: "Activity, pipeline and market coverage at a glance.",
  },
  {
    id: "players",
    label: "Player analytics",
    description:
      "Report timelines, reports by position, player rankings, score thresholds and attribute-based player search.",
  },
  {
    id: "matches",
    label: "Match & team analytics",
    description:
      "Monthly match reports, competition and team breakdowns, and detailed team coverage by scout.",
  },
  {
    id: "scouts",
    label: "Scout analytics",
    description: "Scout activity, comparisons and performance metrics.",
  },
  {
    id: "stages",
    label: "Stage analytics",
    description:
      "Stage transitions, archive counts, players in each stage and unique players who appeared during the period.",
  },
];

/** Stage filter choices; values are what the backend expects. */
const STAGE_CHOICES = [
  ...STAGES.map((s) => ({ value: s, label: s })),
  { value: "Archived", label: "Archived" },
  { value: "Unlisted", label: "Not on a list" },
  { value: "Unknown", label: "No history" },
];
const SHORTLIST = ["Stage 3", "Stage 4", "Stage 5"];
const stageName = (v: string) =>
  STAGE_CHOICES.find((c) => c.value === v)?.label || v;
/** Drilldown source meaning "any entry onto a list" (first entry or re-addition). */
const ADDED = "Added";
const ENTRY_SOURCES = ["New entrants", "List additions"];
const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
/** URL parameters that belong to a drilldown, cleared when leaving it. */
const DETAIL_PARAMS = [
  "detail",
  "from",
  "to",
  "country",
  "category",
  "position",
  "month",
  "club",
  "stage",
  "market",
  "map_stages",
];
const DETAIL_TITLES: Record<string, string> = {
  teams: "Team coverage",
  competitions: "Coverage by league",
  pipeline: "Stage movements",
  reports: "Reports completed",
  "senior-reports": "Senior scout reports",
  fixtures: "Fixtures covered",
  senior: "Senior scout coverage",
  map: "Shortlist locations",
  players: "Players covered",
};
const CATEGORY_TITLES: Record<string, string> = {
  new: "Players on a list for the first time",
  progressed: "Players who moved up a stage",
  archived: "Players archived",
};
type ReportRowWithRows = ReportRow & { rows: ReportRow[] };
const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const defaults = () => {
  const end = new Date(),
    start = new Date();
  start.setDate(end.getDate() - 89);
  return { start_date: localIso(start), end_date: localIso(end) };
};
const FILTERS = [
  "start_date",
  "end_date",
  "stages",
  "competitions",
  "countries",
  "positions",
  "clubs",
  "scouts",
  "mode",
];
const dateLabel = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const monthLabel = (month: string) =>
  new Date(`${month}-01T12:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });

function RecruitmentDashboard() {
  const [params, setParams] = useSearchParams();
  const initial = () =>
    Object.fromEntries(
      FILTERS.map((k) => [
        k,
        params.get(k) || (defaults() as Record<string, string>)[k] || "",
      ]),
    );
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [more, setMore] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const detail = params.get("detail") || "";
  const [closing, setClosing] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const openedFrom = useRef<{
    y: number | null;
    focus: HTMLElement | null;
    toTop: boolean;
  }>({ y: null, focus: null, toTop: false });
  const requestKey = FILTERS.map(
    (k) =>
      `${k}=${params.get(k) || (defaults() as Record<string, string>)[k] || ""}`,
  ).join("&");
  useEffect(() => {
    setDraft(
      initial(),
    ); /* URL is the applied filter source, including browser back. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const request = Object.fromEntries(
      FILTERS.map((k) => [
        k,
        params.get(k) || (defaults() as Record<string, string>)[k] || undefined,
      ]),
    );
    axiosInstance
      .get<AnalyticsData>("/analytics/recruitment", {
        params: request,
        signal: controller.signal,
      })
      .then((r) => {
        if (!controller.signal.aborted) setData(r.data);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e.response?.data?.detail ||
              "Analytics could not be loaded. Please try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retry]);
  const detailKey = DETAIL_PARAMS.map((k) => params.get(k) || "").join("|");
  // Opening a drilldown keeps the chart in view: flow and stage clicks only
  // scroll when the panel would land low on screen; figure clicks bring it
  // to the top. Focus moves to the panel heading and returns on close.
  useEffect(() => {
    if (!detail || !data) return;
    const frame = requestAnimationFrame(() => {
      const panel = detailRef.current;
      if (!panel) return;
      const behavior = reducedMotion() ? "auto" : "smooth";
      const top = panel.getBoundingClientRect().top;
      if (openedFrom.current.toTop)
        panel.scrollIntoView?.({ behavior, block: "start" });
      else if (top > window.innerHeight * 0.6)
        window.scrollBy?.({ top: top - window.innerHeight * 0.55, behavior });
      document.getElementById("ra-table-title")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [detailKey, !!data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPage(1);
    setQuery("");
  }, [detailKey, requestKey]);
  function navigate(updates: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    Object.entries(updates).forEach(([k, v]) =>
      v ? next.set(k, v) : next.delete(k),
    );
    setParams(next);
  }
  /** Open a drilldown directly under the section it came from (`at`). */
  function openDetails(
    kind: string,
    extra: Record<string, string> = {},
    at = "pipeline",
  ) {
    if (!detail)
      openedFrom.current = {
        y: window.scrollY,
        focus: document.activeElement as HTMLElement | null,
        toTop: false,
      };
    navigate({
      ...Object.fromEntries(DETAIL_PARAMS.map((k) => [k, undefined])),
      detail: kind,
      view: at,
      ...extra,
    });
  }
  function closeDetails() {
    const { y, focus } = openedFrom.current;
    const finish = () => {
      setClosing(false);
      navigate(Object.fromEntries(DETAIL_PARAMS.map((k) => [k, undefined])));
      if (focus?.isConnected) focus.focus({ preventScroll: true });
    };
    if (reducedMotion()) {
      if (y !== null) window.scrollTo({ top: y });
      return finish();
    }
    // Scroll back while the panel collapses, then remove it, so closing
    // glides instead of snapping when a long table disappears.
    setClosing(true);
    if (y !== null) window.scrollTo({ top: y, behavior: "smooth" });
    let done = false;
    const once = () => {
      if (done) return;
      done = true;
      window.removeEventListener("scrollend", once);
      finish();
    };
    window.addEventListener("scrollend", once);
    window.setTimeout(once, 900);
  }
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDetails();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  // Earlier links used ?view= for tabs; land on the matching section once.
  const landed = useRef(false);
  useEffect(() => {
    if (!data || landed.current) return;
    landed.current = true;
    const legacy = params.get("view");
    if (legacy && !detail)
      document
        .getElementById(`ra-${legacy}`)
        ?.scrollIntoView?.({ block: "start" });
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  function apply(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(params);
    FILTERS.forEach((k) => (draft[k] ? next.set(k, draft[k]) : next.delete(k)));
    setParams(next);
  }
  const pct = (a: number, b: number) => percentage(a, b);
  const singleFlow = !!(params.get("from") && params.get("to"));
  const flowColour = singleFlow
    ? COLORS[params.get("to")!] || COLORS["New entrants"]
    : undefined;
  const figureOpen = (kind: string) =>
    detail === kind &&
    !["position", "country", "club", "market", "month", "stage"].some((k) =>
      params.get(k),
    );
  const filterToLeague = (name: string) =>
    navigate({
      ...Object.fromEntries(DETAIL_PARAMS.map((k) => [k, undefined])),
      competitions: name,
    });
  const filteredPlayers = useMemo(
    () =>
      data?.players.filter((p) => {
        return (
          (!params.get("country") || p.country === params.get("country")) &&
          (!params.get("position") || p.position === params.get("position")) &&
          (!params.get("club") || p.club === params.get("club")) &&
          (!params.get("stage") || p.stage === params.get("stage")) &&
          (!params.get("market") || p.in_market) &&
          (detail !== "senior" || p.senior) &&
          (!["players", "coverage"].includes(detail) || p.reports > 0) &&
          (detail !== "map" ||
            (params.get("map_stages")?.split("|") || STAGES.slice(2)).includes(
              p.stage,
            ))
        );
      }) || [],
    [data, params, detail],
  );
  const events =
    data?.events.filter(
      (e) =>
        (!params.get("from") ||
          (params.get("from") === ADDED
            ? ENTRY_SOURCES.includes(e.from)
            : e.from === params.get("from"))) &&
        (!params.get("to") || e.to === params.get("to")) &&
        (!params.get("category") || e.category === params.get("category")),
    ) || [];
  const reports =
    data?.reports.filter(
      (r) =>
        (!params.get("month") || r.date.startsWith(params.get("month")!)) &&
        (detail !== "senior-reports" || r.senior),
    ) || [];
  const fixtures = Array.from(
    reports
      .filter((r) => r.fixture)
      .reduce((all, r) => {
        const f = all.get(String(r.fixture)) || {
          ...r,
          rows: [] as typeof reports,
        };
        f.rows.push(r);
        return all.set(String(r.fixture), f);
      }, new Map<string, ReportRowWithRows>())
      .values(),
  ).sort((a, b) => (b.fixture_date || "").localeCompare(a.fixture_date || ""));
  const fixtureName = (label: string | null) => label || "Fixture not found";
  const seniorReports = data?.seniors.reduce((s, x) => s + x.reports, 0) || 0;
  let table: {
    head: string[];
    numeric?: number[];
    rows: { key: string; values: React.ReactNode[]; search: string }[];
  } = { head: [], rows: [] };
  if (detail === "teams")
    table = {
      head: [
        "Club",
        "League",
        "Players covered",
        "Players at club",
        "Coverage",
      ],
      numeric: [2, 3, 4],
      rows: (data?.teams || []).map((t) => ({
        key: `${t.competition}-${t.name}`,
        search: `${t.name} ${t.competition}`,
        values: [
          <button
            className="ra-text-action"
            onClick={() => openDetails("players", { club: t.name })}
          >
            {t.name}
          </button>,
          t.competition,
          number(t.covered),
          number(t.total),
          pct(t.covered, t.total),
        ],
      })),
    };
  else if (detail === "competitions")
    table = {
      head: [
        "League",
        "Teams covered",
        "Team coverage",
        "Players covered",
        "Player coverage",
      ],
      numeric: [1, 2, 3, 4],
      rows: (data?.competitions || []).map((c) => ({
        key: c.name,
        search: c.name,
        values: [
          <button
            className="ra-text-action"
            onClick={() => filterToLeague(c.name)}
            title="Filter the overview to this league"
          >
            {c.name}
          </button>,
          `${number(c.covered_teams)} / ${number(c.teams)}`,
          pct(c.covered_teams, c.teams),
          `${number(c.covered_players)} / ${number(c.players)}`,
          pct(c.covered_players, c.players),
        ],
      })),
    };
  else if (detail === "pipeline")
    table = {
      // A single-flow drilldown already names its movement in the heading.
      head: [
        "Player",
        ...(singleFlow ? [] : ["Movement"]),
        "Current club",
        "Changed on",
        "Changed by",
      ],
      rows: events.map((e, i) => ({
        key: `${e.player_id}-${i}`,
        search: `${e.name} ${e.club} ${e.scout} ${e.from} ${e.to}`,
        values: [
          <RouterLink to={playerPath(e.player_id)}>{e.name}</RouterLink>,
          ...(singleFlow
            ? []
            : [
                <span className="ra-movement">
                  <i
                    style={{
                      background: COLORS[e.from] || COLORS["New entrants"],
                    }}
                  />
                  {e.from} → {e.to}
                  <i style={{ background: COLORS[e.to] }} />
                </span>,
              ]),
          e.club,
          dateLabel(e.date),
          e.scout,
        ],
      })),
    };
  else if (detail === "reports" || detail === "senior-reports")
    table = {
      head: ["Player", "Scout", "Report date", "Method", "Fixture"],
      rows: reports.map((r) => ({
        key: String(r.id),
        search: `${r.name} ${r.scout} ${r.mode} ${r.fixture_label || ""}`,
        values: [
          <RouterLink to={playerPath(r.player_id)}>{r.name}</RouterLink>,
          <>
            {r.scout}
            {r.senior && <span className="badge bg-dark ra-tag">Senior</span>}
          </>,
          dateLabel(r.date),
          r.mode,
          r.fixture
            ? `${fixtureName(r.fixture_label)}${r.fixture_date ? ` · ${dateLabel(r.fixture_date)}` : ""}`
            : "Not linked to a fixture",
        ],
      })),
    };
  else if (detail === "fixtures")
    table = {
      head: ["Fixture", "Played", "Method", "Reports", "Scouts"],
      numeric: [3],
      rows: fixtures.map((f) => ({
        key: String(f.fixture),
        search: `${f.fixture_label || ""} ${f.rows.map((r) => r.scout).join(" ")}`,
        values: [
          fixtureName(f.fixture_label),
          f.fixture_date ? dateLabel(f.fixture_date) : "—",
          Array.from(new Set(f.rows.map((r) => r.mode))).join(" + "),
          number(f.rows.length),
          Array.from(new Set(f.rows.map((r) => r.scout))).join(", "),
        ],
      })),
    };
  else
    table = {
      head: [
        "Player",
        "Position",
        "Current club",
        "Playing country",
        "Stage",
        "Reports in period",
        "All-time reports",
        "Senior scout",
      ],
      numeric: [5, 6],
      rows: filteredPlayers.map((p) => ({
        key: p.player_id,
        search: `${p.name} ${positionLabel(p.position)} ${p.club} ${p.country}`,
        values: [
          <RouterLink to={playerPath(p.player_id)}>{p.name}</RouterLink>,
          positionLabel(p.position),
          p.club,
          p.country,
          <span className="ra-movement">
            <i style={{ background: COLORS[p.stage] || "var(--ra-faint)" }} />
            {p.stage}
          </span>,
          number(p.reports),
          number(p.reports_all),
          p.senior ? "Seen in period" : "—",
        ],
      })),
    };
  const searched = table.rows.filter((r) =>
    r.search.toLowerCase().includes(query.toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(searched.length / 25));
  const detailTitle =
    DETAIL_TITLES[detail] ||
    (params.get("stage")
      ? `${params.get("stage")} players`
      : "Players covered");
  const tableNoun =
    detail === "pipeline"
      ? "movements"
      : detail === "reports" || detail === "senior-reports"
        ? "reports"
        : detail === "fixtures"
          ? "fixtures"
          : detail === "teams"
            ? "clubs"
            : detail === "competitions"
              ? "leagues"
              : "players";
  const extraCount = [
    "competitions",
    "countries",
    "positions",
    "clubs",
    "scouts",
    "mode",
  ].filter((k) => draft[k]).length;
  const select = (
    key: string,
    label: string,
    options: { value: string; label: string }[],
    multiple = false,
  ) => (
    <label className="ra-filter" key={key}>
      <span>{label}</span>
      <select
        multiple={multiple}
        value={
          multiple ? (draft[key] ? draft[key].split("|") : []) : draft[key]
        }
        onChange={(e) =>
          setDraft({
            ...draft,
            [key]: multiple
              ? Array.from(e.target.selectedOptions)
                  .map((o) => o.value)
                  .join("|")
              : e.target.value,
          })
        }
      >
        {!multiple && (
          <option value="">
            {{
              Position: "All positions",
              "Playing country": "All countries",
              Club: "All clubs",
              Scout: "All scouts",
              Method: "Live and video",
            }[label] || `All ${label.toLowerCase()}`}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
  const opts = (items: string[]) => items.map((v) => ({ value: v, label: v }));
  const draftStages = draft.stages ? draft.stages.split("|") : [];
  const setStages = (list: string[]) =>
    setDraft({
      ...draft,
      // keep the backend's stage order regardless of click order
      stages: STAGE_CHOICES.map((c) => c.value)
        .filter((v) => list.includes(v))
        .join("|"),
    });
  const applied = (k: string) =>
    params.get(k) || (defaults() as Record<string, string>)[k] || "";
  const scope = [
    `${dateLabel(applied("start_date"))} – ${dateLabel(applied("end_date"))}`,
    params.get("competitions")?.split("|").join(", ") || "All leagues",
    params.get("stages")
      ? params.get("stages")!.split("|").map(stageName).join(", ")
      : "All stages",
    ...["countries", "positions", "clubs"]
      .map((k) =>
        k === "positions" && params.get(k)
          ? positionLabel(params.get(k)!)
          : params.get(k),
      )
      .filter(Boolean),
    params.get("scouts")
      ? data?.options.scouts.find(([id]) => id === params.get("scouts"))?.[1]
      : "",
    params.get("mode") === "live"
      ? "Live only"
      : params.get("mode") === "video"
        ? "Video only"
        : "",
  ].filter(Boolean);

  const selectedFlow =
    detail === "pipeline" && params.get("from") && params.get("to")
      ? { from: params.get("from")!, to: params.get("to")! }
      : undefined;
  const at = params.get("view") || "pipeline";

  // A section in the platform's own card style: black header, plain body.
  const panel = (
    id: string,
    title: string,
    body: React.ReactNode,
    action?: React.ReactNode,
  ) => (
    <section className="ra-card-wrap" id={`ra-${id}`}>
      <Card className="ra-card">
        <Card.Header className="ra-card-header">
          <h6 className="mb-0">{title}</h6>
          {action}
        </Card.Header>
        <Card.Body>{body}</Card.Body>
      </Card>
      {detail && at === id && detailCard()}
    </section>
  );
  const headerLink = (label: string, onClick: () => void) => (
    <button type="button" className="ra-header-link" onClick={onClick}>
      {label} <ArrowRight size={14} aria-hidden="true" />
    </button>
  );

  const pipelineBody = (d: AnalyticsData) => (
    <>
      <p className="ra-summary-line">
        {[
          { key: "new", label: "first time on a list" },
          { key: "progressed", label: "moved up a stage" },
          { key: "archived", label: "archived" },
        ].map((m, i) => (
          <React.Fragment key={m.key}>
            {i > 0 && <span className="ra-sep">·</span>}
            <button
              type="button"
              className="ra-inline-stat"
              onClick={() =>
                openDetails("pipeline", { category: m.key }, "pipeline")
              }
            >
              <strong>
                {number(d.summary[m.key as "new" | "progressed" | "archived"])}
              </strong>{" "}
              players {m.label}
            </button>
          </React.Fragment>
        ))}
      </p>
      <PipelineChart
        links={d.links}
        stageCounts={d.stage_counts}
        selected={selectedFlow}
        onSelect={(l) =>
          openDetails("pipeline", { from: l.from, to: l.to }, "pipeline")
        }
        onSelectStage={(s) => openDetails("stage", { stage: s }, "pipeline")}
      />
    </>
  );

  const marketBody = (d: AnalyticsData) => (
    <>
      <Row className="g-3 mb-3">
        <Col md={6}>
          <button
            type="button"
            className="ra-stat-button"
            onClick={() => openDetails("teams", {}, "coverage")}
          >
            <SimpleStatsCard
              title="Teams covered"
              value={pct(d.market.covered_teams, d.market.teams)}
              subtitle={`${number(d.market.covered_teams)} of ${number(d.market.teams)} clubs`}
            />
          </button>
        </Col>
        <Col md={6}>
          <button
            type="button"
            className="ra-stat-button"
            onClick={() => openDetails("players", { market: "1" }, "coverage")}
          >
            <SimpleStatsCard
              title="Players covered"
              value={pct(d.market.covered_players, d.market.players)}
              subtitle={`${number(d.market.covered_players)} of ${number(d.market.players)} players at those clubs`}
            />
          </button>
        </Col>
      </Row>
      <Table hover striped size="sm" className="ra-table table-compact mb-0">
        <thead className="table-dark">
          <tr>
            <th>League</th>
            <th className="is-num">Teams covered</th>
            <th className="is-num">%</th>
            <th className="is-num">Players covered</th>
            <th className="is-num">%</th>
          </tr>
        </thead>
        <tbody>
          {d.competitions.slice(0, 10).map((c) => (
            <tr key={c.name}>
              <td>
                <button
                  type="button"
                  className="ra-cell-link"
                  onClick={() => filterToLeague(c.name)}
                >
                  {c.name}
                </button>
              </td>
              <td className="is-num">
                {number(c.covered_teams)} / {number(c.teams)}
              </td>
              <td className="is-num">{pct(c.covered_teams, c.teams)}</td>
              <td className="is-num">
                {number(c.covered_players)} / {number(c.players)}
              </td>
              <td className="is-num">{pct(c.covered_players, c.players)}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );

  const positionsBody = (d: AnalyticsData) => (
    <Table hover striped size="sm" className="ra-table table-compact mb-0">
      <thead className="table-dark">
        <tr>
          <th>Position</th>
          <th className="is-num">Players covered</th>
          <th className="is-num">At clubs</th>
          <th className="is-num">Coverage</th>
        </tr>
      </thead>
      <tbody>
        {d.positions
          .filter((p) => p.players || p.total)
          .map((p) => (
            <tr key={p.name}>
              <td>
                <button
                  type="button"
                  className="ra-cell-link"
                  onClick={() =>
                    openDetails("players", { position: p.name }, "map")
                  }
                >
                  {positionLabel(p.name)}
                </button>
              </td>
              <td className="is-num">{number(p.players)}</td>
              <td className="is-num">{number(p.total)}</td>
              <td className="is-num">{pct(p.covered, p.total)}</td>
            </tr>
          ))}
      </tbody>
    </Table>
  );

  const mapBody = (d: AnalyticsData) => (
    <PlayerMap
      countries={d.countries}
      onSelect={(country, stages) =>
        stages
          ? openDetails(
              "map",
              { country, map_stages: stages.join("|") },
              "locations",
            )
          : openDetails("players", { country }, "locations")
      }
    />
  );

  const activityBody = (d: AnalyticsData) => {
    const peak = Math.max(1, ...d.timeline.map((m) => m.reports));
    return (
      <Row className="g-4">
        <Col lg={7}>
          {!d.timeline.length ? (
            <p className="text-muted mb-0">No reports in these dates.</p>
          ) : (
            <ol className="ra-months" aria-label="Reports by month">
              {d.timeline.map((m) => (
                <li key={m.month}>
                  <button
                    type="button"
                    onClick={() =>
                      openDetails("reports", { month: m.month }, "activity")
                    }
                    aria-label={`${monthLabel(m.month)}: ${number(m.reports)} reports. View reports.`}
                  >
                    <strong>{number(m.reports)}</strong>
                    <span className="ra-month-bar" aria-hidden="true">
                      <span
                        style={{ height: `${(100 * m.reports) / peak}%` }}
                      />
                    </span>
                    <span className="ra-month-name">{monthLabel(m.month)}</span>
                    <small>
                      {m.live} live · {m.video} video
                    </small>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </Col>
        <Col lg={5}>
          <Table
            hover
            striped
            size="sm"
            className="ra-table table-compact mb-0"
          >
            <thead className="table-dark">
              <tr>
                <th>Senior scout</th>
                <th className="is-num">Reports</th>
                <th className="is-num">Players</th>
              </tr>
            </thead>
            <tbody>
              {d.seniors.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td className="is-num">{number(s.reports)}</td>
                  <td className="is-num">{number(s.players)}</td>
                </tr>
              ))}
              <tr className="ra-total-row">
                <td>Together</td>
                <td className="is-num">{number(seniorReports)}</td>
                <td className="is-num">{number(d.summary.senior_players)}</td>
              </tr>
            </tbody>
          </Table>
        </Col>
      </Row>
    );
  };

  const stats = (d: AnalyticsData) => {
    const figures = [
      {
        kind: "fixtures",
        title: "Fixtures covered",
        value: number(d.summary.fixtures),
        subtitle: `${number(d.summary.live)} live · ${number(d.summary.video)} video`,
      },
      {
        kind: "players",
        title: "Players covered",
        value: number(d.summary.players),
      },
      {
        kind: "reports",
        title: "Reports completed",
        value: number(d.summary.reports),
      },
      {
        kind: "senior-reports",
        title: "Senior scout reports",
        value: number(seniorReports),
        subtitle: d.seniors
          .map((s) => `${s.name.split(" ")[0]} ${number(s.reports)}`)
          .join(" · "),
      },
      {
        kind: "senior",
        title: "Senior coverage",
        value:
          d.summary.senior_coverage === null
            ? "—"
            : `${d.summary.senior_coverage}%`,
        subtitle: `${number(d.summary.senior_players)} of ${number(d.summary.players)} players`,
      },
    ];
    return (
      <section className="ra-card-wrap" id="ra-figures">
        <Row
          className="g-3 ra-stats"
          role="group"
          aria-label="Headline figures"
        >
          {figures.map((f) => (
            <Col key={f.kind} lg md={4} sm={6}>
              <button
                type="button"
                className="ra-stat-button"
                aria-pressed={figureOpen(f.kind)}
                onClick={() => openDetails(f.kind, {}, "figures")}
              >
                <SimpleStatsCard
                  title={f.title}
                  value={f.value}
                  subtitle={f.subtitle}
                />
              </button>
            </Col>
          ))}
        </Row>
        {detail && at === "figures" && detailCard()}
      </section>
    );
  };

  const detailHeading = params.get("from")
    ? `${params.get("from") === ADDED ? "Added to a list" : flowLabel(params.get("from")!)} → ${params.get("to")}`
    : params.get("country") ||
      (params.get("position") && positionLabel(params.get("position")!)) ||
      params.get("club") ||
      (params.get("category") && CATEGORY_TITLES[params.get("category")!]) ||
      detailTitle;

  function detailCard() {
    return (
      <Card
        ref={detailRef as React.Ref<HTMLDivElement>}
        id="ra-detail"
        className={`ra-card ra-detail${closing ? " is-closing" : ""}`}
        style={
          flowColour
            ? ({ "--ra-flow": flowColour } as React.CSSProperties)
            : undefined
        }
        aria-labelledby="ra-table-title"
      >
        <Card.Header className="ra-card-header">
          <h6 className="mb-0" id="ra-table-title" tabIndex={-1}>
            {detailHeading}
            <span className="ra-header-count">
              {number(searched.length)} {tableNoun}
              {params.get("month")
                ? ` · ${monthLabel(params.get("month")!)}`
                : ""}
            </span>
          </h6>
          <div className="d-flex align-items-center gap-2">
            <Form.Control
              size="sm"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search"
              aria-label="Search these results"
              className="ra-header-search"
            />
            <Button
              variant="light"
              size="sm"
              onClick={closeDetails}
              aria-label="Close and return"
            >
              <X size={14} aria-hidden="true" /> Close
            </Button>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table
              hover
              striped
              size="sm"
              className="ra-table table-compact mb-0"
            >
              <thead className="table-dark">
                <tr>
                  {table.head.map((h, i) => (
                    <th
                      scope="col"
                      key={h}
                      className={
                        table.numeric?.includes(i) ? "is-num" : undefined
                      }
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {searched
                  .slice(
                    (Math.min(page, pageCount) - 1) * 25,
                    Math.min(page, pageCount) * 25,
                  )
                  .map((r) => (
                    <tr key={r.key}>
                      {r.values.map((v, i) => (
                        <td
                          key={i}
                          className={
                            table.numeric?.includes(i) ? "is-num" : undefined
                          }
                        >
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                {!searched.length && (
                  <tr>
                    <td colSpan={table.head.length} className="text-muted">
                      Nothing matches. Clear the search or widen the filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
          {pageCount > 1 && (
            <div className="ra-pagination">
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span>
                Page {Math.min(page, pageCount)} of {pageCount}
              </span>
              <Button
                variant="outline-secondary"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </Card.Body>
      </Card>
    );
  }

  const filtersDirty = FILTERS.some((k) => (draft[k] || "") !== applied(k));
  const filterInfo = (
    <Tooltip id="ra-filter-info">
      Every filter applies to every section. League, country, position and club
      also set the size of the market; dates, stage, scout and method only
      change who counts as covered. Stage means each player's stage on the end
      date. "First time on a list" is a player's first ever first-team list
      entry; "Re-added" is a player listed again.
    </Tooltip>
  );

  return (
    <Container className="ra-overview">
      <header className="ra-header">
        <h1>Recruitment analytics</h1>
        <p>{scope.join(" · ")}</p>
      </header>
      <Card className="shadow-sm mb-4">
        <Card.Body className="py-3">
          <form className="ra-filter-row" onSubmit={apply} aria-label="Filters">
            <span className="ra-filter-label">Filters:</span>
            <label className="ra-inline-field">
              <span>From</span>
              <Form.Control
                size="sm"
                type="date"
                required
                max={draft.end_date || localIso(new Date())}
                value={draft.start_date}
                onChange={(e) =>
                  setDraft({ ...draft, start_date: e.target.value })
                }
              />
            </label>
            <label className="ra-inline-field">
              <span>To</span>
              <Form.Control
                size="sm"
                type="date"
                required
                min={draft.start_date}
                max={localIso(new Date())}
                value={draft.end_date}
                onChange={(e) =>
                  setDraft({ ...draft, end_date: e.target.value })
                }
              />
            </label>
            <div className="ra-inline-field">
              <span>Stage:</span>
              <PositionMultiSelect
                selected={draftStages}
                options={STAGE_CHOICES.map((c) => c.value)}
                onChange={setStages}
                allLabel="All stages"
                noun={["stage", "stages"]}
                optionLabel={stageName}
                presets={[{ label: "Shortlist (3–5)", values: SHORTLIST }]}
                idPrefix="ra-stage"
                width={150}
              />
            </div>
            <div className="ra-inline-field">
              <span>League:</span>
              <PositionMultiSelect
                selected={
                  draft.competitions ? draft.competitions.split("|") : []
                }
                options={data?.options.competitions || []}
                onChange={(list) =>
                  setDraft({ ...draft, competitions: list.join("|") })
                }
                allLabel="All leagues"
                noun={["league", "leagues"]}
                searchable
                idPrefix="ra-league"
                width={170}
              />
            </div>
            <Button
              variant="outline-secondary"
              size="sm"
              aria-expanded={more}
              aria-controls="analytics-more-filters"
              onClick={() => setMore(!more)}
            >
              More filters
              {extraCount ? ` (${extraCount})` : ""}
            </Button>
            <Button
              type="submit"
              variant="dark"
              size="sm"
              disabled={loading || !filtersDirty}
            >
              Apply Filters
            </Button>
            <Button
              variant="link"
              size="sm"
              className="ra-reset"
              onClick={() => {
                setDraft({
                  ...Object.fromEntries(FILTERS.map((k) => [k, ""])),
                  ...defaults(),
                });
                setParams(new URLSearchParams());
              }}
            >
              Reset
            </Button>
            <OverlayTrigger placement="bottom" overlay={filterInfo}>
              <span className="badge bg-light text-dark ms-auto ra-info">
                ℹ️ Filter Info
              </span>
            </OverlayTrigger>
            {more && (
              <div id="analytics-more-filters" className="ra-more-row">
                {select(
                  "positions",
                  "Position",
                  (data?.options.positions || []).map((v) => ({
                    value: v,
                    label: positionLabel(v),
                  })),
                )}
                {select(
                  "countries",
                  "Playing country",
                  opts(data?.options.countries || []),
                )}
                {select("clubs", "Club", opts(data?.options.clubs || []))}
                {select(
                  "scouts",
                  "Scout",
                  (data?.options.scouts || []).map(([value, label]) => ({
                    value,
                    label,
                  })),
                )}
                {select("mode", "Method", [
                  { value: "live", label: "Live" },
                  { value: "video", label: "Video" },
                ])}
              </div>
            )}
          </form>
        </Card.Body>
      </Card>
      {error && (
        <Alert variant="danger">
          {error}{" "}
          <Button
            variant="outline-danger"
            size="sm"
            onClick={() => setRetry((v) => v + 1)}
          >
            Retry
          </Button>
        </Alert>
      )}
      {loading && !data && <AnalyticsDashboardShimmer statCount={5} />}
      {loading && data && (
        <div className="ra-loading" role="status">
          <Spinner size="sm" animation="border" /> Updating…
        </div>
      )}
      {data && !error && (
        <div
          aria-busy={loading}
          className={loading ? "ra-results ra-updating" : "ra-results"}
          inert={loading ? true : undefined}
        >
          {stats(data)}
          {panel(
            "pipeline",
            "Stage movement",
            pipelineBody(data),
            headerLink("All movements", () =>
              openDetails("pipeline", {}, "pipeline"),
            ),
          )}
          {panel(
            "coverage",
            "Market coverage",
            marketBody(data),
            headerLink("All leagues", () =>
              openDetails("competitions", {}, "coverage"),
            ),
          )}
          <Row className="g-4">
            <Col xl={5}>
              {panel("map", "Players covered by position", positionsBody(data))}
            </Col>
            <Col xl={7}>
              {panel("locations", "Where they play", mapBody(data))}
            </Col>
          </Row>
          {panel(
            "activity",
            "Activity",
            activityBody(data),
            headerLink("All reports", () =>
              openDetails("reports", {}, "activity"),
            ),
          )}
        </div>
      )}
    </Container>
  );
}

export default function AnalyticsPage() {
  const { canAccessAnalytics, loading } = useCurrentUser();
  const [sectionParams, setSectionParams] = useSearchParams();
  const section = SECTIONS.some((s) => s.id === sectionParams.get("section"))
    ? sectionParams.get("section")!
    : "overview";
  const [visited, setVisited] = useState<string[]>([section]);
  useEffect(() => {
    setVisited((prev) => (prev.includes(section) ? prev : [...prev, section]));
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [section]);
  if (loading)
    return (
      <Container className="py-5">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Checking analytics access</span>
        </Spinner>
      </Container>
    );
  if (!canAccessAnalytics)
    return (
      <Container className="py-4">
        <Alert variant="danger">
          You don’t have access to recruitment analytics.
        </Alert>
      </Container>
    );
  const selectSection = (id: string) => {
    const next = new URLSearchParams(sectionParams);
    if (id === "overview") next.delete("section");
    else next.set("section", id);
    setSectionParams(next);
  };
  return (
    <>
      <Container className="ra-section-shell">
        <nav className="ra-sections" aria-label="Analytics sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              aria-current={section === s.id ? "page" : undefined}
              onClick={() => selectSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
      </Container>
      {visited.includes("overview") && (
        <div hidden={section !== "overview"}>
          <RecruitmentDashboard />
        </div>
      )}
      {SECTIONS.filter(
        (s) =>
          s.id !== "overview" && (visited.includes(s.id) || s.id === section),
      ).map((s) => (
        <Container
          key={s.id}
          hidden={section !== s.id}
          className="ra-page ra-specialist"
        >
          <header className="ra-header">
            <div>
              <h1>{s.label}</h1>
              <p>{s.description}</p>
            </div>
          </header>
          <p className="ra-specialist-filter-note">
            Use this section’s filters below. Overview filters stay saved
            separately.
          </p>
          <Suspense
            fallback={
              <div role="status" className="ra-loading">
                <Spinner size="sm" animation="border" /> Loading{" "}
                {s.label.toLowerCase()}…
              </div>
            }
          >
            {s.id === "players" ? (
              <PlayerAnalytics />
            ) : s.id === "matches" ? (
              <MatchTeamAnalytics />
            ) : s.id === "scouts" ? (
              <ScoutAnalytics />
            ) : (
              <StageAnalytics />
            )}
          </Suspense>
        </Container>
      ))}
    </>
  );
}
