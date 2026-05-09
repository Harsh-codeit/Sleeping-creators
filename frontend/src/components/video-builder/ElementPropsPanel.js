const FONTS = ["bold_sans", "elegant_serif", "handwritten", "modern_display", "helvetica"];
const ANIMS_IN = ["none", "fade", "slide_up", "slide_in", "pop"];
const ANIMS_OUT = ["none", "fade"];
const BG_SHAPES = ["none", "pill", "box"];
const ALIGNS = ["left", "center", "right"];
const TRANSFORMS = ["none", "uppercase", "capitalize", "lowercase"];

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">{label}</label>
      {children}
    </div>
  );
}

function Row({ children }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>;
}

function Input({ value, onChange, type = "text", min, max, step, placeholder, className = "" }) {
  return (
    <input
      type={type} value={value ?? ""} min={min} max={max} step={step} placeholder={placeholder}
      onChange={e => {
        if (type === 'number') {
          const n = parseFloat(e.target.value);
          onChange(isNaN(n) ? null : n);
        } else {
          onChange(e.target.value);
        }
      }}
      className={`bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-zinc-500 font-mono ${className}`}
    />
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      className="bg-zinc-900 border border-zinc-800 px-2 py-1 text-xs text-white w-full focus:outline-none focus:border-zinc-500 font-mono"
    >
      {options.map(o => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)}
        className="w-3.5 h-3.5" />
      <span className="text-xs text-zinc-400">{label}</span>
    </label>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value || "#ffffff"} onChange={e => onChange(e.target.value)}
          className="w-8 h-7 border border-zinc-700 bg-zinc-900 cursor-pointer p-0" />
        <Input value={value} onChange={onChange} />
      </div>
    </Field>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-[9px] font-semibold text-zinc-600 tracking-widest uppercase whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-zinc-800" />
    </div>
  );
}

function TextTypeProps({ props, onChange }) {
  return (
    <>
      <Field label="Text">
        <Input value={props.text} onChange={v => onChange({ text: v })} />
      </Field>

      <Row>
        <Field label="Font">
          <Select value={props.font} onChange={v => onChange({ font: v })} options={FONTS} />
        </Field>
        <Field label="Align">
          <Select value={props.align} onChange={v => onChange({ align: v })} options={ALIGNS} />
        </Field>
      </Row>

      <Row>
        <Field label="Size (px)">
          <Input type="number" value={props.size_px} onChange={v => onChange({ size_px: v })} min={6} max={200} step={1} />
        </Field>
        <Field label="Line Height">
          <Input type="number" value={props.line_height} onChange={v => onChange({ line_height: v })} min={0.5} max={4} step={0.1} />
        </Field>
      </Row>

      <Row>
        <Field label="Letter Spacing">
          <Input type="number" value={props.letter_spacing} onChange={v => onChange({ letter_spacing: v })} min={-10} max={40} step={0.5} />
        </Field>
        <Field label="Transform">
          <Select value={props.text_transform || "none"} onChange={v => onChange({ text_transform: v })} options={TRANSFORMS} />
        </Field>
      </Row>

      <Row>
        <Field label="Width Ratio">
          <Input type="number" value={props.width_ratio} onChange={v => onChange({ width_ratio: v })} min={0.05} max={1} step={0.01} />
        </Field>
        <Field label="Opacity">
          <Input type="number" value={props.opacity ?? 1} onChange={v => onChange({ opacity: v })} min={0} max={1} step={0.05} />
        </Field>
      </Row>

      <ColorInput label="Text Color" value={props.color} onChange={v => onChange({ color: v })} />

      <Field label="Background">
        <Select value={props.bg_shape} onChange={v => onChange({ bg_shape: v })} options={BG_SHAPES} />
      </Field>
      {props.bg_shape !== "none" && (
        <>
          <ColorInput label="BG Color" value={props.bg_color} onChange={v => onChange({ bg_color: v })} />
          <Field label="BG Opacity">
            <Input type="number" value={props.bg_opacity} onChange={v => onChange({ bg_opacity: v })} min={0} max={1} step={0.1} />
          </Field>
        </>
      )}

      <Toggle label="Shadow" checked={props.shadow} onChange={v => onChange({ shadow: v })} />
    </>
  );
}

