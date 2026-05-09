const ALL_TAGS = [
  "energy", "power", "authority", "calm",
  "inspiring", "urgent", "celebratory", "mysterious", "playful",
];

export function MoodTagPicker({ value = [], onChange }) {
  const toggle = (tag) => {
    if (value.includes(tag)) {
      onChange(value.filter((t) => t !== tag));
    } else {
      onChange([...value, tag]);
    }
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_TAGS.map((tag) => {
        const active = value.includes(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={`px-2.5 py-1 text-[10px] font-mono border transition-colors ${
              active
                ? "bg-white text-black border-white"
                : "text-zinc-500 border-zinc-700 hover:text-white hover:border-zinc-500"
            }`}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
