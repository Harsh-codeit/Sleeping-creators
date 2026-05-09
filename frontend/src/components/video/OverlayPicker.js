const STYLES = [
  { value: "none",          label: "None",         preview: { background: "transparent" } },
  { value: "gradient_wash", label: "Gradient",     preview: { background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 65%)" } },
  { value: "color_tint",    label: "Tint",         preview: { background: "rgba(0,0,0,0.50)" } },
  { value: "lower_thirds",  label: "Lower Thirds", preview: { background: "linear-gradient(to top, rgba(0,0,0,0.80) 35%, transparent 35%)" } },
  { value: "geometric",     label: "Geometric",    preview: { background: "repeating-linear-gradient(45deg, rgba(0,0,0,0.25) 0px, rgba(0,0,0,0.25) 8px, transparent 8px, transparent 16px)" } },
  { value: "blur",          label: "Blur",         preview: { background: "rgba(255,255,255,0.08)", backdropFilter: "blur(4px)" } },
];

export function OverlayPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {STYLES.map((s) => {
        const selected = value === s.value;
        return (
          <button
            key={s.value}
            type="button"
            onClick={() => onChange(s.value)}
            className={`flex flex-col items-center gap-1.5 p-1 border transition-colors ${
              selected
                ? "border-white ring-1 ring-white"
                : "border-zinc-800 hover:border-zinc-600"
            }`}
          >
            <div
              className="w-full bg-gradient-to-br from-zinc-700 to-zinc-900 overflow-hidden"
              style={{ aspectRatio: "9 / 16" }}
            >
              <div className="w-full h-full" style={s.preview} />
            </div>
            <span className="text-[9px] font-mono text-zinc-400 leading-none">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
