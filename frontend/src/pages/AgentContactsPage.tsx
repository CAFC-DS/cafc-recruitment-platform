import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { OverlayTrigger, Spinner, Tooltip } from 'react-bootstrap';
import { ArrowLeft, ChevronDown, ChevronRight, ChevronUp, Copy, ExternalLink, Search } from 'lucide-react';
import SubmissionStatusBadge from '../components/agents/SubmissionStatusBadge';
import GradeChip from '../components/GradeChip';
import ListDataScore from '../components/PlayerLists/ListDataScore';
import { DataScoreBox } from '../components/player/PlayerDataScore';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { agentContactsService } from '../services/agentContactsService';
import { AgentContact, AgentContactRecs } from '../types/agentContacts';
import { AgentContactSortKey, compareContacts, contactLetter, dataScoreDisplay, foldText } from '../utils/agentContactsGrouping';
import { calculateAge } from '../utils/age';
import './ExternalRecommendationsListPage.css';
import './AgentContactsPage.css';

const RECENT_LIMIT = 5;
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'];

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

type RecsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: AgentContactRecs };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

const ScoreTip: React.FC<{ id: string; tip: string; children: React.ReactElement }> = ({ id, tip, children }) => (
  <OverlayTrigger placement="top" overlay={<Tooltip id={id}>{tip}</Tooltip>}>{children}</OverlayTrigger>
);

const Dash = () => <span className="agent-contacts-dash">—</span>;

const CopyButton: React.FC<{ value: string; label: string }> = ({ value, label }) => (
  <button
    type="button"
    className="agent-contacts-copy"
    aria-label={label}
    title={label}
    onClick={(event) => {
      event.stopPropagation();
      navigator.clipboard?.writeText(value).catch(() => undefined);
    }}
  >
    <Copy size={13} aria-hidden="true" />
  </button>
);

