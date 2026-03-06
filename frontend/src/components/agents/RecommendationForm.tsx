import React, { useEffect, useMemo, useState } from 'react';
import {
  AgentPlayerSearchResult,
  AgentProfile,
  AgreementType,
  ContractOption,
  PotentialDealType,
  RecommendationFormValues,
} from '../../types/recommendations';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';

interface RecommendationFormProps {
  values: RecommendationFormValues;
  profile: AgentProfile | null;
  onChange: (field: keyof RecommendationFormValues, value: string | string[] | null) => void;
  onSubmit: (event: React.FormEvent) => void;
  loading: boolean;
  error?: string | null;
}

const AGREEMENT_TYPE_OPTIONS: AgreementType[] = [
  'Player Agreement/Mandate',
  'Club Mandate',
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

const formatWholePounds = (value: string) => {
  if (!value) return '';
  const digitsOnly = value.replace(/\D/g, '');
  if (!digitsOnly) return '';
  return Number(digitsOnly).toLocaleString('en-GB');
};

const normalizeWholePounds = (value: string) => value.replace(/\D/g, '');

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

const RecommendationForm: React.FC<RecommendationFormProps> = ({ values, profile, onChange, onSubmit, loading, error }) => {
  const [isManualPlayerEntry, setIsManualPlayerEntry] = useState(false);
  const [playerSearchQuery, setPlayerSearchQuery] = useState(values.player_name || '');
  const [searchResults, setSearchResults] = useState<AgentPlayerSearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);

  const formattedTransferFee = useMemo(
    () => formatWholePounds(values.transfer_fee),
    [values.transfer_fee],
  );
  const formattedCurrentWages = useMemo(
    () => formatWholePounds(values.current_wages_per_week),
    [values.current_wages_per_week],
  );
  const formattedExpectedWages = useMemo(
    () => formatWholePounds(values.expected_wages_per_week),
    [values.expected_wages_per_week],
  );

  useEffect(() => {
    if (isManualPlayerEntry || playerSearchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      setSearchLoading(false);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        setSearchLoading(true);
        const results = await agentRecommendationsService.searchPlayers(playerSearchQuery.trim(), 10);
        if (!cancelled) {
          setSearchResults(results);
          setSearchOpen(true);
          setActiveSuggestionIndex(-1);
        }
      } catch (searchError) {
        console.error(searchError);
        if (!cancelled) {
          setSearchResults([]);
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
    onChange('player_name', result.name);
    onChange('player_date_of_birth', result.date_of_birth || '');
    setSearchResults([]);
    setSearchOpen(false);
    setActiveSuggestionIndex(-1);
  };

  const handlePlayerInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!searchOpen || searchResults.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => Math.min(prev + 1, searchResults.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSuggestionIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === 'Enter' && activeSuggestionIndex >= 0) {
      event.preventDefault();
      selectSuggestion(searchResults[activeSuggestionIndex]);
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
              Submit structured player and deal information into the Charlton workflow. This test release is read-only after submission.
            </div>
            <div className="agent-portal-meta" style={{ marginTop: '0.5rem', fontWeight: 600 }}>
              * Required fields
            </div>
          </div>
          <div className="agent-portal-surface-muted" style={{ maxWidth: 360 }}>
            Registered as {profile?.firstname || profile?.agent_name || 'Agent'}. Contact details are locked to your account for audit integrity.
          </div>
        </div>

        <div className="agent-portal-form-grid agent-portal-form-grid-4" style={{ marginBottom: '1.5rem' }}>
          <div>
            <label className="agent-portal-label">Agent Name</label>
            <input className="agent-portal-input" value={values.agent_name} readOnly />
          </div>
          <div>
            <label className="agent-portal-label">Agency</label>
            <input className="agent-portal-input" value={values.agency} readOnly />
          </div>
          <div>
            <label className="agent-portal-label">Agent Email</label>
            <input className="agent-portal-input" value={values.agent_email} readOnly />
          </div>
          <div>
            <label className="agent-portal-label">Agent Number</label>
            <input className="agent-portal-input" value={values.agent_number} readOnly />
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
        <div className="agent-portal-inline-actions" style={{ justifyContent: 'flex-start', marginTop: '0.75rem', marginBottom: '0.5rem' }}>
          <label className="agent-manual-toggle">
            <input
              type="checkbox"
              checked={isManualPlayerEntry}
              onChange={(event) => {
                const checked = event.target.checked;
                setIsManualPlayerEntry(checked);
                setSearchOpen(false);
                setSearchResults([]);
                setActiveSuggestionIndex(-1);
                if (!checked && values.player_date_of_birth) {
                  onChange('player_date_of_birth', '');
                }
              }}
            />
            <span>Other (Manual Entry)</span>
          </label>
        </div>
        <div className="agent-portal-form-grid" style={{ marginTop: '0.5rem' }}>
          <div className="full-span">
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
                  <label className="agent-portal-label">Recommended Position *</label>
                  <select
                    className="agent-portal-select"
                    value={values.recommended_position}
                    onChange={(event) => onChange('recommended_position', event.target.value)}
                    required
                  >
                    <option value="">Select position</option>
                    {RECOMMENDED_POSITION_OPTIONS.map((position) => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </select>
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
                    <input
                      className="agent-portal-input"
                      value={playerSearchQuery}
                      onChange={(event) => {
                        const nextQuery = event.target.value;
                        setPlayerSearchQuery(nextQuery);
                        onChange('player_name', nextQuery);
                        onChange('player_date_of_birth', '');
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
                  </div>
                  <div>
                    <label className="agent-portal-label">Recommended Position *</label>
                    <select
                      className="agent-portal-select"
                      value={values.recommended_position}
                      onChange={(event) => onChange('recommended_position', event.target.value)}
                      required
                    >
                      <option value="">Select position</option>
                      {RECOMMENDED_POSITION_OPTIONS.map((position) => (
                        <option key={position} value={position}>{position}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="agent-portal-meta" style={{ marginTop: '0.4rem' }}>
                  Enter a player's name to get started.
                </div>
                {searchLoading ? (
                  <div className="agent-portal-meta" style={{ marginTop: '0.35rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    Loading player suggestions...
                  </div>
                ) : null}
                {searchOpen ? (
                  <div className="agent-player-search-menu">
                    {searchLoading ? (
                      <div className="agent-player-search-option">
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                        Searching...
                      </div>
                    ) : searchResults.length === 0 ? (
                      <div className="agent-player-search-option">No players found.</div>
                    ) : (
                      searchResults.map((result, index) => (
                        <button
                          type="button"
                          key={`${result.name}-${result.date_of_birth || 'unknown'}-${index}`}
                          className={`agent-player-search-option${index === activeSuggestionIndex ? ' active' : ''}`}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectSuggestion(result)}
                        >
                          <span>{result.label}</span>
                        </button>
                      ))
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
          <MultiSelectDropdown
            label="Contract Options *"
            values={values.contract_options}
            options={CONTRACT_OPTION_OPTIONS}
            placeholder="Select contract options"
            onChange={(nextValues) => onChange('contract_options', nextValues)}
          />
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
              value={formattedTransferFee}
              onChange={(event) => onChange('transfer_fee', normalizeWholePounds(event.target.value))}
              placeholder="50,000"
            />
            <div className="agent-portal-meta" style={{ marginTop: '0.4rem' }}>
              Required only when potential deal type includes Permanent Transfer.
            </div>
          </div>
          <div>
            <label className="agent-portal-label">Current Wages (Per Week - P/W, GBP)</label>
            <input
              className="agent-portal-input"
              inputMode="numeric"
              value={formattedCurrentWages}
              onChange={(event) => onChange('current_wages_per_week', normalizeWholePounds(event.target.value))}
              placeholder="12,500"
            />
          </div>
          <div>
            <label className="agent-portal-label">Expected Wages (Per Week - P/W, GBP) *</label>
            <input
              className="agent-portal-input"
              inputMode="numeric"
              value={formattedExpectedWages}
              onChange={(event) => onChange('expected_wages_per_week', normalizeWholePounds(event.target.value))}
              placeholder="18,000"
              required
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
            Submissions are locked after sending. File uploads and automated email notifications are disabled in this test release.
          </div>
          <button type="submit" disabled={loading} className="agent-auth-button" style={{ minWidth: 220 }}>
            {loading ? 'Submitting...' : 'Submit Recommendation'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default RecommendationForm;
