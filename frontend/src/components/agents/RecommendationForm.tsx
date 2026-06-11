import React, { useEffect, useState } from 'react';
import {
  AgentPlayerSearchResult,
  AgentProfile,
  AgreementType,
  ContractOption,
  PotentialDealType,
  RecommendationFormValues,
  WageBasis,
} from '../../types/recommendations';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';

interface RecommendationFormProps {
  values: RecommendationFormValues;
  profile: AgentProfile | null;
  onChange: (field: keyof RecommendationFormValues, value: string | string[] | boolean | null) => void;
  onSubmit: (event: React.FormEvent) => void;
  loading: boolean;
  error?: string | null;
  mode?: 'create' | 'edit';
  initialManualPlayerEntry?: boolean;
  initialSelectedPlayerLabel?: string;
}

const AGREEMENT_TYPE_OPTIONS: AgreementType[] = [
  'Exclusive/Registered Player Agreement',
  'Mandate (Player)',
  'Mandate (Selling Club)',
  'None',
];

const CONTRACT_OPTION_OPTIONS: ContractOption[] = [
  'None',
  '+1 Club',
  '+1 Player',
  '+1 Mutual',
  '+2 Club',
  '+2 Player',
  '+2 Mutual',
  'Other',
];

const POTENTIAL_DEAL_OPTIONS: PotentialDealType[] = [
  'Free',
  'Permanent Transfer',
  'Loan',
  'Loan with Option',
];

const WAGE_BASIS_OPTIONS: WageBasis[] = ['Gross', 'Net'];

const RECOMMENDED_POSITION_OPTIONS = [
  'GK',
  'RB',
  'RWB',
  'RCB(3)',
  'RCB(2)',
  'CCB(3)',
  'LCB(2)',
  'LCB(3)',
  'LWB',
  'LB',
  'DM',
  'CM',
  'RAM',
  'AM',
  'LAM',
  'RW',
  'LW',
  'Target Man CF',
  'In Behind CF',
] as const;

interface MultiSelectDropdownProps<T extends string> {
  label: string;
  values: T[];
  options: readonly T[];
  placeholder: string;
  onChange: (values: T[]) => void;
}

const validateWageInput = (value: string) => {
  // Allow only digits and hyphens for banding (e.g., 12000-20000)
  return value.replace(/[^\d-]/g, '');
};

const WageInputGroup: React.FC<{
  label: string;
  required?: boolean;
  value: string;
  onValueChange: (value: string) => void;
}> = ({ label, required = false, value, onValueChange }) => (
  <div>
    <label className="agent-portal-label">{label}{required ? ' *' : ''}</label>
    <input
      className="agent-portal-input"
      inputMode="numeric"
      value={value}
      onChange={(event) => onValueChange(validateWageInput(event.target.value))}
      required={required}
    />
    <div className="agent-portal-meta" style={{ marginTop: '0.4rem' }}>
      Enter a single value or range, for example 12000 or 12000-20000.
    </div>
  </div>
);

const WageBasisToggle: React.FC<{
  value: WageBasis;
  onChange: (value: WageBasis) => void;
}> = ({ value, onChange }) => (
  <div className="agent-wage-basis-field">
    <label className="agent-portal-label">Wage Basis</label>
    <div className="agent-wage-basis-toggle" role="radiogroup" aria-label="Wage basis">
      {WAGE_BASIS_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={`agent-wage-basis-option${value === option ? ' active' : ''}`}
          onClick={() => onChange(option)}
          role="radio"
          aria-checked={value === option}
        >
          {option}
        </button>
      ))}
    </div>
    <div className="agent-portal-meta" style={{ marginTop: '0.4rem' }}>
      Applies to both current and expected wages. Use Gross unless the figures are quoted as Net.
    </div>
  </div>
);

