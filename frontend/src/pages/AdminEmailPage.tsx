import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Container, Form, Table } from 'react-bootstrap';
import { recruitmentEmailService as service, ArchivePreview, EmailPreview, EmailBatch, EmailUser } from '../services/recruitmentEmailService';

const statuses = ['Submitted', 'Under Review', 'Added / Already in Emerging Talent Process', 'Added / Already in First Team Scouting Process'];
const roles = ['agent', 'scout', 'loan_manager', 'manager', 'senior_manager', 'intel_reviewer', 'admin'];

const AdminEmailPage: React.FC = () => {
  const [params] = useSearchParams();
  const [users, setUsers] = useState<EmailUser[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [role, setRole] = useState('agent');
  const [audience, setAudience] = useState('selected');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [notification, setNotification] = useState(false);
  const [mode, setMode] = useState('test');
  const [ids, setIds] = useState(params.get('ids') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sourceStatuses, setSourceStatuses] = useState(statuses.slice(0, 2));
  const [archive, setArchive] = useState<ArchivePreview | null>(null);
  const [applied, setApplied] = useState(false);
  const [batches, setBatches] = useState<EmailBatch[]>([]);
  const [detail, setDetail] = useState<EmailBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [messageIndex, setMessageIndex] = useState(0);
  const refresh = useCallback(async () => setBatches(await service.batches()), []);
  useEffect(() => {
    Promise.all([service.users(), service.batches()]).then(([u, b]) => { setUsers(u); setBatches(b); })
      .catch(e => setError(e.response?.data?.detail || 'Could not load email tools'));
  }, []);
  const detailId = detail?.id;
  const detailState = detail?.state;
  useEffect(() => {
    if (!detailId || !['queued', 'attention'].includes(detailState || '')) return;
    let cancelled = false;
    const timer = window.setInterval(() => service.detail(detailId).then(result => { if (!cancelled) setDetail(result); }).catch(() => {}), 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [detailId, detailState]);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); await refresh(); } catch (e: any) { setError(e.response?.data?.detail || e.message || 'Action failed'); }
    finally { setBusy(false); }
  };
  const resetPreview = () => { setPreview(null); setMessageIndex(0); };
  const resetArchive = () => { setArchive(null); setApplied(false); resetPreview(); };
  const previewManual = () => run(async () => {
    setNotification(false); setMessageIndex(0);
    setPreview(await service.preview({ subject, body, ...(audience === 'selected' ? { user_ids: selected } : audience === 'role' ? { role } : { all_users: true }) }));
  });
  const previewArchive = () => run(async () => {
    const recommendationIds = ids.split(/[\s,]+/).filter(Boolean).map(Number);
    if (recommendationIds.some(n => !Number.isInteger(n) || n < 1)) throw new Error('Enter valid recommendation IDs');
    setApplied(false); resetPreview();
    setArchive(await service.archivePreview({ ...(recommendationIds.length ? { recommendation_ids: recommendationIds } : { created_from: from, created_to: to }), statuses: sourceStatuses }));
  });
  const currentMessage = preview?.messages[messageIndex];
  return <Container className="py-4">
    <Link to="/admin">Back to admin</Link><h1>Recruitment email</h1>
    <p>Each recipient receives a separate message from playerrecruitment@cafc.co.uk. Test mode redirects every message to the configured test inbox.</p>
    {error && <Alert variant="danger">{error}</Alert>}{notice && <Alert variant="success">{notice}</Alert>}
    <Card className="mb-4"><Card.Body><h2 className="h4">Recipients</h2>
      <Form.Label htmlFor="email-audience">Choose audience</Form.Label><Form.Select id="email-audience" value={audience} onChange={e => { setAudience(e.target.value); resetPreview(); }}>
        <option value="selected">Selected users</option><option value="role">Everyone in a role</option><option value="all">All platform users</option>
      </Form.Select>
      <Form.Label htmlFor="email-role">Filter by role</Form.Label><Form.Select id="email-role" value={role} onChange={e => { setRole(e.target.value); resetPreview(); }}>
        {roles.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
      </Form.Select>
      {audience === 'selected' && <div style={{ maxHeight: 260, overflow: 'auto' }}>
        {users.filter(u => u.role === role).map(u => <Form.Check key={u.id} id={`email-user-${u.id}`} label={`${u.name} — ${u.email || 'Missing email'}`} checked={selected.includes(u.id)} onChange={e => { setSelected(current => e.target.checked ? [...current, u.id] : current.filter(id => id !== u.id)); resetPreview(); }} />)}
      </div>}
      <p>{selected.length} users selected across roles.</p>
    </Card.Body></Card>
    <Card className="mb-4"><Card.Body><h2 className="h4">Message</h2>
      <Form.Label htmlFor="email-subject">Subject</Form.Label><Form.Control id="email-subject" value={subject} maxLength={200} onChange={e => { setSubject(e.target.value); resetPreview(); }} />
      <Form.Label htmlFor="email-body">Message</Form.Label><Form.Control as="textarea" id="email-body" rows={7} value={body} maxLength={20000} onChange={e => { setBody(e.target.value); resetPreview(); }} />
      <Button className="mt-3" disabled={busy || !subject.trim() || !body.trim()} onClick={previewManual}>Preview individual emails</Button>
    </Card.Body></Card>
    <Card className="mb-4"><Card.Body><h2 className="h4">Mark agent recommendations NCUC</h2>
      <p>Choose recommendation IDs, or an inclusive submission-date range. Players already in a scouting process are included only when you select that status.</p>
      <Form.Label htmlFor="ncuc-ids">Recommendation IDs (comma separated; takes precedence over dates)</Form.Label><Form.Control id="ncuc-ids" value={ids} onChange={e => { setIds(e.target.value); resetArchive(); }} />
      <div className="d-flex gap-3 my-2"><div><Form.Label htmlFor="ncuc-from">From (UK)</Form.Label><Form.Control id="ncuc-from" type="date" value={from} onChange={e => { setFrom(e.target.value); resetArchive(); }} /></div>
        <div><Form.Label htmlFor="ncuc-to">To (UK)</Form.Label><Form.Control id="ncuc-to" type="date" value={to} onChange={e => { setTo(e.target.value); resetArchive(); }} /></div></div>
      {statuses.map(s => <Form.Check key={s} id={`ncuc-${statuses.indexOf(s)}`} label={s} checked={sourceStatuses.includes(s)} onChange={e => { setSourceStatuses(current => e.target.checked ? [...current, s] : current.filter(v => v !== s)); resetArchive(); }} />)}
      <Button className="mt-3" disabled={busy} onClick={previewArchive}>Preview affected players and agents</Button>
      {archive && <><p className="mt-3">Batch {archive.id}: {archive.rows.length} recommendations</p><Table responsive><thead><tr><th>ID</th><th>Player</th><th>Agent</th><th>Email</th><th>Current status</th></tr></thead><tbody>
        {archive.rows.map(r => <tr key={r.id}><td>{r.id}</td><td>{r.player}</td><td>{r.agent_name}</td><td>{r.email || 'Missing'}</td><td>{r.status}</td></tr>)}
      </tbody></Table>
      {!applied ? <Button variant="warning" disabled={busy || !archive.rows.length} onClick={() => run(async () => { const result = await service.archiveApply(archive.id); setApplied(true); setNotice(`${result.updated} recommendations marked NCUC. No emails sent.`); })}>Confirm NCUC changes</Button>
        : <><Alert variant="info">NCUC changes saved. You can prepare the agreed notification now or return to this batch later.</Alert><Button disabled={busy || !subject.trim() || !body.trim()} onClick={() => run(async () => { setNotification(true); setMessageIndex(0); setPreview(await service.notifyPreview(archive.id, subject, body)); })}>Preview agent notifications using message above</Button></>}
      </>}
    </Card.Body></Card>
    {preview && <Card className="mb-4"><Card.Body><h2 className="h4">{notification ? 'Agent notification' : 'Email'} preview</h2>
      <p>{preview.messages.length} individual messages; {preview.skipped.length} missing or conflicting addresses excluded.</p>
      {!!preview.skipped.length && <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(preview.skipped, null, 2)}</pre>}
      <Form.Label htmlFor="email-preview-recipient">Recipient</Form.Label><Form.Select id="email-preview-recipient" value={messageIndex} onChange={e => setMessageIndex(Number(e.target.value))}>
        {preview.messages.map((m, i) => <option key={m.key} value={i}>{m.recipient} ({m.key})</option>)}
      </Form.Select>
      {currentMessage && <><p className="mt-2"><strong>{currentMessage.subject}</strong></p><iframe title="Individual email preview" sandbox="" srcDoc={currentMessage.html} style={{ width: '100%', height: 300, border: '1px solid #ddd' }} /></>}
      <Form.Label htmlFor="email-send-mode">Send mode</Form.Label><Form.Select id="email-send-mode" value={mode} onChange={e => setMode(e.target.value)}><option value="test">Test — redirect to my test inbox</option><option value="live">Live — intended recipients</option></Form.Select>
      <Button className="mt-3" variant={mode === 'live' ? 'warning' : 'primary'} disabled={busy || !preview.messages.length} onClick={() => run(async () => {
        const result = notification ? await service.notifyConfirm(preview.id, mode) : await service.confirm(preview.id, mode);
        setDetail(await service.detail(result.id)); setNotice(`Batch queued in ${mode} mode. The worker will process each message.`);
      })}>{mode === 'live' ? 'Confirm live email batch' : 'Send test batch'}</Button>
    </Card.Body></Card>}
    <h2 className="h4">Saved batches</h2><Button size="sm" disabled={busy} onClick={() => run(refresh)}>Refresh</Button>
    <Table responsive><thead><tr><th>Created</th><th>Purpose</th><th>State</th><th>Action</th></tr></thead><tbody>{batches.map(b => <tr key={b.id}><td>{b.created_at}</td><td>{b.purpose}</td><td>{b.state}</td><td>
      <Button size="sm" disabled={busy} onClick={() => run(async () => { const d = await service.detail(b.id); setDetail(d); if (d.purpose === 'ncuc') { setArchive({ id: d.id, rows: d.payload.rows || [] }); setApplied(d.state === 'applied'); resetPreview(); } else if (d.purpose === 'manual_preview' || d.purpose === 'ncuc_notification_preview') { setPreview({ id: d.id, messages: d.payload.messages || [], skipped: d.payload.skipped || [] }); setNotification(d.purpose === 'ncuc_notification_preview'); setMessageIndex(0); setSubject(d.payload.subject || d.payload.messages?.[0]?.subject || ''); setBody(d.payload.body || ''); } })}>Open</Button>
    </td></tr>)}</tbody></Table>
    {detail && <Card><Card.Body><h2 className="h4">Batch {detail.id}</h2><p>{detail.state}</p><Table responsive><thead><tr><th>Recipient</th><th>Mode</th><th>Outcome</th><th>Details</th></tr></thead><tbody>{detail.jobs.map(j => <tr key={j.id}><td>{j.recipient}</td><td>{j.mode}</td><td>{j.status}</td><td>{j.error}{j.status === 'uncertain' && <div>
        <Form.Control as="textarea" aria-label={`Mailbox review for ${j.recipient}`} placeholder="Record your mailbox check" value={reviewNotes[j.id] || ''} onChange={e => setReviewNotes(current => ({ ...current, [j.id]: e.target.value }))} />
        <Button size="sm" disabled={busy || !reviewNotes[j.id]?.trim()} onClick={() => run(async () => { await service.review(j.id, 'sent', reviewNotes[j.id]); setDetail(await service.detail(detail.id)); })}>Confirm previously sent</Button>{' '}
        <Button size="sm" variant="warning" disabled={busy || !reviewNotes[j.id]?.trim()} onClick={() => run(async () => { await service.review(j.id, 'not_sent', reviewNotes[j.id]); setDetail(await service.detail(detail.id)); })}>Confirm not sent — allow retry</Button>
      </div>}</td></tr>)}</tbody></Table>
      <p>Accepted means Microsoft has accepted the message for sending. Uncertain outcomes require mailbox review and cannot be retried automatically.</p>
      <Button disabled={busy || !detail.jobs.some(j => ['failed', 'blocked'].includes(j.status))} onClick={() => run(async () => { const result = await service.retry(detail.id); setNotice(`${result.requeued} failed or blocked messages requeued.`); setDetail(await service.detail(detail.id)); })}>Retry failed or blocked messages</Button>
    </Card.Body></Card>}
  </Container>;
};
export default AdminEmailPage;
