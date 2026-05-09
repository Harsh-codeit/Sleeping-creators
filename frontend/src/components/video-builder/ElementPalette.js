import { Type, AlignVerticalJustifyEnd, Timer, MousePointerClick, Link, Image, Droplets, Square, Circle, Minus } from "lucide-react";

const PALETTE = [
  {
    group: "TEXT",
    items: [
      { type: "text_overlay", label: "Text Overlay", Icon: Type },
      { type: "lower_third", label: "Lower Third", Icon: AlignVerticalJustifyEnd },
      { type: "countdown", label: "Countdown", Icon: Timer },
    ],
  },
  {
    group: "CTA",
    items: [
      { type: "cta_button", label: "CTA Button", Icon: MousePointerClick },
      { type: "cta_text", label: "CTA Text", Icon: Type },
      { type: "link_in_bio", label: "Link in Bio", Icon: Link },
    ],
  },
  {
    group: "MEDIA",
    items: [
      { type: "logo", label: "Logo", Icon: Image },
      { type: "watermark", label: "Watermark", Icon: Droplets },
    ],
  },
  {
    group: "SHAPES",
    items: [
      { type: "rectangle", label: "Rectangle", Icon: Square },
      { type: "circle", label: "Circle", Icon: Circle },
      { type: "line", label: "Line", Icon: Minus },
    ],
  },
];

export default function ElementPalette({ onAdd }) {
  return (
    <div className="w-52 shrink-0 border-r border-zinc-800 bg-zinc-950 overflow-y-auto p-3 flex flex-col gap-4">
      <p className="text-[10px] font-semibold text-zinc-500 tracking-widest uppercase">Elements</p>
      {PALETTE.map(({ group, items }) => (
        <div key={group}>
          <p className="text-[9px] font-semibold text-zinc-600 tracking-widest uppercase mb-2">{group}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {items.map(({ type, label, Icon }) => (
              <button
                key={type}
                onClick={() => onAdd(type)}
                className="flex flex-col items-center gap-1 p-2 border border-zinc-800 bg-zinc-900 hover:border-zinc-600 hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <Icon size={18} className="text-zinc-400" />
                <span className="text-[10px] text-zinc-400 text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
