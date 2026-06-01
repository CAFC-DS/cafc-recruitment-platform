import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import RecommendationForm from '../../components/agents/RecommendationForm';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { AgentProfile, Recommendation, RecommendationFormValues } from '../../types/recommendations';
import {
  getRecommendationSubmitErrorMessage,
  getRecommendationSelectedPlayerLabel,
  mapRecommendationToFormValues,
  shouldUseManualPlayerEntry,
  validateRecommendationFormValues,
} from '../../utils/agentRecommendationForm';

const AgentEditSubmissionPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [item, setItem] = useState<Recommendation | null>(null);
  const [values, setValues] = useState<RecommendationFormValues | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!id) return;
        setBootstrapLoading(true);
        setError(null);
        const recommendationId = Number(id);
        const [me, detail] = await Promise.all([
          agentRecommendationsService.getMe(),
          agentRecommendationsService.getDetail(recommendationId),
        ]);
        setProfile(me);
        setItem(detail);
        if (detail.status !== 'Submitted') {
          setError('This submission is no longer editable because it has moved beyond Submitted.');
          return;
        }
        setValues(mapRecommendationToFormValues(detail));
      } catch (err) {
        console.error(err);
        setError('Failed to load submission for editing');
      } finally {
        setBootstrapLoading(false);
      }
    };
    load();
  }, [id]);

  const handleChange = (
    field: keyof RecommendationFormValues,
    value: string | string[] | boolean | null,
  ) => {
    setValues((current) => (current ? { ...current, [field]: value as never } : current));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!id || !values) return;

    const validationError = validateRecommendationFormValues(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const updated = await agentRecommendationsService.update(Number(id), values);
      navigate(`/agents/submissions/${updated.id}`, {
        replace: true,
        state: { successMessage: 'Submission updated successfully.' },
      });
    } catch (err: any) {
      console.error(err);
      setError(getRecommendationSubmitErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AgentPortalShell
      title="Edit Submission"
      subtitle="Update your recommendation while it is still awaiting club review."
      actions={
        <Link to={id ? `/agents/submissions/${id}` : '/agents/dashboard'} className="agent-portal-button-secondary">
          Back to submission
        </Link>
      }
    >
      {bootstrapLoading ? (
        <div className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-empty">Loading submission...</div>
          </div>
        </div>
      ) : null}

      {!bootstrapLoading && error && !values ? (
        <div className="agent-portal-card">
          <div className="agent-portal-card-body">
            <div className="agent-portal-banner">{error}</div>
          </div>
        </div>
      ) : null}

      {!bootstrapLoading && values ? (
        <RecommendationForm
          values={values}
          profile={profile}
          onChange={handleChange}
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
          mode="edit"
          initialManualPlayerEntry={item ? shouldUseManualPlayerEntry(item) : false}
          initialSelectedPlayerLabel={item ? getRecommendationSelectedPlayerLabel(item) : ''}
        />
      ) : null}
    </AgentPortalShell>
  );
};

export default AgentEditSubmissionPage;