const AgentContactsPage: React.FC = () => {
  const { isIntelReviewer } = useCurrentUser();
  const showScores = !isIntelReviewer; // Intel Reviewers aren't shown performance or data scores
  const columnCount = showScores ? 8 : 6;
  const [contacts, setContacts] = useState<AgentContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: AgentContactSortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [recs, setRecs] = useState<Record<number, RecsState>>({});

  useEffect(() => {
    let cancelled = false;
    agentContactsService
      .list()
      .then((data) => !cancelled && setContacts(data))
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const term = foldText(search.trim());
    return contacts
      .filter((c) => !term || foldText([c.name, c.agency, c.email].filter(Boolean).join(' ')).includes(term))
      .sort(compareContacts(sort.key, sort.dir));
  }, [contacts, search, sort]);

  const grouped = sort.key === 'name';
  const presentLetters = useMemo(() => new Set(rows.map((c) => contactLetter(c.name))), [rows]);

  const changeSort = (key: AgentContactSortKey) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 1 ? -1 : 1 }
        : { key, dir: key === 'name' || key === 'agency' ? 1 : -1 },
    );

  const loadRecs = (userId: number) => {
    setRecs((current) => ({ ...current, [userId]: { status: 'loading' } }));
    agentContactsService
      .recentRecs(userId, RECENT_LIMIT)
      .then((data) => setRecs((current) => ({ ...current, [userId]: { status: 'ready', data } })))
      .catch(() => setRecs((current) => ({ ...current, [userId]: { status: 'error' } })));
  };

  const toggle = (userId: number) => {
    const opening = !open.has(userId);
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    const state = recs[userId];
    if (opening && (!state || state.status === 'error')) loadRecs(userId);
  };

  const jumpTo = (letter: string) =>
    document.getElementById(`agent-letter-${letter === '#' ? 'other' : letter}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const sortHeader = (key: AgentContactSortKey, label: string) => (
    <button type="button" className="agent-contacts-sort" onClick={() => changeSort(key)}>
      {label}
      {sort.key === key ? (sort.dir === 1 ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />) : null}
    </button>
  );

  const renderPanel = (contact: AgentContact) => {
    const state = recs[contact.agent_user_id];
    if (!state || state.status === 'loading') {
      return <div className="agent-contacts-panel-message"><Spinner animation="border" size="sm" className="me-2" />Loading recommendations...</div>;
    }
    if (state.status === 'error') {
      return <div className="agent-contacts-panel-message text-danger">Couldn't load recommendations.</div>;
    }
    const { total, items } = state.data;
    return (
      <>
        {items.length > 0 ? (
          <table className="agent-contacts-recs">
            <thead>
              <tr>
                <th style={{ width: showScores ? '24%' : '30%' }}>Player</th>
                <th style={{ width: showScores ? '10%' : '14%' }}>Position</th>
                <th style={{ width: '7%' }}>Age</th>
                {showScores ? <th style={{ width: '11%' }}>Performance</th> : null}
                {showScores ? <th style={{ width: '10%' }}>Data score</th> : null}
                <th style={{ width: '14%' }}>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((rec) => (
                <tr key={rec.id}>
                  <td className="agent-contacts-recs-player">{rec.player_name}</td>
                  <td>{rec.recommended_position || '—'}</td>
                  <td>{calculateAge(rec.player_date_of_birth)}</td>
                  {showScores ? (
                    <td>{rec.avg_performance_score != null ? <GradeChip score={rec.avg_performance_score} decimals={1} size="sm" /> : <span className="agent-contacts-dash" title="No scout reports yet">—</span>}</td>
                  ) : null}
                  {showScores ? (
                    <td>{rec.data_score ? <ListDataScore score={rec.data_score} size="sm" /> : <span className="agent-contacts-dash" title="No data score">—</span>}</td>
                  ) : null}
                  <td>{formatDate(rec.submitted_at)}</td>
                  <td><SubmissionStatusBadge status={rec.status} short /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="agent-contacts-panel-message">No recommendations found.</div>
        )}
        <Link to={`/lists/external?agent=${contact.agent_user_id}`} className="agent-contacts-panel-link" onClick={(event) => event.stopPropagation()}>
          {total > RECENT_LIMIT ? `View all ${total} in External Recommendations` : 'Open in External Recommendations'}
          <ExternalLink size={13} aria-hidden="true" />
        </Link>
      </>
    );
  };

  return (
    <div className="page-reports-cafc container-fluid py-3 page-lists-cafc rec-queue agent-contacts">
      <header className="rec-queue-heading">
        <div>
          <h1>Agent Contacts</h1>
          <p>Everyone who has recommended a player through the agent portal.</p>
        </div>
        <Link to="/lists" className="rec-queue-back"><ArrowLeft size={15} aria-hidden="true" />Back to Lists</Link>
      </header>

      {error ? <div className="alert alert-danger"><i className="bi bi-exclamation-triangle me-2"></i>Couldn't load agent contacts.</div> : null}

      <div className="rec-queue-toolbar">
        <div className="agent-contacts-search">
          <Search size={15} aria-hidden="true" />
          <input
            className="form-control form-control-sm"
            placeholder="Search name, agency or email"
            aria-label="Search agents"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {!loading && !error ? <span className="agent-contacts-count">{rows.length} {rows.length === 1 ? 'agent' : 'agents'}</span> : null}
      </div>

      {grouped && !loading && !error ? (
        <nav aria-label="Jump to letter" className="agent-contacts-jump">
          {LETTERS.filter((letter) => letter !== '#' || presentLetters.has('#')).map((letter) => {
            const available = presentLetters.has(letter);
            return (
              <button
                key={letter}
                type="button"
                className={available ? 'is-available' : ''}
                aria-disabled={!available}
                onClick={() => available && jumpTo(letter)}
              >
                {letter}
              </button>
            );
          })}
        </nav>
      ) : null}

      <div className="rec-queue-table-wrap">
        <table className="rec-queue-table agent-contacts-table">
          <thead>
            <tr>
              <th style={{ width: showScores ? '18%' : '22%' }}>{sortHeader('name', 'Agent')}</th>
              {showScores ? <th style={{ width: '9%' }} title="Average of our scouts' performance scores across this agent's players">{sortHeader('avg_performance_score', 'Average performance')}</th> : null}
              {showScores ? <th style={{ width: '9%' }} title="Average data score across this agent's players">{sortHeader('avg_data_score', 'Average data score')}</th> : null}
              <th style={{ width: showScores ? '14%' : '18%' }}>{sortHeader('agency', 'Agency')}</th>
              <th style={{ width: showScores ? '19%' : '24%' }}>Email</th>
              <th style={{ width: showScores ? '13%' : '16%' }}>Phone</th>
              <th style={{ width: '8%', textAlign: 'right' }}>{sortHeader('rec_count', 'Recs')}</th>
              <th style={{ width: '12%' }}>{sortHeader('last_rec_at', 'Last rec')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnCount} className="rec-queue-message"><Spinner animation="border" size="sm" className="me-2" />Loading agent contacts...</td></tr>
            ) : !error && rows.length === 0 ? (
              <tr><td colSpan={columnCount} className="rec-queue-message">{contacts.length === 0 ? 'No agents have submitted yet.' : 'No agents match that search.'}</td></tr>
            ) : (
              rows.map((contact, index) => {
                const letter = contactLetter(contact.name);
                const startsSection = grouped && (index === 0 || contactLetter(rows[index - 1].name) !== letter);
                const isOpen = open.has(contact.agent_user_id);
                return (
                  <React.Fragment key={contact.agent_user_id}>
                    {startsSection ? (
                      <tr className="agent-contacts-letter" id={`agent-letter-${letter === '#' ? 'other' : letter}`}>
                        <td colSpan={columnCount} data-testid="letter-section">{letter}</td>
                      </tr>
                    ) : null}
                    <tr
                      data-testid="agent-row"
                      className={`agent-contacts-row${isOpen ? ' is-open' : ''}`}
                      aria-expanded={isOpen}
                      tabIndex={0}
                      onClick={() => toggle(contact.agent_user_id)}
                      onKeyDown={(event) => {
                        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                          event.preventDefault();
                          toggle(contact.agent_user_id);
                        }
                      }}
                    >
                      <td>
                        <div className="rec-queue-line agent-contacts-name">
                          <ChevronRight size={14} aria-hidden="true" className="agent-contacts-chevron" />
                          <span data-testid="agent-name">{contact.name}</span>
                        </div>
                        {contact.details_from_latest_rec ? <div className="rec-queue-sub agent-contacts-sub">Details from latest rec</div> : null}
                      </td>
                      {showScores ? (
                        <td data-testid="avg-performance">
                          {contact.avg_performance_score != null ? (
                            <ScoreTip id={`avg-performance-${contact.agent_user_id}`} tip={`Average of ${plural(contact.performance_scored_count ?? 0, 'scouted player')} (of ${plural(contact.rec_count, 'recommendation')})`}>
                              <span tabIndex={0} ><GradeChip score={contact.avg_performance_score} decimals={1} size="sm" /></span>
                            </ScoreTip>
                          ) : <span className="agent-contacts-dash" title="None of this agent's players have scout reports yet">—</span>}
                        </td>
                      ) : null}
                      {showScores ? (
                        <td data-testid="avg-data">
                          {contact.avg_data_score != null ? (
                            <ScoreTip id={`avg-data-${contact.agent_user_id}`} tip={`Average of ${plural(contact.data_scored_count ?? 0, 'player')} with a data score (of ${plural(contact.rec_count, 'recommendation')})`}>
                              <span tabIndex={0} ><DataScoreBox {...dataScoreDisplay(contact.avg_data_score)} size="sm" /></span>
                            </ScoreTip>
                          ) : <span className="agent-contacts-dash" title="None of this agent's players have a data score">—</span>}
                        </td>
                      ) : null}
                      <td><div className="rec-queue-line">{contact.agency || <Dash />}</div></td>
                      <td>
                        {contact.email ? (
                          <div className="rec-queue-line">
                            <a href={`mailto:${contact.email}`} onClick={(event) => event.stopPropagation()}>{contact.email}</a>
                            <CopyButton value={contact.email} label="Copy email" />
                          </div>
                        ) : <Dash />}
                      </td>
                      <td>
                        {contact.phone ? (
                          <div className="rec-queue-line">
                            <a href={`tel:${contact.phone.replace(/\s/g, '')}`} onClick={(event) => event.stopPropagation()}>{contact.phone}</a>
                            <CopyButton value={contact.phone} label="Copy phone" />
                          </div>
                        ) : <Dash />}
                      </td>
                      <td className="agent-contacts-number">{contact.rec_count}</td>
                      <td><div className="rec-queue-line">{formatDate(contact.last_rec_at)}</div></td>
                    </tr>
                    {isOpen ? (
                      <tr className="agent-contacts-panel">
                        <td colSpan={columnCount}>{renderPanel(contact)}</td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AgentContactsPage;
