const FONTS = [
  { value: "bold_sans",      label: "Bold Sans",   sample: "Aa", style: "font-bold tracking-tight text-white" },
  { value: "elegant_serif",  label: "Serif",       sample: "Aa", style: "italic text-white" },
  { value: "handwritten",    label: "Handwritten", sample: "Aa", style: "font-normal text-white opacity-90" },
  { value: "modern_display", label: "Display",     sample: "Aa", style: "font-black tracking-widest text-white uppercase" },
];

export function FontPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {FONTS.map((f) => {
        const selected = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            className={`flex flex-col items-center justify-center gap-1 py-3 border transition-colors ${
              selected
                ? "border-white bg-zinc-800"
                : "border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900"
            }`}
          >
            <span className={`text-2xl leading-none ${f.style}`}>{f.sample}</span>
            <span className="text-[9px] font-mono text-zinc-500 leading-none">{f.label}</span>
          </button>
        );
      })}
    </div>
  );
}
