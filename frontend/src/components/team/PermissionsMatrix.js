const SECTIONS = [
  { key: "dashboard",       label: "Dashboard",  actions: ["view"] },
  { key: "clients",         label: "Clients",    actions: ["view", "create", "edit", "delete"] },
  { key: "templates",       label: "Templates",  actions: ["view", "create", "edit", "delete"] },
  { key: "calendar",        label: "Calendar",   actions: ["view", "create", "edit", "delete"] },
  { key: "studio",          label: "Studio",     actions: ["view", "create", "edit", "delete"] },
  { key: "music",           label: "Music",      actions: ["view", "create", "edit", "delete"] },
  { key: "video_templates", label: "Video",      actions: ["view", "create", "edit", "delete"] },
  { key: "analytics",       label: "Analytics",  actions: ["view"] },
  { key: "dropbox",         label: "Dropbox",    actions: ["view", "create", "edit", "delete"] },
  { key: "logs",            label: "Logs",       actions: ["view"] },
  { key: "usage",           label: "Usage",      actions: ["view"] },
  { key: "settings",        label: "Settings",   actions: ["view", "edit"] },
];

const ALL_ACTIONS = ["view", "create", "edit", "delete"];

export function PermissionsMatrix({ permissions, onChange }) {
  const toggle = (section, action) => {
    const current = permissions[section] ?? {};
    onChange({
      ...permissions,
      [section]: { ...current, [action]: !current[action] },
    });
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="sticky top-0 bg-[#09090B] border-b border-zinc-800">
            <th className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest py-2 pr-4 w-32">Section</th>
            {ALL_ACTIONS.map(a => (
              <th key={a} className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest py-2 px-3 text-center">
                {a}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map(({ key, label, actions }) => (
            <tr key={key} className="border-b border-zinc-800 hover:bg-zinc-900/50 transition-colors duration-200">
              <td className="text-sm text-zinc-300 font-mono py-2.5 pr-4">{label}</td>
              {ALL_ACTIONS.map(action => (
                <td key={action} className="py-2.5 px-3 text-center">
                  {actions.includes(action) ? (
                    <input
                      type="checkbox"
                      data-testid={`perm-${key}-${action}`}
                      checked={!!permissions[key]?.[action]}
                      onChange={() => toggle(key, action)}
                      className="w-4 h-4 accent-white cursor-pointer"
                    />
                  ) : (
                    <span className="text-zinc-700 select-none">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
