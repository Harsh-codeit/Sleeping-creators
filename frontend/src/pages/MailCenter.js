import { useState, useEffect, useCallback } from 'react';
import { render } from '@react-email/render';
import axios from 'axios';
import { toast } from 'sonner';
import { Send, Calendar, Trash2, X, Loader2 } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { InvoiceEmail } from '../emails/InvoiceEmail';
import { ClientReportEmail } from '../emails/ClientReportEmail';
import { ContentStrategyOnboardingEmail } from '../emails/ContentStrategyOnboardingEmail';
import { ContentStrategyMonthlyEmail } from '../emails/ContentStrategyMonthlyEmail';

const TEMPLATES = [
  { value: 'invoice',             label: 'Invoice' },
  { value: 'report',              label: 'Client Report' },
  { value: 'strategy_onboarding', label: 'Strategy — Onboarding' },
  { value: 'strategy_monthly',    label: 'Strategy — Monthly' },
];

const INPUT_CLS = "w-full bg-zinc-950 border border-zinc-800 text-white text-sm px-3 py-2 rounded-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors duration-200";
const LABEL_CLS = "block text-xs text-zinc-400 mb-1 font-sans tracking-wide uppercase";

function Field({ label, value, onChange, placeholder = '', textarea = false }) {
  return (
    <div className="mb-4">
      <label className={LABEL_CLS}>{label}</label>
      {textarea
        ? <textarea rows={4} className={INPUT_CLS} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        : <input className={INPUT_CLS} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />}
    </div>
  );
}

