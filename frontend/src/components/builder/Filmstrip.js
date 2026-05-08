import { Layers } from "lucide-react";

const ZONE_LABELS = {
  first: "First Slide",
  middle: "Middle Slides",
  last: "Last Slide (CTA)",
};

const ZONE_ORDER = ["first", "middle", "last"];

export default function Filmstrip({ zones, activeZone, onSwitchZone, onEnableZones, canvas }) {
  if (!zones) {
    return (
      <div className="border-t border-zinc-700 bg-zinc-900 px-4 py-2 flex items-center justify-center">
        <button
          onClick={() => onEnableZones(canvas)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors duration-150"
        >
          <Layers size={14} />
          Enable 3-Zone Template (First / Middle / Last)
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-700 bg-zinc-900 px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mr-1">Zones</span>
        {ZONE_ORDER.map((zoneName) => {
          const zone = zones[zoneName];
          const isActive = activeZone === zoneName;
          const elemCount = zone?.elements?.length || 0;
          const bg = zone?.canvas?.background;
          const bgStyle = bg?.type === "solid"
            ? { backgroundColor: bg.value }
            : bg?.type === "gradient"
            ? { background: bg.value }
            : bg?.type === "image"
            ? { background: `url('${bg.value}') center/cover` }
            : { backgroundColor: "#000" };

          return (
            <button
              key={zoneName}
              onClick={() => onSwitchZone(zoneName)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs transition-all duration-150 border ${
                isActive
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500"
              }`}
            >
              <div
                className="w-6 h-8 border border-zinc-600 flex-shrink-0"
                style={bgStyle}
              />
              <div className="text-left">
                <div className="font-medium">{ZONE_LABELS[zoneName]}</div>
                <div className="text-[10px] text-zinc-500">{elemCount} elements</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
