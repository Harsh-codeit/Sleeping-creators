import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Save, Send, Zap, Bot, Settings2, Lock, FileSpreadsheet, CheckCircle2, AlertCircle, Link, Copy } from "lucide-react";
import { useUser } from "../context/UserContext";
import Logs from "./Logs";
import TeamPage from "./TeamPage";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function localToUTC(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function utcToLocal(hhmm) {
  if (!hhmm) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "general";
  const setTab = (t) => setSearchParams({ tab: t });
  const { role } = useUser();
  const isOwner = role === "owner";

  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoStatus, setAutoStatus] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(null);
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sResp, aResp, gResp, tResp] = await Promise.all([
          axios.get(`${API}/settings`),
          axios.get(`${API}/automation/status`),
          axios.get(`${API}/auth/google/status`),
          axios.get(`${API}/templates`),
        ]);
        setSettings(sResp.data);
        setForm(sResp.data);
        setAutoStatus(aResp.data);
        setGoogleConnected(gResp.data.connected);
        setTemplates(tResp.data || []);
      } catch { toast.error("Failed to load settings"); }
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const resp = await axios.put(`${API}/settings`, form);
      setSettings(resp.data);
      toast.success("Settings saved");
    } catch { toast.error("Failed to save settings"); }
    finally { setSaving(false); }
  };

  const testTelegram = async () => {
    setTesting(true);
    try {
      await axios.post(`${API}/settings/telegram/test`, {
        bot_token: form.telegram_bot_token,
        chat_id: form.telegram_chat_id,
      });
      toast.success("Test message sent! Check your Telegram.");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Telegram test failed. Check your token and chat ID.");
    } finally { setTesting(false); }
  };

  const triggerAutomation = async () => {
    try {
      await axios.post(`${API}/automation/trigger`);
      toast.success("Automation cycle triggered");
    } catch { toast.error("Failed to trigger automation"); }
  };

  const updateForm = (key, value) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="h-full bg-zinc-950 flex flex-col" data-testid="settings-page">
      {/* Tab bar */}
      <div className="flex items-center gap-0 px-6 pt-4 border-b border-zinc-800 flex-shrink-0">
        <h1 className="text-lg font-bold text-white tracking-tight mr-6">Settings</h1>
        {[
          { key: "general", label: "General" },
          { key: "logs",    label: "Logs" },
          ...(isOwner ? [{ key: "team", label: "Team & Permissions" }] : []),
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-3 text-xs font-mono font-semibold border-b-2 transition-colors ${
              activeTab === key
                ? "border-white text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Logs tab */}
      {activeTab === "logs" && <Logs />}

      {/* Team tab */}
      {activeTab === "team" && isOwner && <TeamPage />}

      {/* General tab */}
      {activeTab === "general" && (loading ? (
        <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm animate-pulse">LOADING SETTINGS...</div>
      ) : (
      <div className="p-6 max-w-2xl overflow-y-auto">
      <div className="space-y-6">
        {/* Telegram */}
        <div className="bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
            <Bot size={14} className="text-zinc-400" />
            <div className="text-xs font-mono text-zinc-300 uppercase tracking-widest font-semibold">Telegram Alerts</div>
          </div>
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Bot Token</label>
              <input
                data-testid="telegram-token-input"
                type="password"
                value={form.telegram_bot_token || ""}
                onChange={e => updateForm("telegram_bot_token", e.target.value)}
                placeholder="1234567890:ABCdefGHIjklMNOpqrstUVWxyz"
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
              />
              <div className="text-[10px] text-zinc-600 font-mono mt-1">Get from @BotFather on Telegram</div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Chat ID</label>
              <input
                data-testid="telegram-chat-id-input"
                value={form.telegram_chat_id || ""}
                onChange={e => updateForm("telegram_chat_id", e.target.value)}
                placeholder="-1001234567890"
                className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
              />
              <div className="text-[10px] text-zinc-600 font-mono mt-1">Your Telegram user ID or group chat ID</div>
            </div>
          </div>
          <button
            data-testid="test-telegram-btn"
            onClick={testTelegram}
            disabled={testing || !form.telegram_bot_token || !form.telegram_chat_id}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
          >
            <Send size={12} className={testing ? "animate-pulse" : ""} />
            {testing ? "Sending..." : "Test Connection"}
          </button>
        </div>

        {/* Automation */}
        <div className="bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
            <Settings2 size={14} className="text-zinc-400" />
            <div className="text-xs font-mono text-zinc-300 uppercase tracking-widest font-semibold">Automation Engine</div>
          </div>
          <div className="space-y-4">
            {[
              { key: "automation_enabled", label: "Enable Automation Engine", desc: "Master switch for all background automation tasks" },
              { key: "auto_publish", label: "Auto-Publish Posts", desc: "Publish approved posts automatically at scheduled times" },
              { key: "require_approval", label: "Require Human Approval", desc: "AI-generated posts require manual approval before scheduling" },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-white">{label}</div>
                  <div className="text-xs font-mono text-zinc-500 mt-0.5">{desc}</div>
                </div>
                <button
                  data-testid={`toggle-${key}`}
                  onClick={() => updateForm(key, !form[key])}
                  className={`w-10 h-5 relative flex-shrink-0 mt-0.5 transition-colors duration-200 ${form[key] ? "bg-white" : "bg-zinc-700"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-black transition-transform duration-200 ${form[key] ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </div>
            ))}
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Posts Per Day Per Client</label>
              <input
                data-testid="posts-per-day-input"
                type="number"
                min={1}
                max={20}
                value={form.posts_per_day_per_client || 3}
                onChange={e => updateForm("posts_per_day_per_client", parseInt(e.target.value))}
                className="w-24 bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Competitor Scrape Limit</label>
              <input
                data-testid="competitor-scrape-limit-input"
                type="number"
                min={1}
                max={200}
                value={form.competitor_scrape_limit ?? 10}
                onChange={e => updateForm("competitor_scrape_limit", parseInt(e.target.value))}
                className="w-24 bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500 font-mono"
              />
              <div className="text-[10px] text-zinc-600 font-mono mt-1">Max posts Apify scrapes per competitor (1–200)</div>
            </div>
          </div>
        </div>

        {/* Video Generation Prompt */}
        <div className="bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
            <Bot size={14} className="text-zinc-400" />
            <div className="text-xs font-mono text-zinc-300 uppercase tracking-widest font-semibold">Video Generation Prompt</div>
          </div>
          <div className="space-y-2">
            <div className="text-[11px] font-mono text-zinc-500 leading-relaxed">
              Global voice/style instructions used when generating video captions and on-screen text.
              Each client can override via their Strategy page. Leave empty to use the built-in default prompt.
            </div>
            <div className="text-[10px] font-mono text-zinc-600 leading-relaxed">
              Supported placeholders: <code className="text-zinc-400">[TARGET AUDIENCE]</code>, <code className="text-zinc-400">[WHAT THEY TEACH OR SELL OR SOLVE]</code> — replaced with each client's data at render time.
            </div>
            <textarea
              data-testid="global-video-prompt-input"
              value={form.global_video_prompt || ""}
              onChange={e => updateForm("global_video_prompt", e.target.value)}
              rows={10}
              placeholder="e.g. Write a scroll-stopping B Roll Reel hook between 15 to 20 words..."
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono leading-relaxed resize-y"
            />
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-zinc-600">
                {(form.global_video_prompt || "").length} chars
              </span>
              <button
                data-testid="save-global-video-prompt"
                onClick={save}
                disabled={saving}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 text-white text-[11px] font-semibold hover:bg-zinc-700 disabled:opacity-50 transition-colors border border-zinc-700"
              >
                <Save size={11} />
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Google Sheets */}
        <div className="bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
            <FileSpreadsheet size={14} className="text-zinc-400" />
            <div className="text-xs font-mono text-zinc-300 uppercase tracking-widest font-semibold">Google Sheets</div>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {googleConnected === null ? (
                  <span className="text-xs font-mono text-zinc-500">Checking...</span>
                ) : googleConnected ? (
                  <>
                    <CheckCircle2 size={13} className="text-emerald-400" />
                    <span className="text-xs font-mono text-emerald-400">Connected</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={13} className="text-amber-400" />
                    <span className="text-xs font-mono text-amber-400">Not connected</span>
                  </>
                )}
              </div>
              <div className="text-[10px] font-mono text-zinc-600 leading-relaxed max-w-sm">
                {googleConnected
                  ? "Sleeping Creators can create and sync Google Sheets for clients."
                  : "Authorize Sleeping Creators to create and manage Google Sheets on your behalf. One-time setup."}
              </div>
            </div>
            <a
              href={`${process.env.REACT_APP_BACKEND_URL}/api/auth/google/start`}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 text-xs border transition-colors duration-150 ${
                googleConnected
                  ? "border-zinc-700 text-zinc-500 hover:bg-zinc-800"
                  : "border-emerald-700 text-emerald-400 hover:bg-emerald-950"
              }`}
            >
              <FileSpreadsheet size={11} />
              {googleConnected ? "Re-authorize" : "Connect Google"}
            </a>
          </div>
        </div>

        {/* Engine Status */}
        {autoStatus && (
          <div className="bg-zinc-900 border border-zinc-800 p-5">
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Engine Status</div>
            <div className="space-y-2">
              {(autoStatus.jobs || []).map(job => (
                <div key={job.id} className="flex items-center justify-between p-2 bg-zinc-950 border border-zinc-800">
                  <div className="text-xs font-mono text-zinc-400">{job.id}</div>
                  <div className="text-[10px] font-mono text-zinc-600">
                    Next: {job.next_run ? new Date(job.next_run).toLocaleTimeString() : "—"}
                  </div>
                </div>
              ))}
            </div>
            <button
              data-testid="trigger-automation-settings-btn"
              onClick={triggerAutomation}
              className="mt-3 flex items-center gap-2 px-3 py-1.5 text-xs border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors duration-150"
            >
              <Zap size={11} />
              Manual Trigger
            </button>
          </div>
        )}

        {/* Bundle.social */}
        <BundleSettings />

        {/* New Client Defaults */}
        <div className="bg-zinc-900 border border-zinc-800 p-5">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
            <Bot size={14} className="text-zinc-400" />
            <div className="text-xs font-mono text-zinc-300 uppercase tracking-widest font-semibold">New Client Defaults</div>
          </div>
          <div className="space-y-4">
            <div className="text-[11px] font-mono text-zinc-500 leading-relaxed">
              A <span className="text-zinc-300">Daily Content</span> pipeline is created automatically for every new client (1 post/day, Instagram). Configure the defaults below.
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Default Carousel Template</label>
              <select
                value={form.default_carousel_template || ""}
                onChange={e => updateForm("default_carousel_template", e.target.value || null)}
                className="w-full bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono px-3 py-2 focus:outline-none focus:border-zinc-500"
              >
                <option value="">AI decides per post</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <div className="text-[10px] text-zinc-600 font-mono mt-1">You can override this per pipeline after the client is created.</div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Daily Posting Time</label>
              {(() => {
                const raw = utcToLocal(form.onboard_pipeline_posting_time || "09:00");
                const [hStr, mStr] = raw.split(":");
                const h24 = parseInt(hStr, 10);
                const ampm = h24 >= 12 ? "PM" : "AM";
                const h12 = h24 % 12 || 12;
                const setTime = (newH12, newAmpm, newMin) => {
                  let h = newH12 % 12;
                  if (newAmpm === "PM") h += 12;
                  const localHHMM = `${String(h).padStart(2, "0")}:${newMin}`;
                  updateForm("onboard_pipeline_posting_time", localToUTC(localHHMM));
                };
                return (
                  <div className="flex items-center gap-1">
                    <select
                      value={h12}
                      onChange={e => setTime(parseInt(e.target.value), ampm, mStr)}
                      className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono px-2 py-2 focus:outline-none focus:border-zinc-500"
                    >
                      {Array.from({length: 12}, (_, i) => i + 1).map(h => (
                        <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
                      ))}
                    </select>
                    <span className="text-zinc-500 font-mono text-xs">:</span>
                    <select
                      value={mStr}
                      onChange={e => setTime(h12, ampm, e.target.value)}
                      className="bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono px-2 py-2 focus:outline-none focus:border-zinc-500"
                    >
                      {["00","15","30","45"].map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                    <div className="flex border border-zinc-700 overflow-hidden">
                      {["AM","PM"].map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setTime(h12, p, mStr)}
                          className={`px-2.5 py-2 text-xs font-mono transition-colors ${ampm === p ? "bg-zinc-700 text-white" : "bg-zinc-950 text-zinc-500 hover:text-zinc-300"}`}
                        >{p}</button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div className="text-[10px] text-zinc-600 font-mono mt-1">Time of day the daily post fires for all new clients (your local timezone).</div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Delay Before First Post (hours)</label>
              <input
                type="number"
                min="0"
                max="720"
                value={form.onboard_pipeline_delay_hours ?? 0}
                onChange={e => updateForm("onboard_pipeline_delay_hours", parseInt(e.target.value) || 0)}
                className="w-32 bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono px-3 py-2 focus:outline-none focus:border-zinc-500"
              />
              <div className="text-[10px] text-zinc-600 font-mono mt-1">0 = pipeline starts immediately. E.g. 48 = first post 2 days after onboarding.</div>
            </div>
            <div>
              <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Slides Per Carousel</label>
              <select
                value={form.onboard_pipeline_slide_count || ""}
                onChange={e => updateForm("onboard_pipeline_slide_count", e.target.value ? parseInt(e.target.value) : null)}
                className="w-32 bg-zinc-950 border border-zinc-700 text-zinc-200 text-xs font-mono px-3 py-2 focus:outline-none focus:border-zinc-500"
              >
                <option value="">Default (5)</option>
                {[3,4,5,6,7,8,9,10].map(n => (
                  <option key={n} value={n}>{n} slides</option>
                ))}
              </select>
              <div className="text-[10px] text-zinc-600 font-mono mt-1">Number of slides in each carousel post.</div>
            </div>
          </div>
        </div>

        {/* Save */}
        <button
          data-testid="save-settings-btn"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-50"
        >
          <Save size={14} />
          {saving ? "Saving..." : "Save Settings"}
        </button>

        {/* Change Password */}
        <ChangePassword />
      </div>
      </div>
      ))}
    </div>
  );
}

function BundleSettings() {
  const [form, setForm] = useState({ bundle_api_key: "", bundle_webhook_secret: "" });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const resp = await axios.get(`${API}/settings/bundle`);
      setForm(resp.data);
      setLoaded(true);
    } catch { /* silently skip if endpoint not yet deployed */ setLoaded(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/settings/bundle`, form);
      toast.success("Bundle settings saved");
    } catch { toast.error("Failed to save Bundle settings"); }
    finally { setSaving(false); }
  };

  const webhookUrl = `${window.location.origin}/webhooks/bundle`;

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl).then(() => toast.success("Copied!"));
  };

  if (!loaded) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-800">
        <Link size={14} className="text-zinc-400" />
        <div className="text-xs font-mono text-zinc-300 uppercase tracking-widest font-semibold">Publishing Integration</div>
      </div>
      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">API Key</label>
          <input
            type="password"
            value={form.bundle_api_key || ""}
            onChange={e => setForm(f => ({ ...f, bundle_api_key: e.target.value }))}
            placeholder="pk_live_..."
            className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
          />
          <div className="text-[10px] text-zinc-600 font-mono mt-1">From your publishing dashboard → API Keys</div>
        </div>
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Webhook Secret</label>
          <input
            type="password"
            value={form.bundle_webhook_secret || ""}
            onChange={e => setForm(f => ({ ...f, bundle_webhook_secret: e.target.value }))}
            placeholder="wh_..."
            className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
          />
        </div>
        <div>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Webhook URL</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-zinc-950 border border-zinc-800 px-3 py-2 text-xs font-mono text-zinc-400 truncate select-all">
              {webhookUrl}
            </div>
            <button
              onClick={copyWebhookUrl}
              className="flex items-center gap-1.5 px-2.5 py-2 border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-xs"
            >
              <Copy size={11} />
            </button>
          </div>
          <div className="text-[10px] text-zinc-600 font-mono mt-1">Register in Bundle dashboard → Organization → Webhooks</div>
        </div>
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="flex items-center gap-2 px-4 py-2 text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40"
      >
        <Save size={12} className={saving ? "animate-pulse" : ""} />
        {saving ? "Saving..." : "Save Bundle Settings"}
      </button>
    </div>
  );
}

function ChangePassword() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.current || !form.next) return toast.error("Fill all fields");
    if (form.next.length < 6) return toast.error("New password must be at least 6 characters");
    if (form.next !== form.confirm) return toast.error("New passwords don't match");
    setSaving(true);
    try {
      const { data } = await axios.post(`${API}/auth/change-password`, {
        current_password: form.current,
        new_password: form.next,
      });
      localStorage.setItem("sc_token", data.token);
      axios.defaults.headers.common["Authorization"] = `Bearer ${data.token}`;
      toast.success("Password changed");
      setForm({ current: "", next: "", confirm: "" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 p-5 max-w-md">
      <div className="flex items-center gap-2 mb-4">
        <Lock size={14} className="text-zinc-400" />
        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Change Password</span>
      </div>
      <div className="space-y-3">
        {[
          ["current", "Current Password"],
          ["next",    "New Password"],
          ["confirm", "Confirm New Password"],
        ].map(([key, label]) => (
          <div key={key}>
            <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-wider mb-1.5">{label}</label>
            <input
              data-testid={`change-pw-${key}`}
              type="password"
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors"
              placeholder="••••••••"
            />
          </div>
        ))}
        <button
          data-testid="change-pw-btn"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white text-xs font-semibold hover:bg-zinc-700 disabled:opacity-50 transition-colors border border-zinc-700"
        >
          <Lock size={12} />
          {saving ? "Updating..." : "Update Password"}
        </button>
      </div>
    </div>
  );
}
