const BUTTON_PRESETS = [
  {
    id: "solid_white",
    label: "Solid",
    preview: { background: "#fff", color: "#000", borderRadius: 4 },
  },
  {
    id: "pill_outline",
    label: "Outline",
    preview: { background: "transparent", color: "#fff", border: "2px solid #fff", borderRadius: 999 },
  },
  {
    id: "dark_solid",
    label: "Dark",
    preview: { background: "#111", color: "#fff", borderRadius: 6, boxShadow: "2px 2px 0 rgba(0,0,0,0.5)" },
  },
  {
    id: "brand_purple",
    label: "Purple",
    preview: { background: "#6366f1", color: "#fff", borderRadius: 8 },
  },
  {
    id: "pill_gradient",
    label: "Gradient",
    preview: { background: "linear-gradient(90deg,#a855f7,#ec4899)", color: "#fff", borderRadius: 999 },
  },
  {
    id: "neon_glow",
    label: "Neon",
    preview: { background: "#0f0f0f", color: "#39ff14", borderRadius: 4, boxShadow: "0 0 8px #39ff14, 0 0 16px #39ff1455" },
  },
  {
    id: "frosted",
    label: "Frosted",
    preview: {
      background: "rgba(255,255,255,0.15)",
      color: "#fff",
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.3)",
      backdropFilter: "blur(8px)",
    },
  },
  {
    id: "brand_orange",
    label: "Orange",
    preview: { background: "#f97316", color: "#fff", borderRadius: 6 },
  },
];

export function ButtonStylePicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {BUTTON_PRESETS.map((p) => {
        const selected = value === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange(p.id)}
            className={`rounded p-1.5 border flex flex-col items-center gap-1 transition-all ${
              selected
                ? "border-white ring-1 ring-white bg-zinc-700"
                : "border-zinc-700 bg-zinc-800 hover:border-zinc-500"
            }`}
          >
            <div
              className="w-full flex items-center justify-center text-[8px] font-bold"
              style={{ height: 22, ...p.preview }}
            >
              CTA →
            </div>
            <span className="text-[8px] font-mono text-zinc-400 leading-none">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export { BUTTON_PRESETS };
