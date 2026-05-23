import { useState, useEffect, useCallback } from 'react';
import { render } from '@react-email/render';
import axios from 'axios';
import { toast } from 'sonner';
import { Send, Calendar, Trash2, X, Loader2, Mail } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { InvoiceEmail } from '../emails/InvoiceEmail';
import { ClientReportEmail } from '../emails/ClientReportEmail';
import { ContentStrategyOnboardingEmail } from '../emails/ContentStrategyOnboardingEmail';
import { ContentStrategyMonthlyEmail } from '../emails/ContentStrategyMonthlyEmail';

const TEMPLATES = [
  { value: 'invoice',             label: 'Invoice' },
  { value: 'report',              label: 'Report' },
  { value: 'strategy_onboarding', label: 'Onboarding' },
  { value: 'strategy_monthly',    label: 'Monthly' },
];

const INPUT_CLS = "w-full bg-zinc-950 border border-zinc-800 text-white text-sm px-3 py-2 rounded-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors duration-200";
const LABEL_CLS = "block text-xs text-zinc-500 mb-1 font-mono tracking-wider uppercase";
const SECTION_LABEL = "text-xs font-mono text-zinc-600 uppercase tracking-widest mb-3";

function Field({ label, value, onChange, placeholder = '', textarea = false }) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return (
    <div className="mb-3">
      <label htmlFor={id} className={LABEL_CLS}>{label}</label>
      {textarea
        ? <textarea id={id} rows={4} className={INPUT_CLS} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input id={id} className={INPUT_CLS} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    pending: 'bg-amber-500 animate-pulse', sent: 'bg-emerald-500',
    failed: 'bg-red-500', delivered: 'bg-emerald-500',
    opened: 'bg-emerald-400', bounced: 'bg-red-500', queued: 'bg-zinc-500',
  };
  return <span title={status} className={`inline-block w-2 h-2 rounded-full ${map[status] ?? 'bg-zinc-500'}`} />;
}

function SectionDivider({ label, count }) {
  return (
    <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
      <span className={SECTION_LABEL}>{label}</span>
      {count != null && <span className="text-xs font-mono text-zinc-600">{count}</span>}
    </div>
  );
}

