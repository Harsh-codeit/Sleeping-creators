import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Save, Send, Zap, Bot, Settings2, Lock, FileSpreadsheet, CheckCircle2, AlertCircle, Link, Copy } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoStatus, setAutoStatus] = useState(null);
  const [googleConnected, setGoogleConnected] = useState(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [sResp, aResp, gResp] = await Promise.all([
          axios.get(`${API}/settings`),
          axios.get(`${API}/automation/status`),
          axios.get(`${API}/auth/google/status`),
        ]);
        setSettings(sResp.data);
        setForm(sResp.data);
        setAutoStatus(aResp.data);
        setGoogleConnected(gResp.data.connected);
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

  if (loading) {
    return <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm animate-pulse">LOADING SETTINGS...</div>;
  }

  return (
    <div className="p-6 max-w-2xl" data-testid="settings-page">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-xs text-zinc-500 font-mono mt-0.5">Global automation & integration configuration</p>
      </div>

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