function MultiSelectDropdown<T extends string>({
  label,
  values,
  options,
  placeholder,
  onChange,
}: MultiSelectDropdownProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="agent-select-root">
      <label className="agent-portal-label">{label}</label>
      <button
        type="button"
        className={`agent-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      >
        <span>{values.length > 0 ? values.join(', ') : placeholder}</span>
        <span className="agent-select-chevron">▾</span>
      </button>
      {open ? (
        <div className="agent-select-menu">
          {options.map((option) => {
            const isActive = values.includes(option);
            return (
              <button
                type="button"
                key={option}
                className={`agent-select-option${isActive ? ' active' : ''}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (isActive) {
                    onChange(values.filter((value) => value !== option));
                  } else {
                    onChange([...values, option]);
                  }
                }}
              >
                <span>{option}</span>
                <span className="agent-select-check">{isActive ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const formatDob = (iso?: string | null) => {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-GB');
};

const PlayerSearchOption: React.FC<{
  result: AgentPlayerSearchResult;
  active: boolean;
  onSelect: (result: AgentPlayerSearchResult) => void;
  variant?: 'suggestion';
}> = ({ result, active, onSelect, variant }) => {
  const metaParts = [result.squad_name, result.position, formatDob(result.date_of_birth)].filter(Boolean);
  const classes = [
    'agent-player-search-option',
    variant === 'suggestion' ? 'agent-player-search-suggestion' : '',
    active ? 'active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={classes}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onSelect(result)}
    >
      <div className="agent-player-search-option-text">
        <div className="agent-player-search-option-name">{result.name}</div>
        {metaParts.length > 0 ? (
          <div className="agent-player-search-option-meta">{metaParts.join(' · ')}</div>
        ) : null}
      </div>
      {result.avg_performance_score != null ? (
        <span className="agent-player-score-badge">{result.avg_performance_score.toFixed(1)}</span>
      ) : null}
    </button>
  );
};

const RecommendationForm: React.FC<RecommendationFormProps> = ({
  values,
  profile,
  onChange,
  onSubmit,
  loading,
  error,
  mode = 'create',
  initialManualPlayerEntry = false,
  initialSelectedPlayerLabel,
}) => {
  const [isManualPlayerEntry, setIsManualPlayerEntry] = useState(initialManualPlayerEntry);
  const [playerSearchQuery, setPlayerSearchQuery] = useState(initialSelectedPlayerLabel || values.player_name || '');
  const [selectedPlayerLabel, setSelectedPlayerLabel] = useState(
    !initialManualPlayerEntry ? (initialSelectedPlayerLabel || values.player_name || '') : '',
  );
  const [searchResults, setSearchResults] = useState<AgentPlayerSearchResult[]>([]);
  const [searchSuggestions, setSearchSuggestions] = useState<AgentPlayerSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  // Transient — only populated when the agent commits a selection during this
  // mount. On edit-mode rehydration we don't have squad/position to display
  // and gracefully fall back to "linked" copy.
  const [selectedPlayerSnapshot, setSelectedPlayerSnapshot] = useState<{
    squad_name?: string | null;
    position?: string | null;
  } | null>(null);
  const playerInputRef = React.useRef<HTMLInputElement | null>(null);
  const combinedSuggestionList = [...searchResults, ...searchSuggestions];
  const hasSelectedPlayer = !isManualPlayerEntry && !!selectedPlayerLabel;
  const wageBasis = values.wage_basis || values.expected_wages_basis || values.current_wages_basis || 'Gross';
  const isEditMode = mode === 'edit';
  const updateWageBasis = (nextBasis: WageBasis) => {
    onChange('wage_basis', nextBasis);
    onChange('current_wages_basis', nextBasis);
    onChange('expected_wages_basis', nextBasis);
  };

  useEffect(() => {
    // Hydrate from the parent's *initial* values only. We deliberately do NOT
    // depend on values.player_name here — that would re-arm selectedPlayerLabel
    // every time the typing handler updates the parent's form state, making the
    // "selected" card flash green after the first keystroke.
    setIsManualPlayerEntry(initialManualPlayerEntry);
    setPlayerSearchQuery(initialSelectedPlayerLabel || values.player_name || '');
    setSelectedPlayerLabel(!initialManualPlayerEntry ? (initialSelectedPlayerLabel || values.player_name || '') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialManualPlayerEntry, initialSelectedPlayerLabel]);

  useEffect(() => {
    const hasCommittedSelection = !isManualPlayerEntry
      && !!selectedPlayerLabel
      && playerSearchQuery.trim() === selectedPlayerLabel.trim();

    if (isManualPlayerEntry || hasCommittedSelection || playerSearchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchSuggestions([]);
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        const response = await agentRecommendationsService.searchPlayers(playerSearchQuery.trim(), 10);
        if (!cancelled) {
          setSearchResults(response.results || []);
          setSearchSuggestions(response.suggestions || []);
          setSearchOpen(true);
          setActiveSuggestionIndex(-1);
        }
      } catch (searchError) {
        console.error(searchError);
        if (!cancelled) {
          setSearchResults([]);
          setSearchSuggestions([]);
          setSearchOpen(false);
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [isManualPlayerEntry, playerSearchQuery]);

  const selectSuggestion = (result: AgentPlayerSearchResult) => {
    setPlayerSearchQuery(result.label);
    setSelectedPlayerLabel(result.label);
    setSelectedPlayerSnapshot({ squad_name: result.squad_name, position: result.position });
    onChange('player_name', result.name);
    onChange('player_date_of_birth', result.date_of_birth || '');
    onChange('linked_universal_id', result.universal_id ?? null);
    onChange('player_manual_entry', false);
    setSearchResults([]);
    setSearchSuggestions([]);
    setSearchOpen(false);
    setActiveSuggestionIndex(-1);
  };

  const handleChangeSelectedPlayer = () => {
    setSelectedPlayerLabel('');
    setSelectedPlayerSnapshot(null);
    setPlayerSearchQuery('');
    onChange('player_name', '');
    onChange('player_date_of_birth', '');
    onChange('linked_universal_id', null);
    // Re-focus the search input after the next render so the agent can start
    // typing immediately.
    window.setTimeout(() => playerInputRef.current?.focus(), 0);
  };

  const handlePlayerInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen || combinedSuggestionList.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => Math.min(prev + 1, combinedSuggestionList.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault();
      const choice = combinedSuggestionList[activeSuggestionIndex];
      if (choice) {
        selectSuggestion(choice);
      }
      return;
    }

    if (event.key === 'Escape') {
      setSearchOpen(false);
      setActiveSuggestionIndex(-1);
    }
  };

  return (
    <form onSubmit={onSubmit} className="agent-portal-card">
      <div className="agent-portal-card-body">
        <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div>
            <div className="agent-portal-section-title">Recommendation Intake</div>
            <div className="agent-portal-section-copy">
              {isEditMode
                ? 'Update your submitted player and deal information while it is still awaiting review.'
                : 'Submit structured player and deal information into the Charlton workflow. Edits stay available while the submission status remains Submitted.'}
            </div>
            <div className="agent-portal-meta" style={{ marginTop: '0.5rem', fontWeight: 600 }}>
              * Required fields
            </div>
          </div>
          <div className="agent-portal-surface-muted" style={{ maxWidth: 360 }}>
            Registered as {profile?.firstname || profile?.agent_name || 'Agent'}. Saved profile details still take precedence when your submission is stored.
          </div>
        </div>

        <div className="agent-portal-form-grid agent-portal-form-grid-4" style={{ marginBottom: '1.5rem' }}>
          <div>
            <label className="agent-portal-label">Agent Name</label>
            <input className="agent-portal-input" value={values.agent_name} onChange={(event) => onChange('agent_name', event.target.value)} />
          </div>
          <div>
            <label className="agent-portal-label">Agency</label>
            <input className="agent-portal-input" value={values.agency} onChange={(event) => onChange('agency', event.target.value)} />
          </div>
          <div>
            <label className="agent-portal-label">Agent Email</label>
            <input className="agent-portal-input" value={values.agent_email} onChange={(event) => onChange('agent_email', event.target.value)} />
          </div>
          <div>
            <label className="agent-portal-label">Agent Number</label>
            <input className="agent-portal-input" value={values.agent_number} onChange={(event) => onChange('agent_number', event.target.value)} />
          </div>
        </div>

        <div className="agent-portal-form-grid" style={{ marginBottom: '1.75rem' }}>
          <div>
            <label className="agent-portal-label">Date *</label>
            <input
              type="date"
              className="agent-portal-input"
              value={values.submission_date}
              onChange={(event) => onChange('submission_date', event.target.value)}
              required
            />
          </div>
        </div>

        <div className="agent-portal-section-title">Player Details</div>
        <div className="agent-portal-form-grid" style={{ marginTop: '0.75rem' }}>
          <div className="full-span">
            {/* Manual entry is rehydration-only: edits of recommendations
                submitted before player creation was restricted to staff.
                New submissions must link a player from the search. */}
            {isManualPlayerEntry ? (
              <div className="agent-portal-form-grid">
                <div>
                  <label className="agent-portal-label">Player Name *</label>
                  <input
                    className="agent-portal-input"
                    value={values.player_name}
                    onChange={(event) => onChange('player_name', event.target.value)}
                    required
                  />
                </div>
                <div>
                  <MultiSelectDropdown
                    label="Recommended Position *"
                    values={values.recommended_position}
                    options={RECOMMENDED_POSITION_OPTIONS}
                    placeholder="Select recommended position"
                    onChange={(nextValues) => onChange('recommended_position', nextValues)}
                  />
                </div>
                <div>
                  <label className="agent-portal-label">Date of Birth *</label>
                  <input
                    type="date"
                    className="agent-portal-input"
                    value={values.player_date_of_birth || ''}
                    onChange={(event) => onChange('player_date_of_birth', event.target.value)}
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="agent-player-search-root" onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}>
                <div className="agent-portal-form-grid">
                  <div>
                    <label className="agent-portal-label">Player Name *</label>
                    {hasSelectedPlayer ? (
                      <div className="agent-player-selected-card" role="status">
                        <div className="agent-player-selected-icon" aria-hidden="true">✓</div>
                        <div className="agent-player-selected-text">
                          <div className="agent-player-selected-name">{values.player_name}</div>
                          <div className="agent-player-selected-meta">
                            {(() => {
                              const parts = [
                                selectedPlayerSnapshot?.squad_name,
                                selectedPlayerSnapshot?.position,
                                formatDob(values.player_date_of_birth),
                              ].filter(Boolean);
                              return parts.length > 0 ? parts.join(' · ') : 'Player linked from database';
                            })()}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="agent-player-selected-change"
                          onClick={handleChangeSelectedPlayer}
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <input
                        ref={playerInputRef}
                        className="agent-portal-input"
                        value={playerSearchQuery}
                        onChange={(event) => {
                          const nextQuery = event.target.value;
                          setPlayerSearchQuery(nextQuery);
                          setSelectedPlayerLabel('');
                          setSelectedPlayerSnapshot(null);
                          onChange('player_name', nextQuery);
                          onChange('player_date_of_birth', '');
                          onChange('linked_universal_id', null);
                        }}
                        onFocus={() => {
                          if (searchResults.length > 0) {
                            setSearchOpen(true);
                          }
                        }}
                        onKeyDown={handlePlayerInputKeyDown}
                        placeholder="Start typing player name"
                        required
                      />
                    )}
                  </div>
                  <div>
                    <MultiSelectDropdown
                      label="Recommended Position *"
                      values={values.recommended_position}
                      options={RECOMMENDED_POSITION_OPTIONS}
                      placeholder="Select recommended position"
                      onChange={(nextValues) => onChange('recommended_position', nextValues)}
                    />
                  </div>
                </div>
                {!hasSelectedPlayer ? (
                  <div className="agent-portal-meta" style={{ marginTop: '0.4rem' }}>
                    Enter a player's name and select them from the list. If the player is not listed, contact the recruitment team to have them added.
                  </div>
                ) : null}
                {!hasSelectedPlayer && searchLoading ? (
                  <div className="agent-portal-meta" style={{ marginTop: '0.35rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    Loading player suggestions...
                  </div>
                ) : null}
                {!hasSelectedPlayer && searchOpen ? (
                  <div className="agent-player-search-menu">
                    {searchLoading ? (
                      <div className="agent-player-search-option">
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                        Searching...
                      </div>
                    ) : searchResults.length === 0 && searchSuggestions.length === 0 ? (
                      <div className="agent-player-search-option">No players found. Contact the recruitment team to have the player added.</div>
                    ) : (
                      <>
                        {searchResults.map((result, index) => (
                          <PlayerSearchOption
                            key={`result-${result.name}-${result.date_of_birth || 'unknown'}-${index}`}
                            result={result}
                            active={index === activeSuggestionIndex}
                            onSelect={selectSuggestion}
                          />
                        ))}
                        {searchSuggestions.length > 0 ? (
                          <>
                            <div className="agent-player-search-divider">
                              {searchResults.length === 0 ? (
                                <>
                                  No exact match for <strong>{playerSearchQuery.trim()}</strong> — did you mean…?
                                </>
                              ) : (
                                'Did you mean…'
                              )}
                            </div>
                            {searchSuggestions.map((result, index) => {
                              const combinedIndex = searchResults.length + index;
                              return (
                                <PlayerSearchOption
                                  key={`suggestion-${result.name}-${result.date_of_birth || 'unknown'}-${index}`}
                                  result={result}
                                  active={combinedIndex === activeSuggestionIndex}
                                  onSelect={selectSuggestion}
                                  variant="suggestion"
                                />
                              );
                            })}
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div>
            <label className="agent-portal-label">Transfermarkt Link *</label>
            <input
              className="agent-portal-input"
              value={values.transfermarkt_link}
              onChange={(event) => onChange('transfermarkt_link', event.target.value)}
              required
            />
          </div>
          <MultiSelectDropdown
            label="Agreement Type *"
            values={values.agreement_type}
            options={AGREEMENT_TYPE_OPTIONS}
            placeholder="Select agreement type"
            onChange={(nextValues) => onChange('agreement_type', nextValues)}
          />
          <div>
            <label className="agent-portal-label">Confirmed Contract Expiry *</label>
            <input
              type="date"
              className="agent-portal-input"
              value={values.confirmed_contract_expiry}
              onChange={(event) => onChange('confirmed_contract_expiry', event.target.value)}
              required
            />
          </div>
          <div>
            <MultiSelectDropdown
              label="Contract Options *"
              values={values.contract_options}
              options={CONTRACT_OPTION_OPTIONS}
              placeholder="Select contract options"
              onChange={(nextValues) => onChange('contract_options', nextValues)}
            />
            <div className="agent-portal-meta" style={{ marginTop: '0.4rem' }}>
              Does either the club or the player hold a contract option?
            </div>
          </div>
          <MultiSelectDropdown
            label="Potential Deal Type *"
            values={values.potential_deal_type}
            options={POTENTIAL_DEAL_OPTIONS}
            placeholder="Select deal types"
            onChange={(nextValues) => onChange('potential_deal_type', nextValues)}
          />
          <div>
            <label className="agent-portal-label">Transfer Fee (GBP)</label>
            <input
              className="agent-portal-input"
              inputMode="numeric"
              value={values.transfer_fee}
              onChange={(event) => onChange('transfer_fee', validateWageInput(event.target.value))}
            />
            <div className="agent-portal-meta" style={{ marginTop: '0.4rem' }}>
              Enter a single value or range, for example 500000 or 500000-750000. Required only when potential deal type includes Permanent Transfer.
            </div>
          </div>
          <div className="full-span">
            <WageBasisToggle value={wageBasis} onChange={updateWageBasis} />
          </div>
          <div className="full-span agent-wage-values-row">
            <WageInputGroup
              label="Current Wages (Per Week - P/W, GBP)"
              value={values.current_wages_per_week}
              onValueChange={(nextValue) => onChange('current_wages_per_week', nextValue)}
            />
            <WageInputGroup
              label="Expected Wages (Per Week - P/W, GBP)"
              required
              value={values.expected_wages_per_week}
              onValueChange={(nextValue) => onChange('expected_wages_per_week', nextValue)}
            />
          </div>
          <div className="full-span">
            <div className="agent-portal-meta" style={{ marginBottom: '0.5rem' }}>
              All financial amounts are recorded in GBP.
            </div>
            <label className="agent-portal-label">Additional Information</label>
            <textarea
              className="agent-portal-textarea"
              value={values.additional_information}
              onChange={(event) => onChange('additional_information', event.target.value)}
            />
          </div>
        </div>

        {error ? <div className="agent-portal-banner" style={{ marginTop: '1.5rem' }}>{error}</div> : null}

        <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', marginTop: '1.75rem' }}>
          <div className="agent-portal-meta">
            File uploads and automated email notifications are disabled in this test release.
          </div>
          <button type="submit" disabled={loading} className="agent-auth-button" style={{ minWidth: 220 }}>
            {loading ? (isEditMode ? 'Saving...' : 'Submitting...') : (isEditMode ? 'Save Changes' : 'Submit Recommendation')}
          </button>
        </div>
      </div>
    </form>
  );
};

export default RecommendationForm;
