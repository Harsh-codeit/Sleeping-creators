import { X, Plus, Check } from "lucide-react";

/* ── Existing primitives (moved from Onboarding.js, unchanged behavior) ── */

export function Label({ children, optional }) {
  return (
    <label className="block text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1.5">
      {children}
      {optional && <span className="ml-1 text-zinc-600 normal-case tracking-normal">optional</span>}
    </label>
  );
}

export function Input({ testid, ...props }) {
  return (
    <input
      data-testid={testid}
      {...props}
      className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
    />
  );
}

export function Textarea({ testid, rows = 3, ...props }) {
  return (
    <textarea
      data-testid={testid}
      rows={rows}
      {...props}
      className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150 resize-none"
    />
  );
}

export function MultiInput({ label, values, onChange, placeholder, testid, optional }) {
  const add = () => onChange([...values, ""]);
  const remove = (i) => onChange(values.filter((_, idx) => idx !== i));
  const update = (i, v) => onChange(values.map((x, idx) => idx === i ? v : x));
  return (
    <div>
      <Label optional={optional}>{label}</Label>
      <div className="space-y-2">
        {values.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input
              data-testid={`${testid}-${i}`}
              value={val}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
            />
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="px-2 text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-900 transition-colors duration-150"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white font-mono transition-colors duration-150"
        >
          <Plus size={12} /> Add another
        </button>
      </div>
    </div>
  );
}

/* ── New primitives for the redesigned form ────────────────────── */

export function SubsectionHeader({ id, label, hint }) {
  return (
    <div className="border-b border-zinc-800 pb-2 mb-4">
      <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
        {id ? <span className="text-zinc-600 mr-2">{id}</span> : null}
        {label}
      </div>
      {hint ? <p className="text-[10px] text-zinc-600 font-mono mt-1">{hint}</p> : null}
    </div>
  );
}

export function YesNoToggle({ label, value, onChange, optional, testid }) {
  return (
    <div>
      <Label optional={optional}>{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        {[
          { v: true, lbl: "Yes" },
          { v: false, lbl: "No" },
        ].map(opt => (
          <button
            key={String(opt.v)}
            type="button"
            data-testid={`${testid}-${opt.v ? "yes" : "no"}`}
            onClick={() => onChange(opt.v)}
            className={`p-3 border text-left transition-all duration-150 ${
              value === opt.v
                ? "border-white bg-white/5"
                : "border-zinc-700 hover:border-zinc-500"
            }`}
          >
            <div className="text-xs font-semibold text-white">{opt.lbl}</div>
            {value === opt.v && (
              <div className="mt-1 flex items-center gap-1">
                <Check size={10} className="text-white" />
                <span className="text-[9px] font-mono text-zinc-300">Selected</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MultiCheckbox({ label, options, values, onChange, optional, testid, columns = 3 }) {
  const safeValues = Array.isArray(values) ? values : [];
  const toggle = (v) => {
    const next = safeValues.includes(v) ? safeValues.filter(x => x !== v) : [...safeValues, v];
    onChange(next);
  };
  const colClass = columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-4" : "grid-cols-3";
  return (
    <div>
      <Label optional={optional}>{label}</Label>
      <div className={`grid ${colClass} gap-2`}>
        {options.map(opt => {
          const value = typeof opt === "string" ? opt : opt.value;
          const display = typeof opt === "string" ? opt : opt.label;
          const selected = safeValues.includes(value);
          return (
            <button
              key={value}
              type="button"
              data-testid={`${testid}-${value}`}
              onClick={() => toggle(value)}
              className={`relative py-2.5 px-3 border text-xs font-mono uppercase text-left overflow-hidden transition-all duration-150 ${
                selected
                  ? "border-white text-white bg-white/5"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300"
              }`}
            >
              {selected && (
                <span className="absolute top-1 right-1">
                  <Check size={9} className="text-white" />
                </span>
              )}
              {display}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CappedMultiInput({ label, values, onChange, cap, placeholder, testid, optional }) {
  const safe = Array.isArray(values) && values.length ? values : [""];
  const add = () => {
    if (safe.length >= cap) return;
    onChange([...safe, ""]);
  };
  const remove = (i) => onChange(safe.filter((_, idx) => idx !== i));
  const update = (i, v) => onChange(safe.map((x, idx) => idx === i ? v : x));
  return (
    <div>
      <Label optional={optional}>
        {label}
        <span className="ml-2 text-zinc-600 normal-case tracking-normal">{safe.length}/{cap}</span>
      </Label>
      <div className="space-y-2">
        {safe.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input
              data-testid={`${testid}-${i}`}
              value={val}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
            />
            {safe.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="px-2 text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-900 transition-colors duration-150"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        {safe.length < cap && (
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white font-mono transition-colors duration-150"
          >
            <Plus size={12} /> Add another
          </button>
        )}
      </div>
    </div>
  );
}

export function LongTextarea({ label, value, onChange, minWords, placeholder, testid, optional, rows = 6 }) {
  const wordCount = (value || "").trim().split(/\s+/).filter(Boolean).length;
  const ok = !minWords || wordCount >= minWords;
  return (
    <div>
      <Label optional={optional}>
        {label}
        {minWords ? (
          <span className={`ml-2 normal-case tracking-normal ${ok ? "text-emerald-500/80" : "text-zinc-600"}`}>
            {wordCount} / {minWords} words
          </span>
        ) : null}
      </Label>
      <textarea
        data-testid={testid}
        rows={rows}
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150 resize-none"
      />
    </div>
  );
}

export function SelectMultiInput({ label, values, onChange, options, placeholder, testid, minItems }) {
  const safe = Array.isArray(values) && values.length ? values : [""];
  const add = () => onChange([...safe, ""]);
  const remove = (i) => onChange(safe.filter((_, idx) => idx !== i));
  const update = (i, v) => onChange(safe.map((x, idx) => idx === i ? v : x));
  const filled = safe.filter(v => v && String(v).trim()).length;
  const ok = !minItems || filled >= minItems;
  return (
    <div>
      <Label>
        {label}
        {minItems && (
          <span className={`ml-2 normal-case tracking-normal ${ok ? "text-emerald-500/80" : "text-zinc-600"}`}>
            {filled} / {minItems} min
          </span>
        )}
      </Label>
      <div className="space-y-2">
        {safe.map((val, i) => (
          <div key={i} className="flex gap-2">
            <select
              data-testid={`${testid}-${i}`}
              value={val}
              onChange={e => update(i, e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-zinc-400 transition-colors duration-150 appearance-none"
            >
              <option value="" disabled>{placeholder || "Select..."}</option>
              {options.map(opt => (
                <option key={opt} value={opt} className="bg-zinc-950">{opt}</option>
              ))}
            </select>
            {safe.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="px-2 text-zinc-600 hover:text-red-400 border border-zinc-700 hover:border-red-900 transition-colors duration-150"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-white font-mono transition-colors duration-150"
        >
          <Plus size={12} /> Add another language
        </button>
      </div>
    </div>
  );
}

/* ── @-prefix input extracted from Onboarding.js for reuse ─────── */

export function PrefixedInput({ prefix = "@", testid, value, onChange, placeholder }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-mono">{prefix}</span>
      <input
        data-testid={testid}
        value={value || ""}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-700 pl-7 pr-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-400 transition-colors duration-150"
      />
    </div>
  );
}
