import { Recommendation, RecommendationFormValues } from '../types/recommendations';

export const getToday = () => new Date().toISOString().slice(0, 10);

export const getInitialRecommendationFormValues = (): RecommendationFormValues => ({
  agent_name: '',
  agency: '',
  agent_email: '',
  agent_number: '',
  submission_date: getToday(),
  player_name: '',
  player_date_of_birth: '',
  recommended_position: [],
  transfermarkt_link: '',
  agreement_type: [],
  confirmed_contract_expiry: '',
  contract_options: [],
  potential_deal_type: [],
  transfer_fee: '',
  current_wages_per_week: '',
  wage_basis: 'Gross',
  current_wages_basis: 'Gross',
  expected_wages_per_week: '',
  expected_wages_basis: 'Gross',
  additional_information: '',
  linked_universal_id: null,
  player_manual_entry: false,
});

export const getRecommendationSubmitErrorMessage = (err: any) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join(', ') || 'Failed to save recommendation';
  }
  return 'Failed to save recommendation';
};

const splitMultiValueField = (value?: string | string[] | null) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value.split(',').map((part) => part.trim()).filter(Boolean);
};

const toDateInputValue = (value?: string | null) => value ? value.slice(0, 10) : '';

const toRangeFieldValue = (
  minValue?: number | null,
  maxValue?: number | null,
  fallback?: number | string | null,
) => {
  if (minValue !== undefined && minValue !== null && maxValue !== undefined && maxValue !== null) {
    return minValue === maxValue ? String(Math.round(minValue)) : `${Math.round(minValue)}-${Math.round(maxValue)}`;
  }
  if (typeof fallback === 'number') return String(Math.round(fallback));
  return fallback || '';
};

export const mapRecommendationToFormValues = (item: Recommendation): RecommendationFormValues => ({
  agent_name: item.agent_name || '',
  agency: item.agency || '',
  agent_email: item.agent_email || '',
  agent_number: item.agent_number || '',
  submission_date: toDateInputValue(item.submission_date),
  player_name: item.player_name || '',
  player_date_of_birth: toDateInputValue(item.player_date_of_birth),
  recommended_position: splitMultiValueField(item.recommended_position),
  transfermarkt_link: item.transfermarkt_link || '',
  agreement_type: splitMultiValueField(item.agreement_type) as RecommendationFormValues['agreement_type'],
  confirmed_contract_expiry: toDateInputValue(item.confirmed_contract_expiry),
  contract_options: splitMultiValueField(item.contract_options) as RecommendationFormValues['contract_options'],
  potential_deal_type: splitMultiValueField(item.potential_deal_type) as RecommendationFormValues['potential_deal_type'],
  transfer_fee: toRangeFieldValue(item.transfer_fee_min, item.transfer_fee_max, item.transfer_fee),
  current_wages_per_week: toRangeFieldValue(
    item.current_wages_per_week_min,
    item.current_wages_per_week_max,
    item.current_wages_per_week,
  ),
  wage_basis: item.wage_basis || item.expected_wages_basis || item.current_wages_basis || 'Gross',
  current_wages_basis: item.current_wages_basis || item.wage_basis || 'Gross',
  expected_wages_per_week: toRangeFieldValue(
    item.expected_wages_per_week_min,
    item.expected_wages_per_week_max,
    item.expected_wages_per_week,
  ),
  expected_wages_basis: item.expected_wages_basis || item.wage_basis || 'Gross',
  additional_information: item.additional_information || '',
  linked_universal_id: item.linked_universal_id ?? null,
  player_manual_entry: shouldUseManualPlayerEntry(item),
});

export const shouldUseManualPlayerEntry = (item: Recommendation) => {
  // Newer rows: the agent's pick is recorded in linked_universal_id. An
  // 'external_*' value here with no linked_player_id means we created the
  // PLAYERS row from manual entry, not from a typeahead suggestion.
  if (item.linked_universal_id) {
    return !item.linked_player_id && !item.linked_cafc_player_id;
  }
  // Legacy rows (no stored link): fall back to the old heuristic.
  return !item.linked_player_id && !item.linked_cafc_player_id && !!item.player_date_of_birth;
};

export const getRecommendationSelectedPlayerLabel = (item: Recommendation) => {
  if (!item.player_name) return '';
  if (shouldUseManualPlayerEntry(item) || !item.player_date_of_birth) {
    return item.player_name;
  }
  const dob = new Date(item.player_date_of_birth);
  const dobLabel = Number.isNaN(dob.getTime())
    ? item.player_date_of_birth
    : dob.toLocaleDateString('en-GB');
  return `${item.player_name} - ${dobLabel}`;
};

export const validateRecommendationFormValues = (values: RecommendationFormValues) => {
  const requiredAgentFields = [
    values.agent_name,
    values.agent_email,
  ];
  if (requiredAgentFields.some((field) => !field || !field.trim())) {
    return 'Your agent profile is missing your name or email. Please contact support to update your account details.';
  }
  if (!values.submission_date) return 'Date is required.';
  if (!values.player_name.trim()) return 'Player name is required.';
  if (values.recommended_position.length === 0) return 'Recommended position is required.';
  if (!values.transfermarkt_link.trim()) return 'Transfermarkt link is required.';
  if (values.agreement_type.length === 0) return 'Agreement type is required.';
  if (!values.confirmed_contract_expiry) return 'Confirmed contract expiry is required.';
  if (values.contract_options.length === 0) return 'Contract options are required.';
  if (values.potential_deal_type.length === 0) return 'Potential deal type is required.';
  if (!values.expected_wages_per_week.trim()) return 'Expected wages are required.';
  if (values.potential_deal_type.includes('Permanent Transfer') && !values.transfer_fee.trim()) {
    return 'Transfer fee is required when potential deal type includes Permanent Transfer.';
  }
  return null;
};
