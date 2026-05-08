import {
  Type, Image, Square, Circle, Minus, Star, User, ImageIcon, AlignLeft,
} from "lucide-react";

const ELEMENT_GROUPS = [
  {
    label: "Text",
    items: [
      { type: "text", label: "Heading", icon: Type, defaults: { width: 820, height: 80, props: { content: "Heading", fontSize: 58, fontFamily: "Helvetica", fontWeight: "700", color: "#ffffff", textAlign: "left", lineHeight: 1.3, padding: 0 } } },
      { type: "text", label: "Subheading", icon: Type, defaults: { width: 820, height: 60, props: { content: "Subheading", fontSize: 36, fontFamily: "Helvetica", fontWeight: "600", color: "#ffffff", textAlign: "left", lineHeight: 1.4, padding: 0 } } },
      { type: "text", label: "Body", icon: Type, defaults: { width: 820, height: 200, props: { content: "Body text goes here", fontSize: 28, fontFamily: "Helvetica", fontWeight: "400", color: "#ffffff", textAlign: "left", lineHeight: 1.6, padding: 0 } } },
      { type: "text", label: "Caption", icon: Type, defaults: { width: 400, height: 40, props: { content: "Caption", fontSize: 20, fontFamily: "Helvetica", fontWeight: "400", color: "#999999", textAlign: "left", lineHeight: 1.4, padding: 0 } } },
    ],
  },
  {
    label: "Media",
    items: [
      { type: "image", label: "Image", icon: Image, defaults: { width: 400, height: 400, props: { src: "", fit: "cover", borderRadius: 0, opacity: 1 } } },
      { type: "logo", label: "Logo", icon: ImageIcon, defaults: { width: 200, height: 80, props: { src: "", fit: "contain", opacity: 1 } } },
      { type: "drive_image", label: "Drive Image", icon: Image, defaults: { width: 400, height: 400, props: { fit: "cover", opacity: 1, borderRadius: 0, borderWidth: 0, borderColor: "#ffffff", blendMode: "normal" } } },
    ],
  },
  {
    label: "Shapes",
    items: [
      { type: "shape", label: "Rectangle", icon: Square, defaults: { width: 400, height: 300, props: { shape: "rect", fill: "#333333", stroke: "none", strokeWidth: 0, borderRadius: 0 } } },
      { type: "shape", label: "Circle", icon: Circle, defaults: { width: 200, height: 200, props: { shape: "circle", fill: "#333333", stroke: "none", strokeWidth: 0, borderRadius: 0 } } },
      { type: "shape", label: "Line", icon: Minus, defaults: { width: 400, height: 4, props: { shape: "rect", fill: "#555555", stroke: "none", strokeWidth: 0, borderRadius: 0 } } },
      { type: "shape", label: "Divider", icon: Minus, defaults: { width: 820, height: 2, props: { shape: "rect", fill: "#333333", stroke: "none", strokeWidth: 0, borderRadius: 0 } } },
    ],
  },
  {
    label: "Icons",
    items: [
      { type: "icon", label: "Star", icon: Star, defaults: { width: 48, height: 48, props: { iconName: "★", size: 36, color: "#ffffff" } } },
      { type: "icon", label: "Heart", icon: Star, defaults: { width: 48, height: 48, props: { iconName: "♥", size: 36, color: "#ff4444" } } },
      { type: "icon", label: "Check", icon: Star, defaults: { width: 48, height: 48, props: { iconName: "✓", size: 36, color: "#22c55e" } } },
      { type: "icon", label: "Arrow", icon: Star, defaults: { width: 48, height: 48, props: { iconName: "→", size: 36, color: "#ffffff" } } },
    ],
  },
  {
    label: "Blocks",
    items: [
      { type: "author_block", label: "Author Block", icon: User, defaults: { width: 820, height: 120, props: { showAvatar: true, showName: true, showHandle: true, showTitle: true, layout: "horizontal", fontSize: 32, color: "#ffffff" } } },
      { type: "content", label: "Content", icon: AlignLeft, defaults: { width: 820, height: 800, props: { fontSize: 44, fontFamily: "Helvetica", fontWeight: "600", color: "#ffffff", lineHeight: 1.6, paraGap: 24, textAlign: "left" } } },
    ],
  },
];

export default function ElementsPanel({ onAddElement }) {
  return (
    <div className="w-[240px] flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col overflow-y-auto scrollbar-thin">
      <div className="px-4 py-3 border-b border-zinc-800">
        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Elements</div>
      </div>
      <div className="p-3 space-y-4">
        {ELEMENT_GROUPS.map(group => (
          <div key={group.label}>
            <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider mb-2">{group.label}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {group.items.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    onClick={() => onAddElement(item.type, { label: item.label, ...item.defaults })}
                    className="flex flex-col items-center gap-1.5 py-2.5 px-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 hover:border-zinc-600 transition-colors duration-150 text-zinc-400 hover:text-white"
                  >
                    <Icon size={16} />
                    <span className="text-[10px] font-mono">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
