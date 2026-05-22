import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { PermissionsMatrix } from "./PermissionsMatrix";

const EMPTY_PERMISSIONS = {
  dashboard: { view: false },
  clients: { view: false, create: false, edit: false, delete: false },
  templates: { view: false, create: false, edit: false, delete: false },
  calendar: { view: false, create: false, edit: false, delete: false },
  studio: { view: false, create: false, edit: false, delete: false },
  music: { view: false, create: false, edit: false, delete: false },
  video_templates: { view: false, create: false, edit: false, delete: false },
  analytics: { view: false },
  dropbox: { view: false, create: false, edit: false, delete: false },
  logs: { view: false },
  usage: { view: false },
  settings: { view: false, edit: false },
};

export function MemberPanel({ open, member, onClose, onSave }) {
  const isEdit = !!member;
  const [form, setForm] = useState({ name: "", email: "", password: "", permissions: EMPTY_PERMISSIONS });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setForm({ name: member.name, email: member.email, password: "", permissions: member.permissions ?? EMPTY_PERMISSIONS });
    } else {
      setForm({ name: "", email: "", password: "", permissions: EMPTY_PERMISSIONS });
    }
  }, [member, open]);

  const submit = async () => {
    if (!form.name.trim()) return;
    if (!isEdit && !form.password) return;
    setSaving(true);
    try {
      await onSave(form, isEdit ? member.id : null);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
        data-testid="team-panel-backdrop"
      />
      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-[#09090B] border-l border-zinc-800 flex flex-col z-50">
        {/* Header */}
        <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <h2 className="text-white font-bold text-base">
            {isEdit ? "Edit Member" : "Add Member"}
          </h2>
          <button
            data-testid="team-panel-close"
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition-colors duration-200 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Name</label>
            <input
              data-testid="member-name-input"
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full rounded-none bg-zinc-900 border border-zinc-800 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
          </div>
          {/* Email */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Email</label>
            <input
              data-testid="member-email-input"
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@agency.com"
              className="w-full rounded-none bg-zinc-900 border border-zinc-800 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
          </div>
          {/* Password */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-1.5">Password</label>
            <input
              data-testid="member-password-input"
              type="password"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
              className="w-full rounded-none bg-zinc-900 border border-zinc-800 px-4 py-3 text-white text-sm placeholder-zinc-700 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-colors"
            />
            {isEdit && (
              <p className="text-[10px] font-mono text-zinc-600 mt-1">LEAVE BLANK TO KEEP CURRENT PASSWORD</p>
            )}
          </div>
          {/* Permissions */}
          <div>
            <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">Permissions</p>
            <PermissionsMatrix
              permissions={form.permissions}
              onChange={perms => setForm(f => ({ ...f, permissions: perms }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-zinc-800 px-6 py-4 flex justify-between items-center flex-shrink-0">
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white text-sm font-mono transition-colors duration-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            data-testid="team-save-btn"
            onClick={submit}
            disabled={saving || !form.name.trim() || (!isEdit && !form.password)}
            className="bg-white text-black font-bold px-5 py-2.5 rounded-none hover:bg-zinc-200 disabled:opacity-50 transition-colors duration-200 cursor-pointer text-sm"
          >
            {saving ? "Saving..." : "Save Member"}
          </button>
        </div>
      </div>
    </>
  );
}
