import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import RecommendationForm from '../../components/agents/RecommendationForm';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { AgentProfile, RecommendationFormValues } from '../../types/recommendations';

const getToday = () => new Date().toISOString().slice(0, 10);

const getSubmitErrorMessage = (err: any) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.message)
      .filter(Boolean)
      .join(', ') || 'Failed to submit recommendation';
  }
  return 'Failed to submit recommendation';
};

const AgentSubmitPage: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [values, setValues] = useState<RecommendationFormValues>({
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
    expected_wages_per_week: '',
    additional_information: '',
  });

  useEffect(() => {
    const load = async () => {
      try {
        const me = await agentRecommendationsService.getMe();
        setProfile(me);
        setValues((current) => ({
          ...current,
          agent_name: me.agent_name || '',
          agency: me.agency || '',
          agent_email: me.email || '',
          agent_number: me.agent_number || '',
        }));
      } catch (err) {
        console.error(err);
        setError('Failed to load your agent profile');
      } finally {
        setBootstrapLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (
    field: keyof RecommendationFormValues,
    value: string | string[] | null,
  ) => {
    setValues((current) => ({ ...current, [field]: value as never }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const requiredAgentFields = [
      values.agent_name,
      values.agent_email,
    ];
    if (requiredAgentFields.some((field) => !field || !field.trim())) {
      setError('Your agent profile is missing your name or email. Please contact support to update your account details.');
      return;
    }
    if (!values.submission_date) {
      setError('Date is required.');
      return;
    }
    if (!values.player_name.trim()) {
      setError('Player name is required.');
      return;
    }
    if (values.recommended_position.length === 0) {
      setError('Recommended position is required.');
      return;
    }
    if (!values.transfermarkt_link.trim()) {
      setError('Transfermarkt link is required.');
      return;
    }
    if (values.agreement_type.length === 0) {
      setError('Agreement type is required.');
      return;
    }
    if (!values.confirmed_contract_expiry) {
      setError('Confirmed contract expiry is required.');
      return;
    }
    if (values.contract_options.length === 0) {
      setError('Contract options are required.');
      return;
    }
    if (values.potential_deal_type.length === 0) {
      setError('Potential deal type is required.');
      return;
    }
    if (!values.expected_wages_per_week.trim()) {
      setError('Expected wages are required.');
      return;
    }
    if (
      values.potential_deal_type.includes('Permanent Transfer')
      && !values.transfer_fee.trim()
    ) {
      setError('Transfer fee is required when potential deal type includes Permanent Transfer.');
      return;
    }

    setLoading(true);
    setError(null);
    setSubmitSuccess(null);
    try {
      const recommendation = await agentRecommendationsService.submit(values);
      setSubmitSuccess('Recommendation submitted. Redirecting to the submission detail view.');
      navigate(`/agents/submissions/${recommendation.id}`);
    } catch (err: any) {
      console.error(err);
      setError(getSubmitErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AgentPortalShell title="Submit a Player" subtitle="Structured external recommendation intake for Charlton Athletic.">
      {submitSuccess ? <div className="agent-portal-banner agent-portal-banner-success" style={{ marginBottom: '1rem' }}>{submitSuccess}</div> : null}
      {bootstrapLoading ? (
        <div className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-empty">Loading your agent profile...</div>
          </div>
        </div>
      ) : (
        <RecommendationForm values={values} profile={profile} onChange={handleChange} onSubmit={handleSubmit} loading={loading} error={error} />
      )}
    </AgentPortalShell>
  );
};

export default AgentSubmitPage;
