import React, { useEffect, useMemo, useState } from 'react';
import SubmissionStatusBadge from '../../components/agents/SubmissionStatusBadge';
import { internalRecommendationsService } from '../../services/internalRecommendationsService';
import {
  InternalRecommendation,
  InternalRecommendationFiltersMeta,
  RecommendationStatus,
} from '../../types/recommendations';

interface RecommendationFilterState {
  status: RecommendationStatus | '';
  agent_user_id: string;
  created_from: string;
  created_to: string;
  player_name: string;
  page: number;
  page_size: number;
}

const InternalRecommendationsPage: React.FC = () => {
  const [filters, setFilters] = useState<RecommendationFilterState>({
    status: '',
    agent_user_id: '',
    created_from: '',
    created_to: '',
    player_name: '',
    page: 1,
    page_size: 25,
  });
  const [meta, setMeta] = useState<InternalRecommendationFiltersMeta>({ statuses: [], agents: [] });
  const [items, setItems] = useState<InternalRecommendation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InternalRecommendation | null>(null);
  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / filters.page_size)), [total, filters.page_size]);

  const load = async (nextFilters = filters) => {
    try {
      setLoading(true);
      setError(null);
      const [metaResponse, listResponse] = await Promise.all([
        meta.statuses.length ? Promise.resolve(meta) : internalRecommendationsService.getFiltersMeta(),
        internalRecommendationsService.list(nextFilters),
      ]);
      setMeta(metaResponse);
      setItems(listResponse.items);
      setTotal(listResponse.total);
      if (selected) {
        const refreshed = listResponse.items.find((item) => item.id === selected.id);
        if (refreshed) {
          setSelected(refreshed);
          setNotesDraft(refreshed.shared_notes || '');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.page]);

  useEffect(() => {
    if (selected) {
      setNotesDraft(selected.shared_notes || '');
    }
  }, [selected]);

  const applyFilters = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextFilters = { ...filters, page: 1 };
    setFilters(nextFilters);
    await load(nextFilters);
  };

  const openDetail = async (item: InternalRecommendation) => {
    try {
      const detail = await internalRecommendationsService.getDetail(item.id);
      setSelected(detail);
      setNotesDraft(detail.shared_notes || '');
    } catch (err) {
      console.error(err);
      setError('Failed to load recommendation detail');
    }
  };

  const handleStatusChange = async (newStatus: RecommendationStatus) => {
    if (!selected) return;
    try {
      setUpdatingStatus(true);
      const response = await internalRecommendationsService.updateStatus(selected.id, newStatus);
      setSelected(response.item);
      setBanner(response.warning || 'Status updated successfully');
      await load(filters);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    try {
      setSavingNotes(true);
      const updated = await internalRecommendationsService.updateNotes(selected.id, notesDraft);
      setSelected(updated);
      setBanner('Shared notes saved');
      await load(filters);
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || 'Failed to save notes');
    } finally {
      setSavingNotes(false);
    }
  };

  const handleExport = async () => {
    const blob = await internalRecommendationsService.exportCsv();
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'recommendations.csv';
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="page-reports-cafc container-fluid py-4">
      <div className="agent-portal-card mb-4">
        <div className="agent-portal-card-body">
          <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="agent-portal-section-title">Internal Recommendations Console</div>
              <div className="agent-portal-section-copy">
                Review all external submissions, manage status changes, and keep agent communications controlled through the platform.
              </div>
            </div>
            <button className="btn btn-dark" onClick={handleExport}>Export CSV</button>
          </div>
        </div>
      </div>

      {banner ? <div className="alert alert-success">{banner}</div> : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="card h-100 shadow-sm border-0 rounded-4 overflow-hidden">
            <div className="card-header cafc-section-header-black">Recommendations</div>
            <div className="card-body">
              <form onSubmit={applyFilters} className="agent-portal-filter-bar mb-4">
                <div>
                  <label className="agent-portal-label">Player</label>
                  <input
                    className="agent-portal-input"
                    value={filters.player_name}
                    onChange={(e) => setFilters((current) => ({ ...current, player_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="agent-portal-label">Status</label>
                  <select
                    className="agent-portal-select"
                    value={filters.status}
                    onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value as RecommendationStatus | '' }))}
                  >
                    <option value="">All statuses</option>
                    {meta.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
                <div>
                  <label className="agent-portal-label">Agent</label>
                  <select
                    className="agent-portal-select"
                    value={filters.agent_user_id}
                    onChange={(e) => setFilters((current) => ({ ...current, agent_user_id: e.target.value }))}
                  >
                    <option value="">All agents</option>
                    {meta.agents.map((agent) => <option key={agent.user_id} value={agent.user_id}>{agent.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="agent-portal-label">From</label>
                  <input
                    type="date"
                    className="agent-portal-input"
                    value={filters.created_from}
                    onChange={(e) => setFilters((current) => ({ ...current, created_from: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="agent-portal-label">To</label>
                  <input
                    type="date"
                    className="agent-portal-input"
                    value={filters.created_to}
                    onChange={(e) => setFilters((current) => ({ ...current, created_to: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="agent-portal-label">Page Size</label>
                  <select
                    className="agent-portal-select"
                    value={filters.page_size}
                    onChange={(e) => setFilters((current) => ({ ...current, page_size: Number(e.target.value), page: 1 }))}
                  >
                    {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </div>
                <div className="agent-portal-inline-actions" style={{ alignSelf: 'end' }}>
                  <button className="btn btn-primary" type="submit">Apply</button>
                </div>
              </form>

              <div className="table-responsive">
                <table className="agent-portal-table">
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Agent</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Last Updated</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="agent-portal-empty">Loading recommendations...</td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="agent-portal-empty">No recommendations found.</td>
                      </tr>
                    ) : (
                      items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div style={{ fontWeight: 700, color: '#111827' }}>{item.player_name}</div>
                            <div className="agent-portal-meta">{item.potential_deal_type || 'No deal type'}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 700, color: '#111827' }}>{item.agent_name || item.submitted_by_username || '-'}</div>
                            <div className="agent-portal-meta">{item.agency || item.agent_email || '-'}</div>
                          </td>
                          <td><SubmissionStatusBadge status={item.status} /></td>
                          <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                          <td>{item.status_updated_at ? new Date(item.status_updated_at).toLocaleString() : '-'}</td>
                          <td className="text-end">
                            <button className="btn btn-outline-dark btn-sm" onClick={() => openDetail(item)}>Review</button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="agent-portal-inline-actions" style={{ justifyContent: 'space-between', marginTop: '1.5rem' }}>
                <span className="agent-portal-meta">Page {filters.page} of {totalPages}</span>
                <div className="btn-group">
                  <button className="btn btn-outline-secondary btn-sm" disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Previous</button>
                  <button className="btn btn-outline-secondary btn-sm" disabled={filters.page >= totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Next</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-4">
          <div className="card h-100 shadow-sm border-0 rounded-4 overflow-hidden">
            <div className="card-header cafc-section-header-black">Review Panel</div>
            <div className="card-body">
              {!selected ? (
                <div className="agent-portal-empty">Select a recommendation to review status history, update status, and save shared notes.</div>
              ) : (
                <div className="agent-portal-review-stack">
                  <div>
                    <h2 className="h4 mb-1 text-dark">{selected.player_name}</h2>
                    <div className="agent-portal-meta">{selected.agent_name} {selected.agency ? `- ${selected.agency}` : ''}</div>
                  </div>

                  <div className="agent-portal-info-card">
                    <label className="agent-portal-label">Status</label>
                    <select
                      className="agent-portal-select"
                      value={selected.status}
                      onChange={(e) => handleStatusChange(e.target.value as RecommendationStatus)}
                      disabled={updatingStatus}
                    >
                      {meta.statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                    {updatingStatus ? <div className="agent-portal-meta" style={{ marginTop: '0.5rem' }}>Updating status...</div> : null}
                  </div>

                  <div className="agent-portal-info-card">
                    <label className="agent-portal-label">Shared Notes</label>
                    <textarea className="agent-portal-textarea" rows={6} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} />
                    <button className="btn btn-dark btn-sm mt-3" onClick={handleSaveNotes} disabled={savingNotes}>{savingNotes ? 'Saving...' : 'Save Shared Notes'}</button>
                  </div>

                  <div>
                    <div className="agent-portal-label">Status History</div>
                    <div className="agent-portal-review-stack">
                      {(selected.status_history || []).length === 0 ? (
                        <div className="agent-portal-empty">No status changes yet.</div>
                      ) : (
                        selected.status_history?.map((entry) => (
                          <div key={entry.id} className="agent-portal-surface-muted">
                            <div style={{ fontWeight: 700, color: '#111827' }}>{entry.new_status}</div>
                            <div className="agent-portal-meta">{new Date(entry.changed_at).toLocaleString()}</div>
                            {entry.changed_by_name ? <div className="agent-portal-meta">Updated by {entry.changed_by_name}</div> : null}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InternalRecommendationsPage;
