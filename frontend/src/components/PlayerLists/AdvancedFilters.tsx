import { SlidersHorizontal, X } from "lucide-react";
import "./AdvancedFiltersDrawer.css";
import { ALL_STAGES } from "../../constants/stages";
import React, { useEffect, useId, useState } from "react";
import { Card, Collapse, Button, Row, Col, Form, Dropdown, Offcanvas } from "react-bootstrap";

export interface PlayerListFilters {
  playerName: string;
  position: string;
  club: string;
  competition: string[];
  performanceScores: number[];
  minAge: string;
  maxAge: string;
  minReports: string;
  maxReports: string;
  stages: string[];
  archivedReasons: string[];
  initialReasons: string[];
  recencyMonths: string;
  includeSummerTransfers?: boolean;
  includeFavourites?: boolean;
}

interface AdvancedFiltersProps {
  compact?: boolean;
  pitchView?: boolean;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  filters: PlayerListFilters;
  onFilterChange: (filters: Partial<PlayerListFilters>) => void;
  onClearFilters: () => void;
  showArchived: boolean;
  onShowArchivedChange: (show: boolean) => void;
  includeArchivedReports: boolean;
  onIncludeArchivedReportsChange: (include: boolean) => void;
  includeFlagReports: boolean;
  onIncludeFlagReportsChange: (include: boolean) => void;
  competitionOptions: string[];
  archivedReasonOptions: string[];
  initialReasonOptions: string[];
  stageCounts?: Partial<Record<string, number>>;
}

