export function VideoField({ label, children }) {
  return (
    <div>
      <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-wide mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}