export default function MailCenter() {
  const [clients, setClients] = useState([]);
  const [template, setTemplate] = useState('invoice');
  const [clientId, setClientId] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [fields, setFields] = useState({});
  const [previewHtml, setPreviewHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleDay, setScheduleDay] = useState(null);
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduled, setScheduled] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    axios.get('/api/clients').then(r => setClients(r.data)).catch(() => {});
    loadScheduled();
    loadHistory();
  }, []);

  function loadScheduled() { axios.get('/api/mail/scheduled').then(r => setScheduled(r.data)).catch(() => {}); }
  function loadHistory() { axios.get('/api/mail/history').then(r => setHistory(r.data)).catch(() => {}); }

  useEffect(() => {
    const c = clients.find(c => c.id === clientId);
    if (c) setTo(c.onboarding_data?.email ?? '');
  }, [clientId, clients]);

  useEffect(() => {
    const c = clients.find(c => c.id === clientId);
    const name = c?.name ?? 'Client';
    const subs = {
      invoice: `Invoice for ${fields.period ?? 'This Month'} — Sleeping Creators`,
      report: `Monthly Report — ${fields.period ?? ''} | ${name}`,
      strategy_onboarding: `Your Content Strategy — ${name}`,
      strategy_monthly: `${fields.month ?? ''} Content Plan — ${name}`,
    };
    setSubject(subs[template] ?? '');
  }, [template, clientId, fields, clients]);

  const rebuildPreview = useCallback(async () => {
    const c = clients.find(c => c.id === clientId);
    const name = c?.name ?? 'Client';
    const baseUrl = window.location.origin;
    let element = null;
    if (template === 'invoice') {
      element = <InvoiceEmail clientName={name} period={fields.period ?? ''} postsPublished={fields.postsPublished ?? 0} platforms={[]} amount={fields.amount ?? ''} serviceDescription={fields.serviceDescription ?? ''} paymentUrl={fields.paymentUrl ?? ''} baseUrl={baseUrl} />;
    } else if (template === 'report') {
      element = <ClientReportEmail clientName={name} period={fields.period ?? ''} postsPublished={0} platforms={[]} likes={0} comments={0} reach={0} queuePending={0} queueApproved={0} topPostImageUrl={null} topPostCaption={null} baseUrl={baseUrl} />;
    } else if (template === 'strategy_onboarding') {
      element = <ContentStrategyOnboardingEmail clientName={name} platforms={(fields.platforms ?? '').split(',').map(s => s.trim()).filter(Boolean)} frequency={fields.frequency ?? ''} contentPillars={fields.contentPillars ?? ''} brandVoice={c?.brand_voice ?? ''} startDate={fields.startDate ?? ''} baseUrl={baseUrl} />;
    } else if (template === 'strategy_monthly') {
      element = <ContentStrategyMonthlyEmail clientName={name} month={fields.month ?? ''} platforms={(fields.platforms ?? '').split(',').map(s => s.trim()).filter(Boolean)} totalScheduled={fields.totalScheduled ?? 0} topics={fields.topics ?? ''} baseUrl={baseUrl} />;
    }
    if (!element) return;
    try {
      const html = await render(element);
      setPreviewHtml(html);
    } catch {
      setPreviewHtml('<p style="font-family:sans-serif;padding:24px;color:#888">Preview unavailable</p>');
    }
  }, [template, clientId, fields, clients]);

  useEffect(() => { rebuildPreview(); }, [rebuildPreview]);

  function setField(k, v) { setFields(f => ({ ...f, [k]: v })); }

  async function handleSend() {
    if (!to) { toast.error('Client has no email address'); return; }
    const toList = to.split(',').map(s => s.trim()).filter(Boolean);
    setSending(true);
    try {
      await axios.post('/api/mail/send', {
        type: template, client_id: clientId, to: toList,
        cc: cc ? cc.split(',').map(s => s.trim()) : null,
        reply_to: replyTo || null, subject, html: previewHtml,
      });
      toast.success('Email sent');
      loadHistory();
    } catch (e) {
      toast.error(e.response?.data?.detail ?? 'Send failed');
    } finally { setSending(false); }
  }

  async function handleSchedule() {
    if (!to) { toast.error('Client has no email address'); return; }
    if (!scheduleDay) { toast.error('Pick a date'); return; }
    const toList = to.split(',').map(s => s.trim()).filter(Boolean);
    const [h, m] = scheduleTime.split(':');
    const dt = new Date(scheduleDay);
    dt.setHours(Number(h), Number(m), 0, 0);
    try {
      await axios.post('/api/mail/schedule', {
        type: template, client_id: clientId, to: toList,
        cc: cc ? cc.split(',').map(s => s.trim()) : null,
        reply_to: replyTo || null, subject, html: previewHtml,
        scheduled_at: dt.toISOString(),
      });
      toast.success('Email scheduled');
      setShowSchedule(false);
      loadScheduled();
    } catch (e) { toast.error(e.response?.data?.detail ?? 'Schedule failed'); }
  }

  async function cancelScheduled(id) {
    try {
      await axios.delete(`/api/mail/scheduled/${id}`);
      toast.success('Cancelled');
      loadScheduled();
    } catch { toast.error('Could not cancel'); }
  }

  const selectedClient = clients.find(c => c.id === clientId);

  return (
    <div className="min-h-screen bg-zinc-950 text-white" data-testid="mail-center">

      {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-sans text-xl font-black tracking-tight" data-testid="mail-center-heading">MAIL CENTER</h1>
          {to && (
            <span className="flex items-center gap-1.5 text-xs font-mono text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
              Ready
            </span>
          )}
        </div>
        <button onClick={handleSend} disabled={sending || !to} data-testid="send-now-btn"
          className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-none hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-200 cursor-pointer">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send Now
        </button>
      </div>

      {/* ── COMPOSE + PREVIEW ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] border-b border-zinc-800" style={{ minHeight: '600px' }}>

        {/* Compose sidebar */}
        <div className="border-r border-zinc-800 overflow-y-auto flex flex-col">

          {/* Template tabs */}
          <SectionDivider label="Template" />
          <div className="p-4 border-b border-zinc-800">
            <div className="grid grid-cols-2 gap-1.5">
              {TEMPLATES.map(t => (
                <button key={t.value} data-testid={`template-${t.value}`}
                  onClick={() => { setTemplate(t.value); setFields({}); }}
                  className={`text-xs px-3 py-2 text-left transition-colors duration-200 cursor-pointer font-mono ${
                    template === t.value
                      ? 'bg-white text-black font-semibold'
                      : 'border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Client picker */}
          <SectionDivider label="Client" />
          <div className="p-4 border-b border-zinc-800">
            <label htmlFor="client-select" className={LABEL_CLS}>Select Client</label>
            <select id="client-select" value={clientId} onChange={e => setClientId(e.target.value)}
              data-testid="client-select"
              className={`${INPUT_CLS} cursor-pointer`}>
              <option value="">— Select client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {clientId && (
              <p className={`mt-2 text-xs font-mono ${to ? 'text-zinc-500' : 'text-amber-400'}`}>
                {to ? `→ ${to}` : 'No email on profile'}
              </p>
            )}
          </div>

          {/* Recipients */}
          <SectionDivider label="Recipients" />
          <div className="p-4 border-b border-zinc-800">
            <Field label="To (comma-separated)" value={to} onChange={setTo} placeholder="client@email.com" />
            <Field label="CC" value={cc} onChange={setCc} placeholder="team@agency.com" />
            <Field label="Reply-To" value={replyTo} onChange={setReplyTo} placeholder="support@agency.com" />
          </div>

          {/* Template fields */}
          <SectionDivider label="Content" />
          <div className="p-4 flex-1">
            {template === 'invoice' && <>
              <Field label="Amount" value={fields.amount ?? ''} onChange={v => setField('amount', v)} placeholder="5,000" />
              <Field label="Service" value={fields.serviceDescription ?? ''} onChange={v => setField('serviceDescription', v)} placeholder="Social Media Management" />
              <Field label="Period" value={fields.period ?? ''} onChange={v => setField('period', v)} placeholder="May 2026" />
              <Field label="Payment URL" value={fields.paymentUrl ?? ''} onChange={v => setField('paymentUrl', v)} placeholder="https://pay.stripe.com/..." />
            </>}
            {template === 'report' && <>
              <Field label="Period" value={fields.period ?? ''} onChange={v => setField('period', v)} placeholder="May 2026" />
              <p className="text-xs text-zinc-600 font-mono mt-1">Engagement stats auto-pulled on send.</p>
            </>}
            {template === 'strategy_onboarding' && <>
              <Field label="Platforms" value={fields.platforms ?? ''} onChange={v => setField('platforms', v)} placeholder="Instagram, TikTok" />
              <Field label="Posting Frequency" value={fields.frequency ?? ''} onChange={v => setField('frequency', v)} placeholder="1 post/day" />
              <Field label="Content Pillars (one per line)" value={fields.contentPillars ?? ''} onChange={v => setField('contentPillars', v)} placeholder={"Behind the scenes\nProduct showcases"} textarea />
              <Field label="Start Date" value={fields.startDate ?? ''} onChange={v => setField('startDate', v)} placeholder="June 1, 2026" />
            </>}
            {template === 'strategy_monthly' && <>
              <Field label="Month" value={fields.month ?? ''} onChange={v => setField('month', v)} placeholder="June 2026" />
              <Field label="Platforms" value={fields.platforms ?? ''} onChange={v => setField('platforms', v)} placeholder="Instagram, TikTok" />
              <Field label="Total Posts" value={fields.totalScheduled ?? ''} onChange={v => setField('totalScheduled', v)} placeholder="24" />
              <Field label="Topics (one per line)" value={fields.topics ?? ''} onChange={v => setField('topics', v)} placeholder={"Eid collection launch\nSummer menu reveal"} textarea />
            </>}
          </div>
        </div>

        {/* Preview panel */}
        <div className="flex flex-col">

          {/* Email envelope metadata */}
          <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-4">
            <p className={`${SECTION_LABEL} mb-3`}>Preview</p>
            <div className="space-y-1.5">
              {[
                ['FROM', 'Sleeping Creators <noreply@sleepingcreators.com>'],
                ['TO',   to ? to.split(',').map(s => s.trim()).filter(Boolean).join(', ') : '—'],
                ['SUBJ', subject || '—'],
              ].map(([k, v]) => (
                <div key={k} className="grid text-xs font-mono" style={{ gridTemplateColumns: '40px 1fr' }}>
                  <span className="text-zinc-600">{k}</span>
                  <span className="text-zinc-300 truncate">{v}</span>
                </div>
              ))}
            </div>
          </div>

          {/* iframe */}
          <div className="flex-1 bg-white" style={{ minHeight: '400px' }}>
            {previewHtml
              ? <iframe srcDoc={previewHtml} title="email-preview" data-testid="email-preview-frame"
                  className="w-full h-full" style={{ minHeight: '400px' }} sandbox="allow-same-origin" />
              : (
                <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-zinc-300 gap-3">
                  <Mail size={32} className="text-zinc-700" />
                  <p className="text-sm font-mono text-zinc-600">Select a client to preview</p>
                </div>
              )
            }
          </div>

          {/* Action bar */}
          <div className="border-t border-zinc-800 p-4 flex gap-3 bg-zinc-950">
            <button onClick={handleSend} disabled={sending || !to} data-testid="send-now-preview-btn"
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-black text-sm font-semibold rounded-none hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-200 cursor-pointer">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send Now
            </button>
            <button onClick={() => setShowSchedule(true)} disabled={!to} data-testid="schedule-btn"
              className="flex items-center gap-2 px-5 py-2.5 border border-zinc-700 text-white text-sm font-semibold rounded-none hover:bg-zinc-800 disabled:opacity-40 transition-colors duration-200 cursor-pointer">
              <Calendar size={14} /> Schedule
            </button>
          </div>
        </div>
      </div>

      {/* ── SCHEDULED QUEUE ─────────────────────────────────────────── */}
      <div className="border-b border-zinc-800">
        <SectionDivider label="Scheduled Queue" count={scheduled.length || null} />
        <div className="px-6 py-4">
          {scheduled.length === 0
            ? <p className="text-sm font-mono text-zinc-700">No scheduled emails.</p>
            : (
              <table className="w-full text-xs font-mono" data-testid="scheduled-table">
                <thead>
                  <tr className="text-zinc-600 border-b border-zinc-800">
                    <th className="text-left py-2 pr-6 font-normal">Client</th>
                    <th className="text-left py-2 pr-6 font-normal">Type</th>
                    <th className="text-left py-2 pr-6 font-normal">Scheduled At</th>
                    <th className="text-left py-2 pr-4 font-normal">Status</th>
                    <th className="py-2 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {scheduled.map(s => {
                    const c = clients.find(c => c.id === s.client_id);
                    return (
                      <tr key={s._id} className="border-b border-zinc-900 hover:bg-zinc-900 transition-colors duration-200">
                        <td className="py-2.5 pr-6 text-zinc-200">{c?.name ?? s.client_id}</td>
                        <td className="py-2.5 pr-6 text-zinc-500">{s.type}</td>
                        <td className="py-2.5 pr-6 text-zinc-500">{new Date(s.scheduled_at).toLocaleString()}</td>
                        <td className="py-2.5 pr-4"><StatusDot status={s.status} /></td>
                        <td className="py-2.5">
                          <button onClick={() => cancelScheduled(s._id)} data-testid={`cancel-${s._id}`}
                            aria-label="Cancel scheduled email"
                            className="text-zinc-600 hover:text-red-400 transition-colors duration-200 cursor-pointer">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
        </div>
      </div>

      {/* ��─ SENT HISTORY ────────────────────────────────────────────── */}
      <div>
        <SectionDivider label="Sent History" count={history.length || null} />
        <div className="px-6 py-4">
          {history.length === 0
            ? <p className="text-sm font-mono text-zinc-700">No emails sent yet.</p>
            : (
              <table className="w-full text-xs font-mono" data-testid="history-table">
                <thead>
                  <tr className="text-zinc-600 border-b border-zinc-800">
                    <th className="text-left py-2 pr-6 font-normal">Client</th>
                    <th className="text-left py-2 pr-6 font-normal">Type</th>
                    <th className="text-left py-2 pr-6 font-normal">Subject</th>
                    <th className="text-left py-2 pr-6 font-normal">Sent At</th>
                    <th className="text-left py-2 font-normal">Delivery</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => {
                    const c = clients.find(c => c.id === h.client_id);
                    return (
                      <tr key={h._id} className="border-b border-zinc-900 hover:bg-zinc-900 transition-colors duration-200">
                        <td className="py-2.5 pr-6 text-zinc-200">{c?.name ?? h.to ?? h.client_id}</td>
                        <td className="py-2.5 pr-6 text-zinc-500">{h.type}</td>
                        <td className="py-2.5 pr-6 text-zinc-500 max-w-[220px] truncate">{h.subject}</td>
                        <td className="py-2.5 pr-6 text-zinc-500">{new Date(h.sent_at).toLocaleString()}</td>
                        <td className="py-2.5 flex items-center gap-2">
                          <StatusDot status={h.delivery_status ?? h.status} />
                          <span className="text-zinc-600">{h.delivery_status ?? h.status ?? '—'}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }
        </div>
      </div>

      {/* ── SCHEDULE MODAL ──────────────────────────────────────────── */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" onClick={e => e.target === e.currentTarget && setShowSchedule(false)}>
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm" data-testid="schedule-modal">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <p className="font-sans text-sm font-bold tracking-widest uppercase">Schedule Email</p>
              <button onClick={() => setShowSchedule(false)} aria-label="Close" className="text-zinc-500 hover:text-white transition-colors duration-200 cursor-pointer"><X size={16} /></button>
            </div>
            <div className="px-5 pt-4">
              <DayPicker mode="single" selected={scheduleDay} onSelect={setScheduleDay} fromDate={new Date()} className="text-white" />
            </div>
            <div className="px-5 pb-4">
              <label htmlFor="schedule-time" className={LABEL_CLS}>Time</label>
              <input id="schedule-time" type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className={INPUT_CLS} />
            </div>
            <div className="flex gap-0 border-t border-zinc-800">
              <button onClick={() => setShowSchedule(false)} className="flex-1 py-3 text-zinc-400 text-sm font-mono border-r border-zinc-800 hover:bg-zinc-800 hover:text-white transition-colors duration-200 cursor-pointer">Cancel</button>
              <button onClick={handleSchedule} data-testid="confirm-schedule-btn" className="flex-1 py-3 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-200 cursor-pointer">Confirm →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
