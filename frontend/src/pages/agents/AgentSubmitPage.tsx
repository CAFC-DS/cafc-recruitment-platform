import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import RecommendationForm from '../../components/agents/RecommendationForm';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { AgentProfile, DuplicatePlayerCandidate, RecommendationFormValues } from '../../types/recommendations';
import {
  getDuplicatePlayerCandidates,
  getInitialRecommendationFormValues,
  getRecommendationSubmitErrorMessage,
  validateRecommendationFormValues,
} from '../../utils/agentRecommendationForm';

const AgentSubmitPage: React.FC = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [values, setValues] = useState<RecommendationFormValues>(getInitialRecommendationFormValues());
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicatePlayerCandidate[] | null>(null);

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
    value: string | string[] | boolean | null,
  ) => {
    setValues((current) => ({ ...current, [field]: value as never }));
    // A stale interstitial pointed at a name/DOB the agent has since edited
    // would let them link to a candidate matched against the old value.
    if (field === 'player_name' || field === 'player_date_of_birth') {
      setDuplicateCandidates(null);
    }
  };

  const submitValues = async (valuesToSubmit: RecommendationFormValues, confirmNewPlayer = false) => {
    setLoading(true);
    setError(null);
    setSubmitSuccess(null);
    try {
      const recommendation = await agentRecommendationsService.submit(valuesToSubmit, { confirmNewPlayer });
      setSubmitSuccess('Recommendation submitted. Redirecting to the submission detail view.');
      navigate(`/agents/submissions/${recommendation.id}`);
    } catch (err: any) {
      console.error(err);
      const candidates = getDuplicatePlayerCandidates(err);
      if (candidates) {
        setDuplicateCandidates(candidates);
      } else {
        setError(getRecommendationSubmitErrorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateRecommendationFormValues(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    setDuplicateCandidates(null);
    await submitValues(values);
  };

  const handleLinkDuplicateCandidate = async (candidate: DuplicatePlayerCandidate) => {
    const nextValues: RecommendationFormValues = {
      ...values,
      linked_universal_id: candidate.universal_id,
      player_manual_entry: false,
    };
    setValues(nextValues);
    setDuplicateCandidates(null);
    await submitValues(nextValues);
  };

  const handleConfirmNewPlayer = async () => {
    setDuplicateCandidates(null);
    await submitValues(values, true);
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
        <RecommendationForm
          values={values}
          profile={profile}
          onChange={handleChange}
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
          duplicateCandidates={duplicateCandidates}
          onLinkDuplicateCandidate={handleLinkDuplicateCandidate}
          onConfirmNewPlayer={handleConfirmNewPlayer}
        />
      )}
    </AgentPortalShell>
  );
};

export default AgentSubmitPage;
