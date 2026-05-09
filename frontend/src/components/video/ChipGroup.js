export function ChipGroup({ options, value, onChange, format }) {
  return (
    <div className="flex border border-zinc-800">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={`flex-1 py-1.5 text-xs font-mono capitalize border-r border-zinc-800 last:border-0 transition-colors ${
            value === o
              ? "bg-white text-black font-semibold"
              : "text-zinc-500 hover:text-white hover:bg-zinc-800"
          }`}
        >
          {format ? format(o) : o}
        </button>
      ))}
    </div>
  );
}
