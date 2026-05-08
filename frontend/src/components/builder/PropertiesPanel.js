import { useRef, useState } from "react";
import { Trash2, Lock, Unlock, Eye, EyeOff, ArrowUpToLine, ArrowDownToLine, Upload } from "lucide-react";
import axios from "axios";
import { toast } from "sonner";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function PropertiesPanel({
  elements,
  selectedIds,
  background,
  onUpdateElement,
  onUpdateProps,
  onRemove,
  onBringToFront,
  onSendToBack,
  onBackgroundChange,
}) {
  const selectedElement = selectedIds.length === 1
    ? elements.find(e => e.id === selectedIds[0])
    : null;

  if (!selectedElement) {
    return (
      <div className="w-[280px] flex-shrink-0 bg-zinc-900 border-l border-zinc-800 overflow-y-auto scrollbar-thin">
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Background</div>
        </div>
        <div className="p-4 space-y-3">
          <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Type</label>
          <select
            value={background?.type || "solid"}
            onChange={e => onBackgroundChange({ ...background, type: e.target.value })}
            className="w-full bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
          >
            <option value="solid">Solid</option>
            <option value="gradient">Gradient</option>
            <option value="image">Image</option>
          </select>
          <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5 mt-3">Value</label>
          {background?.type === "image" ? (
            <ImageUrlField
              label=""
              value={background?.value || ""}
              onChange={v => onBackgroundChange({ ...background, value: v })}
            />
          ) : (
            <input
              type={background?.type === "solid" ? "color" : "text"}
              value={background?.value || "#000000"}
              onChange={e => onBackgroundChange({ ...background, value: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
            />
          )}
        </div>
        <div className="px-4 py-6 text-center text-zinc-600 text-xs">
          Click an element to edit its properties
        </div>
      </div>
    );
  }

  const el = selectedElement;
  const props = el.props || {};

  return (
    <div className="w-[280px] flex-shrink-0 bg-zinc-900 border-l border-zinc-800 overflow-y-auto scrollbar-thin">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{el.type}</div>
        <div className="flex items-center gap-1">
          <button onClick={() => onBringToFront(el.id)} className="p-1 text-zinc-500 hover:text-white" title="Bring to front"><ArrowUpToLine size={12} /></button>
          <button onClick={() => onSendToBack(el.id)} className="p-1 text-zinc-500 hover:text-white" title="Send to back"><ArrowDownToLine size={12} /></button>
          <button onClick={() => onUpdateElement(el.id, { locked: !el.locked })} className="p-1 text-zinc-500 hover:text-white" title={el.locked ? "Unlock" : "Lock"}>
            {el.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          <button onClick={() => onUpdateElement(el.id, { visible: !el.visible })} className="p-1 text-zinc-500 hover:text-white" title={el.visible ? "Hide" : "Show"}>
            {el.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button onClick={() => onRemove([el.id])} className="p-1 text-red-500 hover:text-red-400" title="Delete"><Trash2 size={12} /></button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        <Field label="Label" value={el.label} onChange={v => onUpdateElement(el.id, { label: v })} />

        <div className="grid grid-cols-2 gap-2">
          <NumField label="X" value={el.x} onChange={v => onUpdateElement(el.id, { x: v })} />
          <NumField label="Y" value={el.y} onChange={v => onUpdateElement(el.id, { y: v })} />
          <NumField label="W" value={el.width} onChange={v => onUpdateElement(el.id, { width: v })} />
          <NumField label="H" value={el.height} onChange={v => onUpdateElement(el.id, { height: v })} />
        </div>
        <NumField label="Rotation" value={el.rotation} onChange={v => onUpdateElement(el.id, { rotation: v })} />

        {el.type === "text" && <TextProps props={props} onChange={onUpdateProps} id={el.id} />}
        {el.type === "shape" && <ShapeProps props={props} onChange={onUpdateProps} id={el.id} />}
        {el.type === "image" && <ImageProps props={props} onChange={onUpdateProps} id={el.id} />}
        {el.type === "drive_image" && <DriveImageProps props={props} onChange={onUpdateProps} id={el.id} />}
        {el.type === "icon" && <IconProps props={props} onChange={onUpdateProps} id={el.id} />}
        {el.type === "author_block" && <AuthorBlockProps props={props} onChange={onUpdateProps} id={el.id} />}
        {el.type === "content" && <ContentProps props={props} onChange={onUpdateProps} id={el.id} />}
        {el.type === "logo" && <ImageProps props={props} onChange={onUpdateProps} id={el.id} />}
      </div>
    </div>
  );
}

function TextProps({ props, onChange, id }) {
  return (
    <>
      <div>
        <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">Content</label>
        <textarea
          value={props.content || ""}
          onChange={e => onChange(id, { content: e.target.value })}
          rows={3}
          className="w-full bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Font Size" value={props.fontSize} onChange={v => onChange(id, { fontSize: v })} />
        <Field label="Font Weight" value={props.fontWeight} onChange={v => onChange(id, { fontWeight: v })} />
      </div>
      <Field label="Font Family" value={props.fontFamily} onChange={v => onChange(id, { fontFamily: v })} />
      <ColorField label="Color" value={props.color} onChange={v => onChange(id, { color: v })} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField label="Align" value={props.textAlign} options={["left", "center", "right"]} onChange={v => onChange(id, { textAlign: v })} />
        <NumField label="Line Height" value={props.lineHeight} step={0.1} onChange={v => onChange(id, { lineHeight: v })} />
      </div>
      <NumField label="Letter Spacing" value={props.letterSpacing} step={0.5} onChange={v => onChange(id, { letterSpacing: v })} />
    </>
  );
}

function ShapeProps({ props, onChange, id }) {
  return (
    <>
      <SelectField label="Shape" value={props.shape} options={["rect", "circle", "line"]} onChange={v => onChange(id, { shape: v })} />
      <ColorField label="Fill" value={props.fill} onChange={v => onChange(id, { fill: v })} />
      <ColorField label="Stroke" value={props.stroke} onChange={v => onChange(id, { stroke: v })} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Stroke Width" value={props.strokeWidth} onChange={v => onChange(id, { strokeWidth: v })} />
        <NumField label="Radius" value={props.borderRadius} onChange={v => onChange(id, { borderRadius: v })} />
      </div>
    </>
  );
}

function ImageProps({ props, onChange, id }) {
  return (
    <>
      <ImageUrlField label="Image" value={props.src} onChange={v => onChange(id, { src: v })} />
      <SelectField label="Fit" value={props.fit} options={["cover", "contain", "fill"]} onChange={v => onChange(id, { fit: v })} />
      <NumField label="Border Radius" value={props.borderRadius} onChange={v => onChange(id, { borderRadius: v })} />
      <NumField label="Opacity" value={props.opacity} step={0.1} min={0} max={1} onChange={v => onChange(id, { opacity: v })} />
    </>
  );
}

function DriveImageProps({ props, onChange, id }) {
  return (
    <>
      <div className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-2 leading-relaxed">
        Uses the selected client's Drive folder automatically. Leave the override below empty for normal use.
      </div>
      <Field label="Folder Override (optional — leave blank to use client's folder)" value={props.folder_id} placeholder="Only set this to lock this template to a specific folder" onChange={v => onChange(id, { folder_id: v })} />
      <SelectField label="Fit" value={props.fit} options={["cover", "contain", "fill"]} onChange={v => onChange(id, { fit: v })} />
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Border Radius" value={props.borderRadius} onChange={v => onChange(id, { borderRadius: v })} />
        <NumField label="Opacity" value={props.opacity} step={0.1} min={0} max={1} onChange={v => onChange(id, { opacity: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Border Width" value={props.borderWidth} onChange={v => onChange(id, { borderWidth: v })} />
        <ColorField label="Border Color" value={props.borderColor} onChange={v => onChange(id, { borderColor: v })} />
      </div>
      <SelectField label="Blend Mode" value={props.blendMode || "normal"} options={["normal", "multiply", "screen", "overlay", "darken", "lighten", "color-burn", "color-dodge", "hard-light", "soft-light"]} onChange={v => onChange(id, { blendMode: v })} />
    </>
  );
}

function IconProps({ props, onChange, id }) {
  return (
    <>
      <Field label="Icon Character" value={props.iconName} onChange={v => onChange(id, { iconName: v })} />
      <NumField label="Size" value={props.size} onChange={v => onChange(id, { size: v })} />
      <ColorField label="Color" value={props.color} onChange={v => onChange(id, { color: v })} />
    </>
  );
}

function AuthorBlockProps({ props, onChange, id }) {
  return (
    <>
      <SelectField label="Layout" value={props.layout} options={["horizontal", "vertical"]} onChange={v => onChange(id, { layout: v })} />
      <NumField label="Font Size" value={props.fontSize} onChange={v => onChange(id, { fontSize: v })} />
      <ColorField label="Color" value={props.color} onChange={v => onChange(id, { color: v })} />
      <div className="space-y-1.5">
        <CheckField label="Show Avatar" checked={props.showAvatar} onChange={v => onChange(id, { showAvatar: v })} />
        <CheckField label="Show Name" checked={props.showName} onChange={v => onChange(id, { showName: v })} />
        <CheckField label="Show Handle" checked={props.showHandle} onChange={v => onChange(id, { showHandle: v })} />
        <CheckField label="Show Title" checked={props.showTitle} onChange={v => onChange(id, { showTitle: v })} />
      </div>
    </>
  );
}

function ContentProps({ props, onChange, id }) {
  return (
    <>
      <div className="text-[10px] font-mono text-blue-400 uppercase bg-blue-500/10 border border-blue-500/20 px-2 py-1.5">
        Auto-bound to slide content
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Font Size" value={props.fontSize} onChange={v => onChange(id, { fontSize: v })} />
        <Field label="Font Weight" value={props.fontWeight} onChange={v => onChange(id, { fontWeight: v })} />
      </div>
      <Field label="Font Family" value={props.fontFamily} onChange={v => onChange(id, { fontFamily: v })} />
      <ColorField label="Color" value={props.color} onChange={v => onChange(id, { color: v })} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField label="Align" value={props.textAlign} options={["left", "center", "right"]} onChange={v => onChange(id, { textAlign: v })} />
        <NumField label="Line Height" value={props.lineHeight} step={0.1} onChange={v => onChange(id, { lineHeight: v })} />
      </div>
      <NumField label="Para Gap" value={props.paraGap} onChange={v => onChange(id, { paraGap: v })} />
      <NumField label="Letter Spacing" value={props.letterSpacing} step={0.5} onChange={v => onChange(id, { letterSpacing: v })} />
    </>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">{label}</label>
      <input
        value={value || ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
      />
    </div>
  );
}

function NumField({ label, value, onChange, step = 1, min, max }) {
  return (
    <div>
      <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">{label}</label>
      <input
        type="number"
        value={value ?? 0}
        step={step}
        min={min}
        max={max}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
      />
    </div>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">{label}</label>
      <div className="flex gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={e => onChange(e.target.value)}
          className="w-8 h-8 bg-zinc-950 border border-zinc-700 cursor-pointer"
        />
        <input
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
        />
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">{label}</label>
      <select
        value={value || options[0]}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-500"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function CheckField({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer hover:text-white">
      <input
        type="checkbox"
        checked={checked ?? true}
        onChange={e => onChange(e.target.checked)}
        className="bg-zinc-950 border-zinc-700"
      />
      {label}
    </label>
  );
}

function ImageUrlField({ label, value, onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await axios.post(`${API}/upload`, form);
      onChange(resp.data.url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      {label && <label className="block text-[10px] font-mono text-zinc-500 uppercase mb-1.5">{label}</label>}
      <div className="flex gap-1.5">
        <input
          value={value || ""}
          onChange={e => onChange(e.target.value)}
          placeholder="https://..."
          className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="px-2 py-1.5 bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors duration-150 disabled:opacity-50"
          title="Upload image"
        >
          <Upload size={14} />
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleUpload}
        className="hidden"
      />
      {value && (
        <div className="mt-2 border border-zinc-700 overflow-hidden" style={{ maxHeight: 80 }}>
          <img src={value} alt="" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );
}