function CtaButtonProps({ props, onChange }) {
  return (
    <>
      <Field label="Text">
        <Input value={props.text} onChange={v => onChange({ text: v })} />
      </Field>

      <Row>
        <Field label="Font">
          <Select value={props.font} onChange={v => onChange({ font: v })} options={FONTS} />
        </Field>
        <Field label="Size (px)">
          <Input type="number" value={props.size_px} onChange={v => onChange({ size_px: v })} min={6} max={120} step={1} />
        </Field>
      </Row>

      <Row>
        <Field label="Width Ratio">
          <Input type="number" value={props.width_ratio} onChange={v => onChange({ width_ratio: v })} min={0.05} max={1} step={0.01} />
        </Field>
        <Field label="Border Radius">
          <Input type="number" value={props.border_radius} onChange={v => onChange({ border_radius: v })} min={0} max={999} />
        </Field>
      </Row>

      <ColorInput label="BG Color" value={props.bg_color} onChange={v => onChange({ bg_color: v })} />
      <ColorInput label="Text Color" value={props.text_color} onChange={v => onChange({ text_color: v })} />

      <div className="flex gap-4">
        <Toggle label="Arrow →" checked={props.arrow} onChange={v => onChange({ arrow: v })} />
        <Toggle label="Gradient" checked={props.gradient} onChange={v => onChange({ gradient: v })} />
      </div>
      {props.gradient && (
        <>
          <ColorInput label="Gradient From" value={props.gradient_from} onChange={v => onChange({ gradient_from: v })} />
          <ColorInput label="Gradient To" value={props.gradient_to} onChange={v => onChange({ gradient_to: v })} />
        </>
      )}
    </>
  );
}

function LinkInBioProps({ props, onChange }) {
  return (
    <>
      <Row>
        <Field label="Text"><Input value={props.text} onChange={v => onChange({ text: v })} /></Field>
        <Field label="Handle"><Input value={props.handle} onChange={v => onChange({ handle: v })} /></Field>
      </Row>
      <ColorInput label="BG Color" value={props.bg_color} onChange={v => onChange({ bg_color: v })} />
      <ColorInput label="Text Color" value={props.text_color} onChange={v => onChange({ text_color: v })} />
    </>
  );
}

function CountdownProps({ props, onChange }) {
  return (
    <>
      <Row>
        <Field label="End At (s)">
          <Input type="number" value={props.end_at} onChange={v => onChange({ end_at: v })} min={0} step={1} />
        </Field>
        <Field label="Size (px)">
          <Input type="number" value={props.size_px} onChange={v => onChange({ size_px: v })} min={12} max={200} step={2} />
        </Field>
      </Row>
      <Row>
        <Field label="Font">
          <Select value={props.font} onChange={v => onChange({ font: v })} options={FONTS} />
        </Field>
        <ColorInput label="Color" value={props.color} onChange={v => onChange({ color: v })} />
      </Row>
    </>
  );
}

function MediaProps({ props, onChange }) {
  return (
    <>
      <Field label="R2 URL"><Input value={props.r2_url} onChange={v => onChange({ r2_url: v })} placeholder="https://..." /></Field>
      <Row>
        <Field label="Width Ratio">
          <Input type="number" value={props.width_ratio} onChange={v => onChange({ width_ratio: v })} min={0.01} max={1} step={0.01} />
        </Field>
        <Field label="Height Ratio">
          <Input type="number" value={props.height_ratio} onChange={v => onChange({ height_ratio: v })} min={0.01} max={1} step={0.01} />
        </Field>
      </Row>
      <Field label="Opacity">
        <Input type="number" value={props.opacity} onChange={v => onChange({ opacity: v })} min={0} max={1} step={0.05} />
      </Field>
    </>
  );
}

function RectCircleProps({ props, onChange }) {
  return (
    <>
      <ColorInput label="Fill Color" value={props.fill_color} onChange={v => onChange({ fill_color: v })} />
      <Row>
        <Field label="Fill Opacity">
          <Input type="number" value={props.fill_opacity} onChange={v => onChange({ fill_opacity: v })} min={0} max={1} step={0.05} />
        </Field>
        <Field label="Border Width">
          <Input type="number" value={props.border_width} onChange={v => onChange({ border_width: v })} min={0} max={20} />
        </Field>
      </Row>
      {props.border_width > 0 && (
        <ColorInput label="Border Color" value={props.border_color} onChange={v => onChange({ border_color: v })} />
      )}
      <Row>
        <Field label="Width Ratio">
          <Input type="number" value={props.width_ratio} onChange={v => onChange({ width_ratio: v })} min={0.01} max={1} step={0.01} />
        </Field>
        <Field label="Height Ratio">
          <Input type="number" value={props.height_ratio} onChange={v => onChange({ height_ratio: v })} min={0.01} max={1} step={0.01} />
        </Field>
      </Row>
    </>
  );
}