function StatusDot({ status }) {
  const map = {
    pending: 'bg-amber-500 animate-pulse', sent: 'bg-emerald-500',
    failed: 'bg-red-500', delivered: 'bg-emerald-500',
    opened: 'bg-emerald-400', bounced: 'bg-red-500', queued: 'bg-zinc-500',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[status] ?? 'bg-zinc-500'}`} />;
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

  const selectCls = `${INPUT_CLS} cursor-pointer`;

  return (
    <div className="min-h-screen bg-zinc-950 text-white" data-testid="mail-center">
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="font-sans text-xl font-black tracking-tight" data-testid="mail-center-heading">MAIL CENTER</h1>
        <button onClick={handleSend} disabled={sending || !to} data-testid="send-now-btn"
          className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-none hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-200 cursor-pointer">
          {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send Now
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 border-b border-zinc-800">
        {/* Compose */}
        <div className="border-r border-zinc-800 p-6">
          <p className="text-xs font-sans text-zinc-500 uppercase tracking-widest mb-4">Compose</p>
          <div className="mb-4">
            <label className={LABEL_CLS}>Template</label>
            <select value={template} onChange={e => { setTemplate(e.target.value); setFields({}); }} data-testid="template-select" className={selectCls}>
              {TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="mb-4">
            <label className={LABEL_CLS}>Client</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)} data-testid="client-select" className={selectCls}>
              <option value="">— Select client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!to && clientId && <p className="text-xs text-amber-400 font-mono mb-3">This client has no email address on file.</p>}
          <Field label="To (comma-separated)" value={to} onChange={setTo} placeholder="client@email.com, other@email.com" />
          <Field label="CC (comma-separated)" value={cc} onChange={setCc} placeholder="team@agency.com" />
          <Field label="Reply-to" value={replyTo} onChange={setReplyTo} placeholder="support@agency.com" />

          {template === 'invoice' && <>
            <Field label="Amount" value={fields.amount ?? ''} onChange={v => setField('amount', v)} placeholder="$1,200" />
            <Field label="Service description" value={fields.serviceDescription ?? ''} onChange={v => setField('serviceDescription', v)} placeholder="Social Media Management" />
            <Field label="Payment URL" value={fields.paymentUrl ?? ''} onChange={v => setField('paymentUrl', v)} placeholder="https://pay.stripe.com/..." />
            <Field label="Period" value={fields.period ?? ''} onChange={v => setField('period', v)} placeholder="May 2026" />
          </>}
          {template === 'report' && <>
            <Field label="Period (month/year)" value={fields.period ?? ''} onChange={v => setField('period', v)} placeholder="May 2026" />
            <p className="text-xs text-zinc-500 font-mono -mt-2">Engagement stats are auto-pulled when sent.</p>
          </>}
          {template === 'strategy_onboarding' && <>
            <Field label="Platforms (comma-separated)" value={fields.platforms ?? ''} onChange={v => setField('platforms', v)} placeholder="Instagram, TikTok" />
            <Field label="Posting frequency" value={fields.frequency ?? ''} onChange={v => setField('frequency', v)} placeholder="1 post/day" />
            <Field label="Content pillars (one per line)" value={fields.contentPillars ?? ''} onChange={v => setField('contentPillars', v)} placeholder={"Behind the scenes\nProduct showcases"} textarea />
            <Field label="Start date" value={fields.startDate ?? ''} onChange={v => setField('startDate', v)} placeholder="June 1, 2026" />
          </>}
          {template === 'strategy_monthly' && <>
            <Field label="Month" value={fields.month ?? ''} onChange={v => setField('month', v)} placeholder="June 2026" />
            <Field label="Platforms (comma-separated)" value={fields.platforms ?? ''} onChange={v => setField('platforms', v)} placeholder="Instagram, TikTok" />
            <Field label="Total scheduled posts" value={fields.totalScheduled ?? ''} onChange={v => setField('totalScheduled', v)} placeholder="24" />
            <Field label="Topics (one per line)" value={fields.topics ?? ''} onChange={v => setField('topics', v)} placeholder={"Eid collection launch\nSummer menu reveal"} textarea />
          </>}
        </div>

        {/* Preview */}
        <div className="p-6 flex flex-col">
          <p className="text-xs font-sans text-zinc-500 uppercase tracking-widest mb-4">Preview</p>
          <div className="mb-3 font-mono text-xs text-zinc-400 space-y-1">
            <div>To: <span className="text-zinc-300">{to ? to.split(',').map(s => s.trim()).filter(Boolean).join(', ') : '—'}</span></div>
            <div>Subject: <span className="text-zinc-300">{subject || '—'}</span></div>
          </div>
          <div className="flex-1 border border-zinc-800 bg-white min-h-[400px]">
            {previewHtml
              ? <iframe srcDoc={previewHtml} title="email-preview" data-testid="email-preview-frame" className="w-full h-full min-h-[400px]" sandbox="allow-same-origin" />
              : <div className="flex items-center justify-center h-full min-h-[400px] text-zinc-400 text-sm font-mono">Select a client to preview</div>
            }
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleSend} disabled={sending || !to} data-testid="send-now-preview-btn"
              className="flex items-center gap-2 px-4 py-2 bg-white text-black text-sm font-semibold rounded-none hover:bg-zinc-200 disabled:opacity-40 transition-colors duration-200 cursor-pointer">
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send Now
            </button>
            <button onClick={() => setShowSchedule(true)} disabled={!to} data-testid="schedule-btn"
              className="flex items-center gap-2 px-4 py-2 border border-zinc-700 text-white text-sm font-semibold rounded-none hover:bg-zinc-800 disabled:opacity-40 transition-colors duration-200 cursor-pointer">
              <Calendar size={14} /> Schedule →
            </button>
          </div>
        </div>
      </div>

      {/* Scheduled Queue */}
      <div className="p-6 border-b border-zinc-800">
        <p className="text-xs font-sans text-zinc-500 uppercase tracking-widest mb-4">Scheduled Queue</p>
        {scheduled.length === 0
          ? <p className="text-sm font-mono text-zinc-600">No scheduled emails.</p>
          : <table className="w-full text-xs font-mono" data-testid="scheduled-table">
              <thead><tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 pr-4 font-normal">Client</th>
                <th className="text-left py-2 pr-4 font-normal">Type</th>
                <th className="text-left py-2 pr-4 font-normal">Scheduled At</th>
                <th className="text-left py-2 pr-4 font-normal">Status</th>
                <th className="py-2" />
              </tr></thead>
              <tbody>{scheduled.map(s => {
                const c = clients.find(c => c.id === s.client_id);
                return <tr key={s._id} className="border-b border-zinc-900 hover:bg-zinc-900 transition-colors duration-200">
                  <td className="py-2 pr-4 text-zinc-300">{c?.name ?? s.client_id}</td>
                  <td className="py-2 pr-4 text-zinc-400">{s.type}</td>
                  <td className="py-2 pr-4 text-zinc-400">{new Date(s.scheduled_at).toLocaleString()}</td>
                  <td className="py-2 pr-4"><StatusDot status={s.status} /></td>
                  <td className="py-2">
                    <button onClick={() => cancelScheduled(s._id)} data-testid={`cancel-${s._id}`}
                      className="text-zinc-500 hover:text-red-400 transition-colors duration-200 cursor-pointer">
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>;
              })}</tbody>
            </table>
        }
      </div>

      {/* Sent History */}
      <div className="p-6">
        <p className="text-xs font-sans text-zinc-500 uppercase tracking-widest mb-4">Sent History</p>
        {history.length === 0
          ? <p className="text-sm font-mono text-zinc-600">No emails sent yet.</p>
          : <table className="w-full text-xs font-mono" data-testid="history-table">
              <thead><tr className="text-zinc-500 border-b border-zinc-800">
                <th className="text-left py-2 pr-4 font-normal">Client</th>
                <th className="text-left py-2 pr-4 font-normal">Type</th>
                <th className="text-left py-2 pr-4 font-normal">Subject</th>
                <th className="text-left py-2 pr-4 font-normal">Sent At</th>
                <th className="text-left py-2 font-normal">Delivery</th>
              </tr></thead>
              <tbody>{history.map(h => {
                const c = clients.find(c => c._id === h.client_id);
                return <tr key={h._id} className="border-b border-zinc-900 hover:bg-zinc-900 transition-colors duration-200">
                  <td className="py-2 pr-4 text-zinc-300">{c?.name ?? h.client_id}</td>
                  <td className="py-2 pr-4 text-zinc-400">{h.type}</td>
                  <td className="py-2 pr-4 text-zinc-400 max-w-[200px] truncate">{h.subject}</td>
                  <td className="py-2 pr-4 text-zinc-400">{new Date(h.sent_at).toLocaleString()}</td>
                  <td className="py-2"><StatusDot status={h.delivery_status ?? h.status} /></td>
                </tr>;
              })}</tbody>
            </table>
        }
      </div>

      {/* Schedule Modal */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-sm p-6" data-testid="schedule-modal">
            <div className="flex items-center justify-between mb-4">
              <p className="font-sans font-semibold tracking-tight">SCHEDULE EMAIL</p>
              <button onClick={() => setShowSchedule(false)} className="text-zinc-500 hover:text-white transition-colors duration-200 cursor-pointer"><X size={16} /></button>
            </div>
            <DayPicker mode="single" selected={scheduleDay} onSelect={setScheduleDay} fromDate={new Date()} className="text-white" />
            <div className="mt-4 mb-6">
              <label className={LABEL_CLS}>Time</label>
              <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className={INPUT_CLS} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSchedule(false)} className="flex-1 py-2 border border-zinc-700 text-white text-sm rounded-none hover:bg-zinc-800 transition-colors duration-200 cursor-pointer">Cancel</button>
              <button onClick={handleSchedule} data-testid="confirm-schedule-btn" className="flex-1 py-2 bg-white text-black text-sm font-semibold rounded-none hover:bg-zinc-200 transition-colors duration-200 cursor-pointer">Confirm Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
