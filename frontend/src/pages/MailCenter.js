import { useState, useEffect, useCallback } from 'react';
import { render } from '@react-email/render';
import axios from 'axios';
import { toast } from 'sonner';
import { Send, Calendar, Trash2, X, Loader2, Mail, RefreshCw } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { InvoiceEmail } from '../emails/InvoiceEmail';
import { ClientReportEmail } from '../emails/ClientReportEmail';
import { ContentStrategyOnboardingEmail } from '../emails/ContentStrategyOnboardingEmail';
import { InstagramAuditEmail } from '../emails/InstagramAuditEmail';

const TEMPLATES = [
  { value: 'invoice',             label: 'Invoice' },
  { value: 'report',              label: 'Monthly' },
  { value: 'audit',               label: 'Audit' },
  { value: 'strategy_onboarding', label: 'Onboarding' },
];

const INPUT_CLS = "w-full bg-zinc-950 border border-zinc-800 text-white text-base px-3 py-2 rounded-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 focus:outline-none font-mono placeholder:text-zinc-600 transition-colors duration-200";
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
  const [syncingAnalytics, setSyncingAnalytics] = useState(false);

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
    if (!clientId) return;
    const c = clients.find(c => c.id === clientId);
    if (!c) return;
    const ob = c.onboarding_data ?? {};
    const now = new Date();
    const monthStr = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const platformStr = (c.platforms ?? []).join(', ') || 'Instagram';
    const fills = {
      invoice: {
        clientName: c.name ?? '',
        clientEmail: ob.email ?? '',
        clientPhone: ob.whatsapp ?? '',
        invoiceMonth: monthStr,
        invoiceDate: dateStr,
      },
      report: {
        instagramHandle: ob.instagram_handle ?? '',
        period: monthStr,
        platform: platformStr,
      },
      audit: {
        instagramHandle: ob.instagram_handle ?? '',
        reportDate: monthStr,
        niche: ob.niche ?? '',
        targetAudience: ob.target_audience_description ?? c.target_audience ?? '',
      },
      strategy_onboarding: {
        platforms: platformStr,
      },
    };
    const fill = fills[template];
    if (fill) setFields(f => ({ ...f, ...fill }));
  }, [clientId, template, clients]);

  useEffect(() => {
    if (template !== 'invoice' || !clientId) return;
    axios.get('/api/mail/next-invoice-number')
      .then(r => setFields(f => f.invoiceNumber ? f : { ...f, invoiceNumber: r.data.invoice_number }))
      .catch(() => {});
  }, [template, clientId]);

  useEffect(() => {
    const c = clients.find(c => c.id === clientId);
    const name = c?.name ?? 'Client';
    const subs = {
      invoice: `Invoice${fields.invoiceNumber ? ` #${fields.invoiceNumber}` : ''} — ${fields.invoiceMonth || 'This Month'} — Sleeping Creators`,
      report: `Monthly Report — ${fields.period ?? ''} | ${name}`,
      strategy_onboarding: `Your Content Strategy — ${name}`,
    };
    setSubject(subs[template] ?? '');
  }, [template, clientId, fields, clients]);

  const mapAnalyticsToFields = (d) => {
    const s = (v) => v != null ? String(v) : null;
    const fill = {};
    if (d.followers)          fill.followers         = s(d.followers);
    if (d.impressions)        fill.impressions       = s(d.impressions);
    if (d.views != null)      fill.views             = s(d.views);
    if (d.likes)              fill.likes             = s(d.likes);
    if (d.comments)           fill.comments          = s(d.comments);
    if (d.engagement_rate != null) fill.engagementRate = s(d.engagement_rate);
    if (d.following != null)  fill.following         = s(d.following);
    if (d.impressions_unique) fill.impressionsUnique = s(d.impressions_unique);
    if (d.views_unique != null) fill.viewsUnique     = s(d.views_unique);
    if (d.posts)              fill.posts             = s(d.posts);
    return fill;
  };

  useEffect(() => {
    if (template !== 'report' || !clientId) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await axios.get(`/api/analytics/clients/${clientId}/monthly-report`).then(r => r.data);
        if (cancelled) return;
        const fill = mapAnalyticsToFields(d);
        if (Object.keys(fill).length) {
          setFields(f => ({ ...f, ...fill }));
          toast.success('Analytics loaded');
        }
      } catch { /* no analytics available */ }
    })();
    return () => { cancelled = true; };
  }, [template, clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncAnalytics = useCallback(async () => {
    if (!clientId) return;
    setSyncingAnalytics(true);
    try {
      const d = await axios.get(`/api/analytics/clients/${clientId}/monthly-report`).then(r => r.data);
      const fill = mapAnalyticsToFields(d);
      setFields(f => ({ ...f, ...fill }));
      toast.success(Object.keys(fill).length ? 'Analytics synced' : 'No analytics data found');
    } catch {
      toast.error('Failed to fetch analytics');
    } finally {
      setSyncingAnalytics(false);
    }
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rebuildPreview = useCallback(async () => {
    const c = clients.find(c => c.id === clientId);
    const name = c?.name ?? 'Client';
    const baseUrl = window.location.origin;
    let element = null;
    if (template === 'invoice') {
      element = <InvoiceEmail
        clientName={fields.clientName || name}
        clientEmail={fields.clientEmail ?? c?.onboarding_data?.email ?? ''}
        clientPhone={fields.clientPhone ?? ''}
        clientGstin={fields.clientGstin ?? ''}
        invoiceNumber={fields.invoiceNumber ?? ''}
        invoiceDate={fields.invoiceDate ?? ''}
        invoiceMonth={fields.invoiceMonth ?? ''}
        amount={fields.amount ?? ''}
        discount={fields.discount ?? 0}
        amountInWords={fields.amountInWords ?? ''}
        includeGst={!!fields.includeGst}
        paymentUrl={fields.paymentUrl ?? ''}
        baseUrl={baseUrl}
      />;
    } else if (template === 'report') {
      element = <ClientReportEmail
        clientName={name}
        instagramHandle={fields.instagramHandle ?? ''}
        period={fields.period ?? ''}
        platform={fields.platform ?? ''}
        followers={fields.followers ?? ''}
        impressions={fields.impressions ?? ''}
        views={fields.views ?? ''}
        likes={fields.likes ?? ''}
        comments={fields.comments ?? ''}
        engagementRate={fields.engagementRate ?? ''}
        following={fields.following ?? ''}
        impressionsUnique={fields.impressionsUnique ?? ''}
        viewsUnique={fields.viewsUnique ?? ''}
        posts={fields.posts ?? ''}
        notes={fields.notes ?? ''}
        baseUrl={baseUrl}
      />;
    } else if (template === 'audit') {
      element = <InstagramAuditEmail
        clientName={name} instagramHandle={fields.instagramHandle ?? ''} reportDate={fields.reportDate ?? ''}
        niche={fields.niche ?? ''} targetAudience={fields.targetAudience ?? ''}
        tam={fields.tam ?? ''} marketNotes={fields.marketNotes ?? ''}
        avgEngagementRate={fields.avgEngagementRate ?? ''} topContentFormat={fields.topContentFormat ?? ''} peakPostingTime={fields.peakPostingTime ?? ''}
        comp1Handle={fields.comp1Handle ?? ''} comp1Followers={fields.comp1Followers ?? ''} comp1Working={fields.comp1Working ?? ''} comp1Gap={fields.comp1Gap ?? ''}
        comp2Handle={fields.comp2Handle ?? ''} comp2Followers={fields.comp2Followers ?? ''} comp2Working={fields.comp2Working ?? ''} comp2Gap={fields.comp2Gap ?? ''}
        comp3Handle={fields.comp3Handle ?? ''} comp3Followers={fields.comp3Followers ?? ''} comp3Working={fields.comp3Working ?? ''} comp3Gap={fields.comp3Gap ?? ''}
        contentTrends={fields.contentTrends ?? ''}
        pillar1Topic={fields.pillar1Topic ?? ''} pillar1Format={fields.pillar1Format ?? ''}
        pillar2Topic={fields.pillar2Topic ?? ''} pillar2Format={fields.pillar2Format ?? ''}
        pillar3Topic={fields.pillar3Topic ?? ''} pillar3Format={fields.pillar3Format ?? ''}
        pillar4Topic={fields.pillar4Topic ?? ''} pillar4Format={fields.pillar4Format ?? ''}
        strategyOverview={fields.strategyOverview ?? ''}
        month1Items={fields.month1Items ?? ''} month2Items={fields.month2Items ?? ''} month3Items={fields.month3Items ?? ''} month4Items={fields.month4Items ?? ''}
        strengths={fields.strengths ?? ''} weaknesses={fields.weaknesses ?? ''} opportunities={fields.opportunities ?? ''} threats={fields.threats ?? ''}
        profilePhotoRating={fields.profilePhotoRating ?? ''} bioRating={fields.bioRating ?? ''} highlightsRating={fields.highlightsRating ?? ''}
        contentConsistencyRating={fields.contentConsistencyRating ?? ''} postingFrequencyRating={fields.postingFrequencyRating ?? ''} engagementRateRating={fields.engagementRateRating ?? ''}
        totalPosts={fields.totalPosts ?? ''} avgLikes={fields.avgLikes ?? ''} avgComments={fields.avgComments ?? ''} avgReach={fields.avgReach ?? ''} avgSaves={fields.avgSaves ?? ''}
        baseUrl={baseUrl}
      />;
    } else if (template === 'strategy_onboarding') {
      element = <ContentStrategyOnboardingEmail clientName={name} platforms={(fields.platforms ?? '').split(',').map(s => s.trim()).filter(Boolean)} frequency={fields.frequency ?? ''} contentPillars={fields.contentPillars ?? ''} brandVoice={c?.brand_voice ?? ''} startDate={fields.startDate ?? ''} baseUrl={baseUrl} />;
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
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] border-b border-zinc-800" style={{ minHeight: '240px' }}>

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
              <p className="text-xs font-mono text-zinc-600 mb-3">— Invoice Details —</p>
              <Field label="Invoice Number" value={fields.invoiceNumber ?? ''} onChange={v => setField('invoiceNumber', v)} placeholder="SC-2026-001" />
              <Field label="Invoice Date" value={fields.invoiceDate ?? ''} onChange={v => setField('invoiceDate', v)} placeholder="23 May 2026" />
              <Field label="Invoice Month" value={fields.invoiceMonth ?? ''} onChange={v => setField('invoiceMonth', v)} placeholder="May 2026" />
              <p className="text-xs font-mono text-zinc-600 mb-3">— Billed To —</p>
              <Field label="Client Name" value={fields.clientName ?? ''} onChange={v => setField('clientName', v)} placeholder="John Doe" />
              <Field label="Client Email (invoice)" value={fields.clientEmail ?? ''} onChange={v => setField('clientEmail', v)} placeholder="client@email.com" />
              <Field label="Phone / WhatsApp" value={fields.clientPhone ?? ''} onChange={v => setField('clientPhone', v)} placeholder="+91 98765 43210" />
              <Field label="Client GSTIN" value={fields.clientGstin ?? ''} onChange={v => setField('clientGstin', v)} placeholder="(if applicable)" />
              <p className="text-xs font-mono text-zinc-600 mb-3">— Amount —</p>
              <Field label="Amount" value={fields.amount ?? ''} onChange={v => setField('amount', v)} placeholder="5000" />
              <div className="mb-3 flex items-center gap-2 cursor-pointer" onClick={() => setField('includeGst', !fields.includeGst)}>
                <div className={`w-4 h-4 border flex items-center justify-center transition-colors ${fields.includeGst ? 'bg-white border-white' : 'border-zinc-600'}`}>
                  {fields.includeGst && <span className="text-black text-xs font-bold leading-none">✓</span>}
                </div>
                <span className="text-xs font-mono text-zinc-400">Add GST (18%)</span>
              </div>
              <Field label="Discount" value={fields.discount ?? ''} onChange={v => setField('discount', v)} placeholder="0" />
              <Field label="Amount in Words" value={fields.amountInWords ?? ''} onChange={v => setField('amountInWords', v)} placeholder="Five Thousand Nine Hundred" />
              <Field label="Payment URL" value={fields.paymentUrl ?? ''} onChange={v => setField('paymentUrl', v)} placeholder="https://pay.stripe.com/..." />
            </>}
            {template === 'report' && <>
              <button onClick={syncAnalytics} disabled={!clientId || syncingAnalytics}
                className="w-full flex items-center justify-center gap-2 mb-4 py-2 text-xs font-mono border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
                <RefreshCw size={12} className={syncingAnalytics ? 'animate-spin' : ''} />
                {syncingAnalytics ? 'Syncing...' : 'Sync Analytics'}
              </button>
              <Field label="Period" value={fields.period ?? ''} onChange={v => setField('period', v)} placeholder="May 2026" />
              <Field label="Instagram Handle" value={fields.instagramHandle ?? ''} onChange={v => setField('instagramHandle', v)} placeholder="@client" />
              <p className="text-xs font-mono text-zinc-600 mb-3 -mt-1">— Row 1 —</p>
              <Field label="Followers" value={fields.followers ?? ''} onChange={v => setField('followers', v)} placeholder="40" />
              <Field label="Impressions" value={fields.impressions ?? ''} onChange={v => setField('impressions', v)} placeholder="5,817" />
              <Field label="Views" value={fields.views ?? ''} onChange={v => setField('views', v)} placeholder="177" />
              <p className="text-xs font-mono text-zinc-600 mb-3 -mt-1">— Row 2 —</p>
              <Field label="Likes" value={fields.likes ?? ''} onChange={v => setField('likes', v)} placeholder="93" />
              <Field label="Comments" value={fields.comments ?? ''} onChange={v => setField('comments', v)} placeholder="9" />
              <Field label="Eng. Rate (%)" value={fields.engagementRate ?? ''} onChange={v => setField('engagementRate', v)} placeholder="255.00" />
              <p className="text-xs font-mono text-zinc-600 mb-3 -mt-1">— Row 3 —</p>
              <Field label="Following" value={fields.following ?? ''} onChange={v => setField('following', v)} placeholder="31" />
              <Field label="Uniq. Impressions" value={fields.impressionsUnique ?? ''} onChange={v => setField('impressionsUnique', v)} placeholder="5,817" />
              <Field label="Uniq. Views" value={fields.viewsUnique ?? ''} onChange={v => setField('viewsUnique', v)} placeholder="0" />
              <p className="text-xs font-mono text-zinc-600 mb-3 -mt-1">— Row 4 —</p>
              <Field label="Posts" value={fields.posts ?? ''} onChange={v => setField('posts', v)} placeholder="251" />
              <Field label="Platform" value={fields.platform ?? ''} onChange={v => setField('platform', v)} placeholder="Instagram" />
              <Field label="Notes / Strategy Update" value={fields.notes ?? ''} onChange={v => setField('notes', v)} placeholder="Based on this month's performance..." textarea />
            </>}
            {template === 'audit' && <>
              <Field label="Instagram Handle" value={fields.instagramHandle ?? ''} onChange={v => setField('instagramHandle', v)} placeholder="@client" />
              <Field label="Report Date" value={fields.reportDate ?? ''} onChange={v => setField('reportDate', v)} placeholder="June 2026" />
              <Field label="Niche / Industry" value={fields.niche ?? ''} onChange={v => setField('niche', v)} placeholder="Fashion & Lifestyle" />
              <Field label="Target Audience" value={fields.targetAudience ?? ''} onChange={v => setField('targetAudience', v)} placeholder="Women 18–35, UAE" />
              <p className="text-xs font-mono text-zinc-600 mb-3">— Market —</p>
              <Field label="TAM" value={fields.tam ?? ''} onChange={v => setField('tam', v)} placeholder="$2.4B" />
              <Field label="Market Notes" value={fields.marketNotes ?? ''} onChange={v => setField('marketNotes', v)} placeholder="Growing market with..." textarea />
              <Field label="Avg. Engagement Rate" value={fields.avgEngagementRate ?? ''} onChange={v => setField('avgEngagementRate', v)} placeholder="3.2%" />
              <Field label="Top Content Format" value={fields.topContentFormat ?? ''} onChange={v => setField('topContentFormat', v)} placeholder="Reels" />
              <Field label="Peak Posting Time" value={fields.peakPostingTime ?? ''} onChange={v => setField('peakPostingTime', v)} placeholder="7–9 PM" />
              <p className="text-xs font-mono text-zinc-600 mb-3">— Competitors —</p>
              {[1,2,3].map(n => <div key={n}>
                <p className="text-xs font-mono text-zinc-700 mb-2">Competitor {n}</p>
                <Field label={`C${n} Handle`} value={fields[`comp${n}Handle`] ?? ''} onChange={v => setField(`comp${n}Handle`, v)} placeholder="@competitor" />
                <Field label={`C${n} Followers`} value={fields[`comp${n}Followers`] ?? ''} onChange={v => setField(`comp${n}Followers`, v)} placeholder="50,000" />
                <Field label={`C${n} What's Working`} value={fields[`comp${n}Working`] ?? ''} onChange={v => setField(`comp${n}Working`, v)} placeholder="Consistent Reels..." />
                <Field label={`C${n} Gap`} value={fields[`comp${n}Gap`] ?? ''} onChange={v => setField(`comp${n}Gap`, v)} placeholder="Low engagement..." />
              </div>)}
              <p className="text-xs font-mono text-zinc-600 mb-3">— Content —</p>
              <Field label="Content Trends" value={fields.contentTrends ?? ''} onChange={v => setField('contentTrends', v)} placeholder="Trending formats in your niche..." textarea />
              {[1,2,3,4].map(n => <div key={n}>
                <p className="text-xs font-mono text-zinc-700 mb-2">Pillar {n}</p>
                <Field label={`Pillar ${n} Topic`} value={fields[`pillar${n}Topic`] ?? ''} onChange={v => setField(`pillar${n}Topic`, v)} placeholder="Behind the scenes" />
                <Field label={`Pillar ${n} Format`} value={fields[`pillar${n}Format`] ?? ''} onChange={v => setField(`pillar${n}Format`, v)} placeholder="Reels" />
              </div>)}
              <Field label="Strategy Overview" value={fields.strategyOverview ?? ''} onChange={v => setField('strategyOverview', v)} placeholder="Our approach for your account..." textarea />
              <p className="text-xs font-mono text-zinc-600 mb-3">— Roadmap (one item per line) —</p>
              {['month1Items','month2Items','month3Items','month4Items'].map((k,i) => (
                <Field key={k} label={`Month ${i+1} Items`} value={fields[k] ?? ''} onChange={v => setField(k, v)} placeholder={`Goal\nTactic\nDeliverable`} textarea />
              ))}
              <p className="text-xs font-mono text-zinc-600 mb-3">— SWOT (one point per line) —</p>
              <Field label="Strengths" value={fields.strengths ?? ''} onChange={v => setField('strengths', v)} placeholder={"Strong visual brand\nHigh saves rate"} textarea />
              <Field label="Weaknesses" value={fields.weaknesses ?? ''} onChange={v => setField('weaknesses', v)} placeholder={"Low posting frequency"} textarea />
              <Field label="Opportunities" value={fields.opportunities ?? ''} onChange={v => setField('opportunities', v)} placeholder={"Untapped Reels market"} textarea />
              <Field label="Threats" value={fields.threats ?? ''} onChange={v => setField('threats', v)} placeholder={"Rising competitor accounts"} textarea />
              <p className="text-xs font-mono text-zinc-600 mb-3">— Profile Audit Ratings —</p>
              <Field label="Profile Photo" value={fields.profilePhotoRating ?? ''} onChange={v => setField('profilePhotoRating', v)} placeholder="Good — on brand" />
              <Field label="Bio" value={fields.bioRating ?? ''} onChange={v => setField('bioRating', v)} placeholder="Needs CTA" />
              <Field label="Highlights" value={fields.highlightsRating ?? ''} onChange={v => setField('highlightsRating', v)} placeholder="3 active, 2 outdated" />
              <Field label="Content Consistency" value={fields.contentConsistencyRating ?? ''} onChange={v => setField('contentConsistencyRating', v)} placeholder="Inconsistent theme" />
              <Field label="Posting Frequency" value={fields.postingFrequencyRating ?? ''} onChange={v => setField('postingFrequencyRating', v)} placeholder="2–3x/week" />
              <Field label="Engagement Rate" value={fields.engagementRateRating ?? ''} onChange={v => setField('engagementRateRating', v)} placeholder="4.1% — above avg" />
              <p className="text-xs font-mono text-zinc-600 mb-3">— Performance Snapshot —</p>
              <Field label="Total Posts" value={fields.totalPosts ?? ''} onChange={v => setField('totalPosts', v)} placeholder="142" />
              <Field label="Avg. Likes" value={fields.avgLikes ?? ''} onChange={v => setField('avgLikes', v)} placeholder="280" />
              <Field label="Avg. Comments" value={fields.avgComments ?? ''} onChange={v => setField('avgComments', v)} placeholder="18" />
              <Field label="Avg. Reach" value={fields.avgReach ?? ''} onChange={v => setField('avgReach', v)} placeholder="1,200" />
              <Field label="Avg. Saves" value={fields.avgSaves ?? ''} onChange={v => setField('avgSaves', v)} placeholder="45" />
            </>}
            {template === 'strategy_onboarding' && <>
              <Field label="Platforms" value={fields.platforms ?? ''} onChange={v => setField('platforms', v)} placeholder="Instagram, TikTok" />
              <Field label="Posting Frequency" value={fields.frequency ?? ''} onChange={v => setField('frequency', v)} placeholder="1 post/day" />
              <Field label="Content Pillars (one per line)" value={fields.contentPillars ?? ''} onChange={v => setField('contentPillars', v)} placeholder={"Behind the scenes\nProduct showcases"} textarea />
              <Field label="Start Date" value={fields.startDate ?? ''} onChange={v => setField('startDate', v)} placeholder="June 1, 2026" />
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
          <div className="flex-1 bg-white overflow-hidden" style={{ minHeight: '240px' }}>
            {previewHtml
              ? <iframe srcDoc={previewHtml.replace('</head>', '<style>html{zoom:0.75;font-size:16px}</style></head>')} title="email-preview" data-testid="email-preview-frame"
                  className="w-full h-full" style={{ minHeight: '240px' }} sandbox="allow-same-origin" />
              : (
                <div className="flex flex-col items-center justify-center h-full min-h-[240px] text-zinc-300 gap-3">
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
