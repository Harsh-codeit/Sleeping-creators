import { useState, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { MemberPanel } from "../components/team/MemberPanel";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function TeamPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchMembers = async () => {
    try {
      const resp = await axios.get(`${API}/team`);
      setMembers(resp.data);
    } catch { toast.error("Failed to load team members"); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchMembers(); }, []);

  const openAdd = () => { setEditing(null); setPanelOpen(true); };
  const openEdit = (m) => { setEditing(m); setPanelOpen(true); };
  const closePanel = () => { setPanelOpen(false); setEditing(null); };

  const handleSave = async (form, memberId) => {
    try {
      if (memberId) {
        const payload = { name: form.name, email: form.email, permissions: form.permissions };
        if (form.password) payload.password = form.password;
        await axios.put(`${API}/team/${memberId}`, payload);
        toast.success("Member updated");
      } else {
        await axios.post(`${API}/team`, form);
        toast.success("Member created");
      }
      await fetchMembers();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save member");
      throw e;
    }
  };

  const toggleActive = async (member) => {
    try {
      await axios.put(`${API}/team/${member.id}`, { is_active: !member.is_active });
      toast.success(member.is_active ? "Member deactivated" : "Member activated");
      await fetchMembers();
    } catch { toast.error("Failed to update member status"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-zinc-500 font-mono text-sm animate-pulse">LOADING TEAM...</div>;
  }

  return (
    <div className="p-6" data-testid="team-page">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Team Members</h1>
          <p className="text-[10px] font-mono text-zinc-500 mt-0.5">Manage access and permissions</p>
        </div>
        <button
          data-testid="team-add-member-btn"
          onClick={openAdd}
          className="bg-white text-black font-bold rounded-none px-4 py-2 hover:bg-zinc-200 transition-colors duration-200 text-sm cursor-pointer"
        >
          + Add Member
        </button>
      </div>

      {/* Table */}
      <div className="bg-zinc-950 border border-zinc-800">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-800">
              <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-left px-4 py-3">Name</th>
              <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-left px-4 py-3">Email</th>
              <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-left px-4 py-3">Status</th>
              <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-zinc-600 font-mono text-sm py-10">
                  No team members yet. Add one to get started.
                </td>
              </tr>
            )}
            {members.map(member => (
              <tr
                key={member.id}
                data-testid={`team-row-${member.id}`}
                className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors duration-200"
              >
                <td className="px-4 py-3 text-sm text-white font-sans">{member.name}</td>
                <td className="px-4 py-3 text-sm text-zinc-400 font-mono">{member.email}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${member.is_active ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`} />
                    <span className={`text-[10px] font-mono font-semibold ${member.is_active ? "text-emerald-400" : "text-zinc-500"}`}>
                      {member.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    data-testid={`team-edit-btn-${member.id}`}
                    onClick={() => openEdit(member)}
                    className="border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none text-xs font-mono px-3 py-1.5 transition-colors duration-200 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    data-testid={`team-toggle-btn-${member.id}`}
                    onClick={() => toggleActive(member)}
                    className="border border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-none text-xs font-mono px-3 py-1.5 transition-colors duration-200 cursor-pointer"
                  >
                    {member.is_active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MemberPanel
        open={panelOpen}
        member={editing}
        onClose={closePanel}
        onSave={handleSave}
      />
    </div>
  );
}