function LineProps({ props, onChange }) {
  return (
    <>
      <ColorInput label="Color" value={props.color} onChange={v => onChange({ color: v })} />
      <Row>
        <Field label="Thickness">
          <Input type="number" value={props.thickness} onChange={v => onChange({ thickness: v })} min={1} max={20} />
        </Field>
        <Field label="Width Ratio">
          <Input type="number" value={props.width_ratio} onChange={v => onChange({ width_ratio: v })} min={0.01} max={1} step={0.01} />
        </Field>
      </Row>
    </>
  );
}

function TypePropsSection({ el, onPropsChange }) {
  const p = el.props || {};
  const onChange = (patch) => onPropsChange(el.id, patch);
  if (["text_overlay", "lower_third", "cta_text"].includes(el.type))
    return <TextTypeProps props={p} onChange={onChange} />;
  if (el.type === "cta_button") return <CtaButtonProps props={p} onChange={onChange} />;
  if (el.type === "link_in_bio") return <LinkInBioProps props={p} onChange={onChange} />;
  if (el.type === "countdown") return <CountdownProps props={p} onChange={onChange} />;
  if (["logo", "watermark"].includes(el.type)) return <MediaProps props={p} onChange={onChange} />;
  if (["rectangle", "circle"].includes(el.type)) return <RectCircleProps props={p} onChange={onChange} />;
  if (el.type === "line") return <LineProps props={p} onChange={onChange} />;
  return null;
}

export default function ElementPropsPanel({ element, onUpdateElement, onUpdateElementProps }) {
  if (!element) {
    return (
      <div className="w-64 shrink-0 border-l border-zinc-800 bg-zinc-950 flex items-center justify-center">
        <p className="text-xs text-zinc-600 text-center px-4">Click an element<br />to edit its properties</p>
      </div>
    );
  }

  const update = (patch) => onUpdateElement(element.id, patch);

  return (
    <div className="w-64 shrink-0 border-l border-zinc-800 bg-zinc-950 overflow-y-auto p-3 flex flex-col gap-2.5">

      <SectionLabel>Position</SectionLabel>
      <Row>
        <Field label="X">
          <Input type="number" value={element.x_ratio ?? ''} step={0.01} min={0} max={1}
            onChange={v => update({ x_ratio: v })} />
        </Field>
        <Field label="Y">
          <Input type="number" value={element.y_ratio ?? ''} step={0.01} min={0} max={1}
            onChange={v => update({ y_ratio: v })} />
        </Field>
      </Row>

      <SectionLabel>Timing</SectionLabel>
      <Row>
        <Field label="Start (s)">
          <Input type="number" value={element.start_at} step={0.5} min={0}
            onChange={v => update({ start_at: v })} />
        </Field>
        <Field label="Duration">
          <Input type="number"
            value={element.duration === null || element.duration === undefined ? "" : element.duration}
            placeholder="∞" step={0.5} min={0.1}
            onChange={v => update({ duration: v === "" || isNaN(v) ? null : v })} />
        </Field>
      </Row>

      <SectionLabel>Animation</SectionLabel>
      <Row>
        <Field label="In">
          <Select value={element.animation_in} onChange={v => update({ animation_in: v })} options={ANIMS_IN} />
        </Field>
        <Field label="Out">
          <Select value={element.animation_out} onChange={v => update({ animation_out: v })} options={ANIMS_OUT} />
        </Field>
      </Row>

      <SectionLabel>Behavior</SectionLabel>
      <Toggle label="Overridable per post"
        checked={element.overridable}
        onChange={v => update({ overridable: v })} />
      {element.overridable && (
        <Field label="Override Key">
          <Input value={element.override_key || ""} onChange={v => update({ override_key: v || null })} />
        </Field>
      )}

      <SectionLabel>Style</SectionLabel>
      <TypePropsSection el={element} onPropsChange={onUpdateElementProps} />
    </div>
  );
}
