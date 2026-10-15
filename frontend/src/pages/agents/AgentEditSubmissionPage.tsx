import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AgentPortalShell from '../../components/agents/AgentPortalShell';
import RecommendationForm from '../../components/agents/RecommendationForm';
import { agentRecommendationsService } from '../../services/agentRecommendationsService';
import { AgentProfile, DuplicatePlayerCandidate, Recommendation, RecommendationFormValues } from '../../types/recommendations';
import {
  getDuplicatePlayerCandidates,
  getRecommendationSubmitErrorMessage,
  getRecommendationSelectedPlayerLabel,
  mapRecommendationToFormValues,
  shouldUseManualPlayerEntry,
  validateRecommendationFormValues,
} from '../../utils/agentRecommendationForm';

const AgentEditSubmissionPage: React.FC<{ resubmit?: boolean }> = ({ resubmit = false }) => {
  const [changes, setChanges] = useState('');
  const navigate = useNavigate();
  const { id } = useParams();
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [item, setItem] = useState<Recommendation | null>(null);
  const [values, setValues] = useState<RecommendationFormValues | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicateCandidates, setDuplicateCandidates] = useState<DuplicatePlayerCandidate[] | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (!id) return;
        setBootstrapLoading(true);
        setValues(null);
        setItem(null);
        setChanges('');
        setDuplicateCandidates(null);
        setError(null);
        const recommendationId = Number(id);
        const [me, detail] = await Promise.all([
          agentRecommendationsService.getMe(),
          agentRecommendationsService.getDetail(recommendationId),
        ]);
        setProfile(me);
        setItem(detail);
        if (resubmit ? !['Not Currently under Consideration', 'Archived Submission'].includes(detail.status) || !!detail.resubmitted_as_id : detail.status !== 'Submitted') {
          setError(resubmit ? 'Only the latest NCUC or archived submission can be resubmitted.' : 'This submission is no longer editable because it has moved beyond Submitted.');
          return;
        }
        if (resubmit && !detail.linked_universal_id) {
          setError('The club needs to link this submission to a player record before you can resubmit it. Please contact the recruitment team.');
          return;
        }
        setValues({ ...mapRecommendationToFormValues(detail), ...(resubmit ? { submission_date: new Date().toLocaleDateString('en-CA') } : {}) });
      } catch (err) {
        console.error(err);
        setError('Failed to load submission for editing');
      } finally {
        setBootstrapLoading(false);
      }
    };
    load();
  }, [id, resubmit]);

  const handleChange = (
    field: keyof RecommendationFormValues,
    value: string | string[] | boolean | null,
  ) => {
    if (resubmit && ['player_name', 'player_date_of_birth', 'linked_universal_id', 'player_manual_entry'].includes(field)) return;
    setValues((current) => (current ? { ...current, [field]: value as never } : current));
    // A stale interstitial pointed at a name/DOB the agent has since edited
    // would let them link to a candidate matched against the old value.
    if (field === 'player_name' || field === 'player_date_of_birth') {
      setDuplicateCandidates(null);
    }
  };

  const submitValues = async (valuesToSubmit: RecommendationFormValues, confirmNewPlayer = false) => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const updated = resubmit
        ? await agentRecommendationsService.resubmit(Number(id), valuesToSubmit, changes)
        : await agentRecommendationsService.update(Number(id), valuesToSubmit, { confirmNewPlayer });
      navigate(`/agents/submissions/${updated.id}`, {
        replace: true,
        state: { successMessage: resubmit ? 'New submission created successfully.' : 'Submission updated successfully.' },
      });
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
    if (!id || !values) return;

    if (resubmit && !changes.trim()) { setError("Explain what's changed before resubmitting."); return; }
    const validationError = validateRecommendationFormValues(values);
    if (validationError) {
      setError(validationError);
      return;
    }

    setDuplicateCandidates(null);
    await submitValues(values);
  };

  const handleLinkDuplicateCandidate = async (candidate: DuplicatePlayerCandidate) => {
    if (!values) return;
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
    if (!values) return;
    setDuplicateCandidates(null);
    await submitValues(values, true);
  };

  return (
    <AgentPortalShell
      title={resubmit ? "Resubmit with new details" : "Edit Submission"}
      subtitle={resubmit ? "Create a new recommendation for the same player. Your previous submission stays available." : "Update your recommendation while it is still awaiting club review."}
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
        <>
        {resubmit && <div className="agent-portal-card agent-portal-card-body" style={{ marginBottom: '1rem' }}>
          <label className="agent-portal-label" htmlFor="resubmission-changes">What's changed? *</label>
          <textarea id="resubmission-changes" className="agent-portal-input" value={changes} onChange={e => setChanges(e.target.value)} maxLength={10000} required />
        </div>}
        <RecommendationForm
          values={values}
          profile={profile}
          onChange={handleChange}
          onSubmit={handleSubmit}
          loading={loading}
          error={error}
          mode={resubmit ? "resubmit" : "edit"}
          initialManualPlayerEntry={!resubmit && item ? shouldUseManualPlayerEntry(item) : false}
          initialSelectedPlayerLabel={item ? getRecommendationSelectedPlayerLabel(item) : ''}
          duplicateCandidates={duplicateCandidates}
          onLinkDuplicateCandidate={handleLinkDuplicateCandidate}
          onConfirmNewPlayer={handleConfirmNewPlayer}
        />
        </>
      ) : null}
    </AgentPortalShell>
  );
};

export default AgentEditSubmissionPage;
