import React, { useEffect, useMemo, useState } from "react";
import { Alert, Col, Form, Row, Spinner } from "react-bootstrap";
import { PolarArea } from "react-chartjs-2";
import {
  Chart as ChartJS, RadialLinearScale, ArcElement, Tooltip, Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { ChevronDown, CircleGauge, TrendingDown, TrendingUp } from "lucide-react";
import axiosInstance from "../../axiosInstance";
import { useTheme } from "../../contexts/ThemeContext";
import { PlayerTechnicalMetric, PlayerTechnicalMetricsResponse } from "../../types/Player";
import "./TechnicalDataSection.css";

const radarBandsPlugin = {
  id: "radarBands",
  beforeDatasetsDraw(chart: any) {
    const { ctx, scales: { r } } = chart;
    const count = chart.data.labels?.length || 0;
    if (!r || !count) return;
    const bands = [{ from: 0, to: 33, alpha: 0.05 }, { from: 33, to: 67, alpha: 0.09 }, { from: 67, to: 100, alpha: 0.05 }];
    ctx.save();
    bands.forEach(({ from, to, alpha }) => {
      ctx.beginPath();
      for (let i = 0; i <= count; i += 1) {
        const point = r.getPointPositionForValue(i % count, to);
        if (i === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y);
      }
      for (let i = count; i >= 0; i -= 1) {
        const point = r.getPointPositionForValue(i % count, from);
        ctx.lineTo(point.x, point.y);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(148, 163, 184, ${alpha * 2})`;
      ctx.fill();
    });
    ctx.restore();
  },
};

ChartJS.register(RadialLinearScale, ArcElement, Tooltip, Legend, ChartDataLabels);

const categoryColors: Record<string, string> = {
  Attacking: "#b91c1c", Possession: "#2563eb", Defending: "#0f766e", Goalkeeping: "#7c3aed",
};
const percentileColor = (value: number | null) => value == null ? "#9ca3af" : value >= 75 ? "#15803d" : value >= 40 ? "#ca8a04" : "#b91c1c";
const positionLabels: Record<string, string> = {
  Overall: "All positions", GOALKEEPER: "Goalkeeper", CENTRAL_DEFENDER: "Central Defender",
  LEFT_WINGBACK_DEFENDER: "Left Wing-back Defender", RIGHT_WINGBACK_DEFENDER: "Right Wing-back Defender",
  DEFENSE_MIDFIELD: "Defensive Midfield", CENTRAL_MIDFIELD: "Central Midfield",
  ATTACKING_MIDFIELD: "Attacking Midfield", LEFT_WINGER: "Left Winger",
  RIGHT_WINGER: "Right Winger", CENTER_FORWARD: "Centre Forward",
};
const formatPosition = (value: string) => positionLabels[value] || value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const zLabel = (value: number | null) => value == null ? "No Z-score" : `${value > 0 ? "+" : ""}${value.toFixed(2)}σ`;
const wrapRadarLabel = (label: string): string | string[] => {
  if (label.length <= 15) return label;
  const words = label.split(" ");
  const midpoint = Math.ceil(words.length / 2);
  return [words.slice(0, midpoint).join(" "), words.slice(midpoint).join(" ")];
};

const DistributionPlot: React.FC<{ metric: PlayerTechnicalMetric }> = ({ metric }) => {
  const bins = metric.distribution || [];
  if (!bins.length || metric.value == null) return <div className="technical-empty-plot">Distribution unavailable</div>;
  const peerMin = bins[0].start;
  const peerMax = bins[bins.length - 1].end;
  // Extend the domain to the player's own value in case it falls outside the peer range,
  // so the marker's position is always accurate instead of being clamped to the edge.
  const low = Math.min(peerMin, metric.value);
  const high = Math.max(peerMax, metric.value);
  const span = high - low || 1;
  const toPct = (v: number) => ((v - low) / span) * 100;
  const marker = Math.max(2, Math.min(98, toPct(metric.value)));
  const labelOnLeft = marker > 80;
  const hasBox = metric.q1 != null && metric.q3 != null;
  const q1Pct = hasBox ? toPct(metric.q1 as number) : 0;
  const q3Pct = hasBox ? toPct(metric.q3 as number) : 0;
  const medianPct = metric.median != null ? toPct(metric.median) : null;
  const whiskerMinPct = toPct(peerMin);
  const whiskerMaxPct = toPct(peerMax);
  return (
    <div className="technical-distribution" role="img" aria-label={`${metric.label} peer distribution; player at ${metric.value}`}>
      <div className="technical-boxplot">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none">
          <line x1={whiskerMinPct} x2={whiskerMaxPct} y1="20" y2="20" className="technical-box-whisker" />
          <line x1={whiskerMinPct} x2={whiskerMinPct} y1="12" y2="28" className="technical-box-whisker" />
          <line x1={whiskerMaxPct} x2={whiskerMaxPct} y1="12" y2="28" className="technical-box-whisker" />
          {hasBox && <rect x={q1Pct} y="7" width={Math.max(0.5, q3Pct - q1Pct)} height="26" className="technical-box-rect" />}
          {medianPct != null && <line x1={medianPct} x2={medianPct} y1="7" y2="33" className="technical-box-median" />}
        </svg>
        <div className={`technical-player-marker${labelOnLeft ? " is-label-left" : ""}`} style={{ left: `${marker}%` }}><i /><b>Player</b></div>
      </div>
      <div className="technical-axis"><span>{low.toFixed(1)}</span><span>Peer population (box = IQR, line = median)</span><span>{high.toFixed(1)}</span></div>
    </div>
  );
};

const MetricBar: React.FC<{ metric: PlayerTechnicalMetric; onSelect: () => void }> = ({ metric, onSelect }) => (
  <button type="button" className="technical-metric-bar" onClick={onSelect}>
    <span className="technical-metric-label"><strong>{metric.label}</strong><small>{metric.value ?? "—"} {metric.unit}</small></span>
    <span className="technical-bar-track"><i style={{ width: `${metric.percentile ?? 0}%`, background: percentileColor(metric.percentile) }} /></span>
    <span className="technical-percentile" style={{ color: percentileColor(metric.percentile) }}>{metric.percentile == null ? "—" : Math.round(metric.percentile)}</span>
  </button>
);

const TechnicalDataSection: React.FC<{ playerId: string }> = ({ playerId }) => {
  const { theme } = useTheme();
  const [data, setData] = useState<PlayerTechnicalMetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [competition, setCompetition] = useState("");
  const [season, setSeason] = useState("");
  const [position, setPosition] = useState("");
  const [selectedMetricId, setSelectedMetricId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    const params = new URLSearchParams();
    if (competition) params.set("competition", competition);
    if (season) params.set("season", season);
    if (position) params.set("position", position);
    axiosInstance.get<PlayerTechnicalMetricsResponse>(`/players/${playerId}/technical-metrics?${params}`)
      .then(({ data: response }) => {
        if (cancelled) return;
        setData(response);
        setCompetition(response.filters.competition || "");
        setSeason(response.filters.season || "");
        setPosition(response.filters.position || "Overall");
        setSelectedMetricId((current) => response.entries[0]?.metrics.some((metric) => metric.metric_id === current) ? current : response.entries[0]?.profile_metric_ids[0] || "");
      })
      .catch(() => !cancelled && setError("Technical data could not be loaded."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [playerId, competition, season, position]);

  const entry = data?.entries[0];
  const competitions = useMemo(() => Array.from(new Set((data?.filters.available || []).map((item) => item.competition))), [data]);
  const seasons = useMemo(() => (data?.filters.available || []).filter((item) => item.competition === competition).map((item) => item.season), [data, competition]);
  const profileMetrics = entry?.profile_metric_ids.map((id) => entry.metrics.find((metric) => metric.metric_id === id)).filter((metric): metric is PlayerTechnicalMetric => Boolean(metric)) || [];
  const selectedMetric = entry?.metrics.find((metric) => metric.metric_id === selectedMetricId) || profileMetrics[0];
  const categories = ["Attacking", "Possession", "Defending", "Goalkeeping"].filter((category) => entry?.metrics.some((metric) => metric.category === category));
  const rankedCategoryMetrics = (category: string) => (entry?.metrics || [])
    .filter((metric) => metric.category === category)
    .sort((a, b) => Number(b.is_profile_metric) - Number(a.is_profile_metric));
  const pizzaMetrics = useMemo(() => {
    if (!entry) return [];
    const perCategory = 2;
    const picked: PlayerTechnicalMetric[] = [];
    entry.category_summaries.forEach(({ category }) => picked.push(...rankedCategoryMetrics(category).slice(0, perCategory)));
    return picked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);
  const radarData = {
    labels: pizzaMetrics.map((metric) => wrapRadarLabel(metric.label)),
    datasets: [{
      label: "Percentile",
      data: pizzaMetrics.map((metric) => metric.percentile || 0),
      backgroundColor: pizzaMetrics.map((metric) => `color-mix(in srgb, ${categoryColors[metric.category] || "#b91c1c"} 72%, transparent)`),
      hoverBackgroundColor: pizzaMetrics.map((metric) => categoryColors[metric.category] || "#b91c1c"),
      borderColor: theme.isDark ? "#111827" : "#fff",
      borderWidth: 2,
    }],
  };

  if (loading && !data) return <div className="technical-loading"><Spinner animation="border" size="sm" /><span>Building player profile…</span></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!data?.available || !entry) return <Alert variant="secondary">{data?.message || "No technical data available."}</Alert>;

  return (
    <section className="technical-data-shell">
      <header className="technical-context-header">
        <div>
          <span className="technical-eyebrow"><CircleGauge size={14} /> Event-derived player profile</span>
          <h2>Technical Data</h2>
          <p>{data.profile?.label} profile · compared with {data.profile?.label || formatPosition(data.profile?.comparison_position || "")} peers</p>
        </div>
        <div className="technical-filters">
          <Form.Group><Form.Label>Competition</Form.Label><Form.Select value={competition} onChange={(e) => { setCompetition(e.target.value); setSeason(""); setPosition(""); }}>{competitions.map((value) => <option key={value}>{value}</option>)}</Form.Select></Form.Group>
          <Form.Group><Form.Label>Season</Form.Label><Form.Select value={season} onChange={(e) => { setSeason(e.target.value); setPosition(""); }}>{seasons.map((value) => <option key={value}>{value}</option>)}</Form.Select></Form.Group>
          <Form.Group><Form.Label>Position</Form.Label><Form.Select value={position} onChange={(e) => setPosition(e.target.value)}>{(data.filters.positions || []).map((value) => <option key={value}>{formatPosition(value)}</option>)}</Form.Select></Form.Group>
        </div>
      </header>

      <div className="technical-context-strip">
        <div><strong>{entry.match_count}</strong><span>Matches</span></div><div><strong>{entry.minutes.toLocaleString()}</strong><span>Minutes</span></div><div><strong>{entry.metrics[0]?.peer_count || 0}</strong><span>Eligible peers</span></div><div><strong>{data.filters.minimum_peer_minutes}+</strong><span>Peer minutes</span></div>
        <div className="technical-position-load">{(data.filters.position_breakdown || []).map((item) => <button key={item.position} className={position === item.position ? "is-active" : ""} onClick={() => setPosition(item.position)}><span>{formatPosition(item.position)}</span><b>{item.share_pct}%</b></button>)}</div>
      </div>

      <Row className="g-4 technical-overview-row">
        <Col xl={7}>
          <article className="technical-panel technical-radar-panel">
            <div className="technical-panel-heading"><div><span className="technical-section-kicker">Overall profile</span><h3>Role benchmark</h3></div><span className="technical-panel-note">Percentile by metric</span></div>
            <div className="technical-radar-wrap"><PolarArea data={radarData} plugins={[radarBandsPlugin]} options={{ responsive: true, maintainAspectRatio: false, layout: { padding: 14 }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => pizzaMetrics[items[0]?.dataIndex]?.label || "", label: (context) => `${Math.round(Number(context.raw))}th percentile` } }, datalabels: { color: "#fff", font: { size: 11, weight: 700 }, formatter: (value: number) => Math.round(value) } }, scales: { r: { min: 0, max: 100, beginAtZero: true, ticks: { display: false, stepSize: 20 }, angleLines: { color: theme.isDark ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.10)" }, grid: { color: theme.isDark ? "rgba(255,255,255,.12)" : "rgba(15,23,42,.10)" }, pointLabels: { display: true, centerPointLabels: true, color: theme.isDark ? "#e5e7eb" : "#374151", font: { size: 11, weight: 600 }, padding: 13 } } } }} /></div>
            <div className="technical-category-legend">{entry.category_summaries.map((item) => <span key={item.category} className="technical-category-badge" style={{ background: categoryColors[item.category] }}>{item.category.toUpperCase()}: {Math.round(item.percentile)}%ile</span>)}</div>
          </article>
        </Col>
        <Col xl={5}>
          <article className="technical-panel technical-insights-panel">
            <div className="technical-panel-heading"><div><span className="technical-section-kicker">Recruitment read</span><h3>Profile signals</h3></div></div>
            <div className="technical-signal-group"><h4><TrendingUp size={16} /> Relative strengths</h4>{entry.strengths.map((metric) => <button key={metric.metric_id} onClick={() => setSelectedMetricId(metric.metric_id)}><span>{metric.label}<small>{metric.value} {metric.unit}</small></span><b style={{ color: percentileColor(metric.percentile) }}>{Math.round(metric.percentile || 0)}</b></button>)}</div>
            <div className="technical-signal-group is-watch"><h4><TrendingDown size={16} /> Lower relative outputs</h4>{entry.weaknesses.map((metric) => <button key={metric.metric_id} onClick={() => setSelectedMetricId(metric.metric_id)}><span>{metric.label}<small>{metric.value} {metric.unit}</small></span><b style={{ color: percentileColor(metric.percentile) }}>{Math.round(metric.percentile || 0)}</b></button>)}</div>
            <p className="technical-caveat">Signals describe statistical output, not an automated scouting judgement.</p>
          </article>
        </Col>
      </Row>

      <article id="technical-key-metrics" className="technical-panel technical-key-metrics">
        <div className="technical-panel-heading"><div><span className="technical-section-kicker">Key metrics</span><h3>Performance by phase</h3></div><span className="technical-panel-note">Select a metric to inspect its distribution</span></div>
        <Row className="g-4">{categories.map((category) => {
          const profileOnly = entry.metrics.filter((metric) => metric.category === category && metric.is_profile_metric);
          const shown = profileOnly.length ? profileOnly : rankedCategoryMetrics(category).slice(0, 5);
          return <Col lg={categories.length === 1 ? 12 : 6} key={category}><div className="technical-metric-group"><h4><i style={{ background: categoryColors[category] }} />{category}</h4>{shown.map((metric) => <MetricBar key={metric.metric_id} metric={metric} onSelect={() => setSelectedMetricId(metric.metric_id)} />)}</div></Col>;
        })}</Row>
      </article>

      {selectedMetric && <article id="technical-peer-comparison" className="technical-panel technical-peer-panel">
        <div className="technical-panel-heading"><div><span className="technical-section-kicker">Peer comparison</span><h3>{selectedMetric.label}</h3><p>{selectedMetric.value} {selectedMetric.unit} · {selectedMetric.peer_count} {data.profile?.label || formatPosition(data.profile?.comparison_position || "")} peers</p></div><Form.Select aria-label="Distribution metric" value={selectedMetric.metric_id} onChange={(e) => setSelectedMetricId(e.target.value)}>{entry.metrics.map((metric) => <option key={metric.metric_id} value={metric.metric_id}>{metric.label}</option>)}</Form.Select></div>
        <DistributionPlot metric={selectedMetric} />
        <div className="technical-stat-grid"><div><span>Percentile</span><strong style={{ color: percentileColor(selectedMetric.percentile) }}>{Math.round(selectedMetric.percentile || 0)}</strong></div><div><span>Z-score</span><strong>{zLabel(selectedMetric.z_score)}</strong><small>{selectedMetric.z_score != null && Math.abs(selectedMetric.z_score) >= 1 ? "Meaningful separation" : "Within typical range"}</small></div><div><span>Peer median</span><strong>{selectedMetric.median ?? "—"}</strong><small>{selectedMetric.unit}</small></div><div><span>Middle 50%</span><strong>{selectedMetric.q1 ?? "—"}–{selectedMetric.q3 ?? "—"}</strong><small>{selectedMetric.unit}</small></div></div>
      </article>}

      <details className="technical-panel technical-details"><summary><span><span className="technical-section-kicker">Reference table</span><strong>All relevant metrics</strong></span><ChevronDown size={18} /></summary><div className="technical-detail-table-wrap"><table><thead><tr><th>Metric</th><th>Category</th><th>Player</th><th>Peer median</th><th>Percentile</th><th>Z-score</th></tr></thead><tbody>{entry.metrics.map((metric) => <tr key={metric.metric_id}><td><strong>{metric.label}</strong><small>{metric.unit}</small></td><td>{metric.category}</td><td>{metric.value ?? "—"}</td><td>{metric.median ?? "—"}</td><td><b style={{ color: percentileColor(metric.percentile) }}>{metric.percentile == null ? "—" : Math.round(metric.percentile)}</b></td><td>{zLabel(metric.z_score)}</td></tr>)}</tbody></table></div></details>
    </section>
  );
};

export default TechnicalDataSection;