const STAGE_OPTIONS = ALL_STAGES;

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  compact = false,
  pitchView = false,
  showFilters,
  setShowFilters,
  filters: appliedFilters,
  onFilterChange: appliedOnFilterChange,
  showArchived: appliedShowArchived,
  onShowArchivedChange: appliedOnShowArchivedChange,
  includeArchivedReports: appliedIncludeArchivedReports,
  onIncludeArchivedReportsChange: appliedOnIncludeArchivedReportsChange,
  includeFlagReports: appliedIncludeFlagReports,
  onIncludeFlagReportsChange: appliedOnIncludeFlagReportsChange,
  onClearFilters: appliedOnClearFilters,
  competitionOptions,
  archivedReasonOptions,
  initialReasonOptions,
  stageCounts = {},
}) => {
  // Keep edits local until all filter selections are ready to apply.
  const [filters, setDraftFilters] = useState(appliedFilters);
  const [showArchived, onShowArchivedChange] = useState(appliedShowArchived);
  const [includeArchivedReports, onIncludeArchivedReportsChange] = useState(appliedIncludeArchivedReports);
  const [includeFlagReports, onIncludeFlagReportsChange] = useState(appliedIncludeFlagReports);
  const onFilterChange = (changes: Partial<PlayerListFilters>) => {
    setDraftFilters((previous) => ({ ...previous, ...changes }));
  };
  const onClearFilters = () => {
    setDraftFilters({
      playerName: "", position: "", club: "", competition: [],
      performanceScores: [], minAge: "", maxAge: "", minReports: "",
      maxReports: "", stages: [], archivedReasons: [], initialReasons: [],
      recencyMonths: "",
    });
    onShowArchivedChange(false);
    onIncludeArchivedReportsChange(false);
    onIncludeFlagReportsChange(false);
    if (compact) appliedOnClearFilters();
  };
  const applyAllFilters = () => {
    appliedOnFilterChange({ ...filters, performanceScores: [...filters.performanceScores] });
    appliedOnShowArchivedChange(showArchived);
    appliedOnIncludeArchivedReportsChange(includeArchivedReports);
    appliedOnIncludeFlagReportsChange(includeFlagReports);
  };

  useEffect(() => { setDraftFilters(appliedFilters); }, [appliedFilters]);
  useEffect(() => { onShowArchivedChange(appliedShowArchived); }, [appliedShowArchived]);
  useEffect(() => { onIncludeArchivedReportsChange(appliedIncludeArchivedReports); }, [appliedIncludeArchivedReports]);
  useEffect(() => { onIncludeFlagReportsChange(appliedIncludeFlagReports); }, [appliedIncludeFlagReports]);
  const filterId = useId();
  const activeCount = [filters.playerName, filters.position, filters.club,
    filters.competition.length, filters.performanceScores.length,
    filters.minAge || filters.maxAge, filters.minReports || filters.maxReports,
    filters.stages.length, filters.recencyMonths, showArchived,
    filters.includeSummerTransfers === true, filters.includeFavourites === false,
    includeArchivedReports, includeFlagReports, filters.initialReasons.length, filters.archivedReasons.length].filter(Boolean).length;
  const hasPendingChanges = JSON.stringify(filters) !== JSON.stringify(appliedFilters)
    || showArchived !== appliedShowArchived
    || includeArchivedReports !== appliedIncludeArchivedReports
    || includeFlagReports !== appliedIncludeFlagReports;
  const hasAppliedFilters = [appliedFilters.playerName, appliedFilters.position, appliedFilters.club,
    appliedFilters.competition.length, appliedFilters.performanceScores.length,
    appliedFilters.minAge || appliedFilters.maxAge, appliedFilters.minReports || appliedFilters.maxReports,
    appliedFilters.stages.length, appliedFilters.recencyMonths, appliedShowArchived,
    appliedFilters.includeSummerTransfers === true, appliedFilters.includeFavourites === false,
    appliedIncludeArchivedReports, appliedIncludeFlagReports, appliedFilters.initialReasons.length,
    appliedFilters.archivedReasons.length].some(Boolean);
  const scoreMin = filters.performanceScores.length ? Math.min(...filters.performanceScores) : "";
  const scoreMax = filters.performanceScores.length ? Math.max(...filters.performanceScores) : "";
  const scoreRange = (low: number, high: number) => Array.from({ length: Math.max(0, high - low + 1) }, (_, i) => low + i);
  if (compact) {
    const chips: { label: string; clear: () => void }[] = [];
    const addChip = (label: string, clear: () => void) => chips.push({ label, clear });
    if (appliedFilters.playerName) addChip(`Name: ${appliedFilters.playerName}`, () => appliedOnFilterChange({ playerName: "" }));
    if (appliedFilters.position) addChip(`Position: ${appliedFilters.position}`, () => appliedOnFilterChange({ position: "" }));
    if (appliedFilters.club) addChip(`Club: ${appliedFilters.club}`, () => appliedOnFilterChange({ club: "" }));
    appliedFilters.competition.forEach(value => addChip(value, () => appliedOnFilterChange({ competition: appliedFilters.competition.filter(item => item !== value) })));
    if (appliedFilters.minAge || appliedFilters.maxAge) addChip(`Age ${appliedFilters.minAge || "Any"}–${appliedFilters.maxAge || "Any"}`, () => appliedOnFilterChange({ minAge: "", maxAge: "" }));
    if (appliedFilters.performanceScores.length) addChip(`Score ${Math.min(...appliedFilters.performanceScores)}–${Math.max(...appliedFilters.performanceScores)}`, () => appliedOnFilterChange({ performanceScores: [] }));
    if (appliedFilters.minReports || appliedFilters.maxReports) addChip(`Reports ${appliedFilters.minReports || "Any"}–${appliedFilters.maxReports || "Any"}`, () => appliedOnFilterChange({ minReports: "", maxReports: "" }));
    if (appliedFilters.recencyMonths) addChip(`Last ${appliedFilters.recencyMonths} months`, () => appliedOnFilterChange({ recencyMonths: "" }));
    if (!pitchView && appliedFilters.stages.length) addChip(appliedFilters.stages.join(", "), () => appliedOnFilterChange({ stages: [] }));
    if (appliedFilters.initialReasons.length) addChip(`Initial reasons: ${appliedFilters.initialReasons.join(", ")}`, () => appliedOnFilterChange({ initialReasons: [] }));
    if (!pitchView && appliedFilters.archivedReasons.length) addChip(`Archived reasons: ${appliedFilters.archivedReasons.join(", ")}`, () => appliedOnFilterChange({ archivedReasons: [] }));
    if (!pitchView && appliedShowArchived) addChip("Archived players", () => appliedOnShowArchivedChange(false));
    if (appliedFilters.includeSummerTransfers) addChip("Summer transfers included", () => appliedOnFilterChange({ includeSummerTransfers: false }));
    if (appliedFilters.includeFavourites === false) addChip("Favourites excluded", () => appliedOnFilterChange({ includeFavourites: true }));
    if (appliedIncludeArchivedReports) addChip("Archived reports", () => appliedOnIncludeArchivedReportsChange(false));
    if (appliedIncludeFlagReports) addChip("Flag reports", () => appliedOnIncludeFlagReportsChange(false));

    const textField = (label: string, key: "playerName" | "position" | "club") => <label className="filter-drawer__field">{label}<Form.Control type={key === "playerName" ? "search" : "text"} aria-label={label} value={filters[key]} placeholder={key === "playerName" ? "Search players by name…" : `Any ${label.toLowerCase()}`} onChange={event => onFilterChange({ [key]: event.target.value })} /></label>;
    const rangeField = (label: string, minKey: "minAge" | "minReports", maxKey: "maxAge" | "maxReports") => <fieldset className="filter-drawer__range"><legend>{label}</legend><div>{([minKey, maxKey] as const).map((key, index) => <label key={key}>{index ? "Maximum" : "Minimum"}<Form.Control type="number" min={minKey === "minAge" ? 16 : 0} max={minKey === "minAge" ? 50 : undefined} aria-label={`${index ? "Maximum" : "Minimum"} ${label === "Age" ? "age" : "report count"}`} placeholder="Any" value={filters[key]} onChange={event => onFilterChange({ [key]: event.target.value })} /></label>)}</div></fieldset>;
    const multiSelect = (label: string, key: "competition" | "stages" | "initialReasons" | "archivedReasons", options: readonly string[]) => <div className="filter-drawer__field"><span id={`${filterId}-${key}`}>{label}</span><Dropdown autoClose="outside"><Dropdown.Toggle variant="outline-secondary" aria-labelledby={`${filterId}-${key}`} className="w-100 text-start">{filters[key].length ? `${filters[key].length} selected` : "Any"}</Dropdown.Toggle><Dropdown.Menu className="filter-drawer__menu">{options.length ? options.map((value, index) => <Form.Check key={value} id={`${filterId}-${key}-${index}`} label={key === "stages" ? `${value} (${stageCounts[value] ?? 0})` : value} checked={filters[key].includes(value)} onChange={event => onFilterChange({ [key]: event.target.checked ? [...filters[key], value] : filters[key].filter(item => item !== value) })} />) : <p className="mb-0">No options available</p>}</Dropdown.Menu></Dropdown></div>;
    return <>
      <div className="filter-launcher">
        <Button variant="outline-secondary" onClick={() => setShowFilters(true)} aria-expanded={showFilters} aria-controls={filterId}><SlidersHorizontal size={16} aria-hidden="true" />Filters{chips.length ? ` (${chips.length})` : ""}</Button>
        {hasPendingChanges && <span className="filter-launcher__pending">Unapplied changes</span>}
        {chips.length > 0 && <div className="filter-launcher__chips" aria-label="Applied filters">{chips.map(chip => <button type="button" key={chip.label} title={chip.label} aria-label={`Remove filter ${chip.label}`} onClick={chip.clear}>{chip.label}<X size={13} aria-hidden="true" /></button>)}<button type="button" className="filter-launcher__reset" onClick={onClearFilters}>Reset all</button></div>}
      </div>
      <Offcanvas show={showFilters} onHide={() => setShowFilters(false)} placement="end" className="filter-drawer" aria-labelledby={`${filterId}-title`}>
        <Offcanvas.Header closeButton><div><Offcanvas.Title id={`${filterId}-title`}>Filters</Offcanvas.Title><p>Refine the selected lists</p></div></Offcanvas.Header>
        <Form id={filterId} className="filter-drawer__form" onSubmit={event => { event.preventDefault(); applyAllFilters(); setShowFilters(false); }}>
          <Offcanvas.Body>
            <section aria-labelledby={`${filterId}-player`}><h3 id={`${filterId}-player`}>Player</h3>
              {textField("Player name", "playerName")}
              <div className="filter-drawer__pair">{textField("Position", "position")}{textField("Club", "club")}</div>
              {multiSelect("Competition", "competition", competitionOptions)}
              {rangeField("Age", "minAge", "maxAge")}
            </section>
            <section aria-labelledby={`${filterId}-reports`}><h3 id={`${filterId}-reports`}>Reports</h3>
              <fieldset className="filter-drawer__range"><legend>Performance score</legend><div><label>Minimum<Form.Control type="number" min={1} max={10} aria-label="Minimum performance score" placeholder="Any" value={scoreMin} onChange={event => onFilterChange({ performanceScores: event.target.value ? scoreRange(Number(event.target.value), scoreMax === "" ? 10 : Number(scoreMax)) : scoreMax === "" ? [] : scoreRange(1, Number(scoreMax)) })} /></label><label>Maximum<Form.Control type="number" min={1} max={10} aria-label="Maximum performance score" placeholder="Any" value={scoreMax} onChange={event => onFilterChange({ performanceScores: event.target.value ? scoreRange(scoreMin === "" ? 1 : Number(scoreMin), Number(event.target.value)) : scoreMin === "" ? [] : scoreRange(Number(scoreMin), 10) })} /></label></div></fieldset>
              {rangeField("Report count", "minReports", "maxReports")}
              <label className="filter-drawer__field">Last reported<Form.Select aria-label="Last reported" value={filters.recencyMonths} onChange={event => onFilterChange({ recencyMonths: event.target.value })}><option value="">Any time</option>{[1,3,6,12].map(months => <option key={months} value={months}>Last {months} {months === 1 ? "month" : "months"}</option>)}</Form.Select></label>
            </section>
            <section aria-labelledby={`${filterId}-recruitment`}><h3 id={`${filterId}-recruitment`}>Recruitment</h3>
              {multiSelect("Initial reasons", "initialReasons", initialReasonOptions)}
              {!pitchView && <>{multiSelect("Stages", "stages", STAGE_OPTIONS)}{multiSelect("Archived reasons", "archivedReasons", archivedReasonOptions)}<Form.Check id={`${filterId}-archived`} label="Include archived players" checked={showArchived} onChange={event => onShowArchivedChange(event.target.checked)} /></>}
              <Form.Check id={`${filterId}-summer-transfers`} label="Include summer transfers" checked={filters.includeSummerTransfers ?? false} onChange={event => onFilterChange({ includeSummerTransfers: event.target.checked })} />
              <Form.Check id={`${filterId}-favourites`} label="Include favourites" checked={filters.includeFavourites ?? true} onChange={event => onFilterChange({ includeFavourites: event.target.checked })} />
              <Form.Check id={`${filterId}-archived-reports`} label="Include archived reports in counts" checked={includeArchivedReports} onChange={event => onIncludeArchivedReportsChange(event.target.checked)} />
              <Form.Check id={`${filterId}-flag-reports`} label="Include flag reports in counts" checked={includeFlagReports} onChange={event => onIncludeFlagReportsChange(event.target.checked)} />
              {pitchView && <p className="filter-drawer__hint">Choose stages above the pitch. Archived players are excluded.</p>}
            </section>
          </Offcanvas.Body>
          <footer className="filter-drawer__footer"><p role="status" aria-live="polite">{hasPendingChanges ? "Changes ready to apply" : "Adjust filters, then apply"}</p><div><Button type="submit" variant="primary">Apply filters</Button><Button type="button" variant="outline-secondary" disabled={!activeCount && !hasAppliedFilters && !hasPendingChanges} onClick={onClearFilters}>Reset filters</Button></div></footer>
        </Form>
      </Offcanvas>
    </>;
  }
  return (
    <Card as="form" className={`mb-3${compact ? " list-filters--compact" : ""}`} onSubmit={(event: React.FormEvent) => { event.preventDefault(); if (hasPendingChanges) applyAllFilters(); }}>
      <Card.Header style={compact ? undefined : { backgroundColor: "#000000", color: "white" }}>
        <div className="d-flex justify-content-between align-items-center gap-3 flex-wrap">
          {compact ? (
            <Form.Control
              className="list-filters__search"
              type="search"
              aria-label="Search players by name"
              placeholder="Search players by name…"
              value={filters.playerName}
              onChange={(e) => onFilterChange({ playerName: e.target.value })}
            />
          ) : <h6 className="mb-0 text-white">🔍 Advanced Filters</h6>}
          <div className="d-flex align-items-center gap-2">

          <Button
            type="button"
            variant="outline-secondary"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls={filterId}
            style={compact ? undefined : { color: "white", borderColor: "white" }}
          >
            {compact ? (showFilters ? "Close filters" : `Filters${activeCount ? ` (${activeCount})` : ""}`) : (showFilters ? "▲ Hide Filters" : "▼ Show Filters")}
          </Button>
          </div>
        </div>
      </Card.Header>
      <Collapse in={showFilters}>
        <Card.Body id={filterId} className="filter-section-improved">
          {/* Row 1: Player Name, Position, Club, Competition */}
          <Row className="mb-3">
            {!compact && <Col md={2}>
              <Form.Group>
                <Form.Label className="small fw-bold">Player Name</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  aria-label="Player name"
                  placeholder="Enter player name"
                  value={filters.playerName}
                  onChange={(e) => onFilterChange({ playerName: e.target.value })}
                />
              </Form.Group>
            </Col>}
            <Col md={2}>
              <Form.Group>
                <Form.Label className="small fw-bold">Position</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  aria-label="Position"
                  placeholder="e.g. GK, CM, ST"
                  value={filters.position}
                  onChange={(e) => onFilterChange({ position: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col md={3}>
              <Form.Group>
                <Form.Label className="small fw-bold">Club</Form.Label>
                <Form.Control
                  size="sm"
                  type="text"
                  aria-label="Club"
                  placeholder="Enter club name"
                  value={filters.club}
                  onChange={(e) => onFilterChange({ club: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col md={5}>
              <Form.Group>
                <Form.Label className="small fw-bold">Competition</Form.Label>
                <Dropdown autoClose="outside">
                  <Dropdown.Toggle
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {filters.competition.length > 0
                      ? `${filters.competition.length} competition${filters.competition.length > 1 ? "s" : ""} selected`
                      : "All competitions"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu popperConfig={{ strategy: "fixed" }}
                    className="p-2"
                    style={{ minWidth: "320px", maxHeight: "280px", overflowY: "auto" }}
                  >
                    {competitionOptions.map((competition) => (
                      <div key={competition} className="px-2 py-1">
                        <Form.Check
                          type="checkbox"
                          id={`competition-${competition}`}
                          label={competition}
                          checked={filters.competition.includes(competition)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onFilterChange({
                                competition: [...filters.competition, competition],
                              });
                            } else {
                              onFilterChange({
                                competition: filters.competition.filter((item) => item !== competition),
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </Form.Group>
            </Col>
          </Row>

          {/* Row 2: Performance Score, Age Range, Last Reported */}
          <Row className="mb-3">
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">
                  {compact ? "Score range" : "Performance Score"}
                </Form.Label>
                {compact ? <div className="range-inputs">
                  <Form.Control size="sm" type="number" min={1} max={10} aria-label="Minimum performance score" placeholder="Min" value={scoreMin}
                    onChange={e => onFilterChange({ performanceScores: e.target.value ? scoreRange(Number(e.target.value), scoreMax !== "" ? Number(scoreMax) : 10) : scoreMax !== "" ? scoreRange(1, Number(scoreMax)) : [] })} />
                  <span className="range-separator">to</span>
                  <Form.Control size="sm" type="number" min={1} max={10} aria-label="Maximum performance score" placeholder="Max" value={scoreMax}
                    onChange={e => onFilterChange({ performanceScores: e.target.value ? scoreRange(scoreMin === "" ? 1 : Number(scoreMin), Number(e.target.value)) : scoreMin !== "" ? scoreRange(Number(scoreMin), 10) : [] })} />
                </div> : (                <Dropdown autoClose="outside">
                  <Dropdown.Toggle
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {filters.performanceScores.length > 0
                      ? `${filters.performanceScores.length} score${filters.performanceScores.length > 1 ? "s" : ""} selected`
                      : "Select scores"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu popperConfig={{ strategy: "fixed" }}
                    className="p-2"
                    style={{ minWidth: "200px" }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
                      <div key={score} className="px-2 py-1">
                        <Form.Check
                          type="checkbox"
                          id={`perf-${score}`}
                          label={`${score}`}
                          checked={filters.performanceScores.includes(score)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onFilterChange({
                                performanceScores: [...filters.performanceScores, score],
                              });
                            } else {
                              onFilterChange({
                                performanceScores: filters.performanceScores.filter((s) => s !== score),
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>)}

              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Age Range</Form.Label>
                <div className="range-inputs">
                  <Form.Control
                    size="sm"
                    type="number"
                    aria-label="Minimum age" placeholder="Min"
                    value={filters.minAge}
                    onChange={(e) => onFilterChange({ minAge: e.target.value })}
                    min="16"
                    max="50"
                    style={{ width: "80px" }}
                  />
                  <span className="range-separator">to</span>
                  <Form.Control
                    size="sm"
                    type="number"
                    aria-label="Maximum age" placeholder="Max"
                    value={filters.maxAge}
                    onChange={(e) => onFilterChange({ maxAge: e.target.value })}
                    min="16"
                    max="50"
                    style={{ width: "80px" }}
                  />
                </div>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Last Reported</Form.Label>
                <Form.Select
                  aria-label="Last reported"
                  size="sm"
                  value={filters.recencyMonths}
                  onChange={(e) => onFilterChange({ recencyMonths: e.target.value })}
                >
                  <option value="">All Time</option>
                  <option value="1">Last 1 Month</option>
                  <option value="3">Last 3 Months</option>
                  <option value="6">Last 6 Months</option>
                  <option value="12">Last 12 Months</option>
                </Form.Select>
              </Form.Group>
            </Col>
          </Row>

          {/* Row 3: Stage Filter, Report Count, Show Archived */}
          <Row className="mb-3">
            {!pitchView && <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Stage Filter</Form.Label>
                <Dropdown autoClose="outside">
                  <Dropdown.Toggle
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {filters.stages.length > 0
                      ? `${filters.stages.length} stage${filters.stages.length > 1 ? "s" : ""} selected`
                      : "All stages"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu popperConfig={{ strategy: "fixed" }}
                    className="p-2"
                    style={{ minWidth: "200px" }}
                  >
                    {STAGE_OPTIONS.map((stage) => (
                      <div key={stage} className="px-2 py-1">
                        <Form.Check
                          type="checkbox"
                          id={`stage-${stage}`}
                          label={`${stage} (${stageCounts[stage] ?? 0})`}
                          checked={filters.stages.includes(stage)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onFilterChange({
                                stages: [...filters.stages, stage],
                              });
                            } else {
                              onFilterChange({
                                stages: filters.stages.filter((s) => s !== stage),
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </Form.Group>
            </Col>}
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Report Count</Form.Label>
                <div className="range-inputs">
                  <Form.Control
                    size="sm"
                    type="number"
                    aria-label="Minimum report count" placeholder="Min"
                    value={filters.minReports}
                    onChange={(e) => onFilterChange({ minReports: e.target.value })}
                    min="0"
                    style={{ width: "80px" }}
                  />
                  <span className="range-separator">to</span>
                  <Form.Control
                    size="sm"
                    type="number"
                    aria-label="Maximum report count" placeholder="Max"
                    value={filters.maxReports}
                    onChange={(e) => onFilterChange({ maxReports: e.target.value })}
                    min="0"
                    style={{ width: "80px" }}
                  />
                </div>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Include Options</Form.Label>
                <Dropdown autoClose="outside">
                  <Dropdown.Toggle
                    aria-label="Include options"
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {[showArchived && "Archived players", includeArchivedReports && "Archived reports", includeFlagReports && "Flag reports", filters.includeSummerTransfers && "Summer transfers", filters.includeFavourites !== false && "Favourites"].filter(Boolean).join(", ") || "None selected"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu popperConfig={{ strategy: "fixed" }}
                    className="p-2"
                    style={{ minWidth: "250px" }}
                  >
                    <div className="px-2 py-1">
                      <Form.Check id={`${filterId}-summer-transfers`} label="Include summer transfers" checked={filters.includeSummerTransfers ?? false} onChange={event => onFilterChange({ includeSummerTransfers: event.target.checked })} />
                    </div>
                    <div className="px-2 py-1">
                      <Form.Check id={`${filterId}-favourites`} label="Include favourites" checked={filters.includeFavourites ?? true} onChange={event => onFilterChange({ includeFavourites: event.target.checked })} />
                    </div>
                    <div className="px-2 py-1">
                      <Form.Check
                        type="checkbox"
                        id="show-archived-checkbox"
                        label="Include archived players"
                        checked={showArchived}
                        disabled={pitchView}
                        onChange={(e) => onShowArchivedChange(e.target.checked)}
                      />
                    </div>
                    <div className="px-2 py-1">
                      <Form.Check
                        type="checkbox"
                        id="include-archived-reports-checkbox"
                        label="Include archived reports in counts"
                        checked={includeArchivedReports}
                        onChange={(e) => onIncludeArchivedReportsChange(e.target.checked)}
                      />
                    </div>
                    <div className="px-2 py-1">
                      <Form.Check
                        type="checkbox"
                        id="include-flag-reports-checkbox"
                        label="Include flag reports in counts"
                        checked={includeFlagReports}
                        onChange={(e) => onIncludeFlagReportsChange(e.target.checked)}
                      />
                    </div>
                  </Dropdown.Menu>
                </Dropdown>
              </Form.Group>
            </Col>
          </Row>

{pitchView && <p className="small text-muted mb-0">Use the stage controls above the pitch. Archived players are excluded.</p>}
          {/* Row 4: Initial Reason, Archived Reason */}
          <Row className="mb-3">
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Initial Reason</Form.Label>
                <Dropdown autoClose="outside">
                  <Dropdown.Toggle
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {filters.initialReasons.length > 0
                      ? `${filters.initialReasons.length} reason${filters.initialReasons.length > 1 ? "s" : ""} selected`
                      : "All reasons"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu popperConfig={{ strategy: "fixed" }}
                    className="p-2"
                    style={{ minWidth: "280px", maxHeight: "280px", overflowY: "auto" }}
                  >
                    {initialReasonOptions.map((reason) => (
                      <div key={reason} className="px-2 py-1">
                        <Form.Check
                          type="checkbox"
                          id={`initial-reason-${reason}`}
                          label={reason}
                          checked={filters.initialReasons.includes(reason)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onFilterChange({
                                initialReasons: [...filters.initialReasons, reason],
                              });
                            } else {
                              onFilterChange({
                                initialReasons: filters.initialReasons.filter((r) => r !== reason),
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label className="small fw-bold">Archived Reason</Form.Label>
                <Dropdown autoClose="outside">
                  <Dropdown.Toggle
                    variant="outline-secondary"
                    size="sm"
                    className="w-100 text-start"
                  >
                    {filters.archivedReasons.length > 0
                      ? `${filters.archivedReasons.length} reason${filters.archivedReasons.length > 1 ? "s" : ""} selected`
                      : "All reasons"}
                  </Dropdown.Toggle>
                  <Dropdown.Menu popperConfig={{ strategy: "fixed" }}
                    className="p-2"
                    style={{ minWidth: "280px", maxHeight: "280px", overflowY: "auto" }}
                  >
                    {archivedReasonOptions.map((reason) => (
                      <div key={reason} className="px-2 py-1">
                        <Form.Check
                          type="checkbox"
                          id={`archived-reason-${reason}`}
                          label={reason}
                          checked={filters.archivedReasons.includes(reason)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              onFilterChange({
                                archivedReasons: [...filters.archivedReasons, reason],
                              });
                            } else {
                              onFilterChange({
                                archivedReasons: filters.archivedReasons.filter((r) => r !== reason),
                              });
                            }
                          }}
                        />
                      </div>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              </Form.Group>
            </Col>
          </Row>

          {/* Apply or reset pending filter selections */}
          {!compact && <Row className="mb-3">
            <Col md={4} className="d-flex align-items-end">
              <Button variant="primary" size="sm" className="w-100" onClick={applyAllFilters}>
                Apply All
              </Button>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label
                  className="small fw-bold"
                  style={{ visibility: "hidden" }}
                >
                  Placeholder
                </Form.Label>
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={onClearFilters}
                  className="w-100"
                >
                  {compact ? "Clear all filters" : "🔄 Clear All Filters"}
                </Button>
              </Form.Group>
            </Col>
          </Row>}
        </Card.Body>
      </Collapse>
      {compact && <div className="list-filters__actions">
        <p role="status" aria-live="polite">{hasPendingChanges ? "Changes not applied" : hasAppliedFilters ? "Filters applied" : "No filters applied"}</p>
        <div>
          <Button type="submit" size="sm" variant="primary" disabled={!hasPendingChanges}>Apply filters</Button>
          <Button type="button" size="sm" variant="outline-secondary" disabled={!activeCount && !hasAppliedFilters && !hasPendingChanges} onClick={onClearFilters}>Reset filters</Button>
        </div>
        <small>Press Enter or Apply filters to update results.</small>
      </div>}
    </Card>
  );
};
