export const FONT_PRESETS = [
  {
    id: "bold_sans",
    label: "Bold Sans",
    fontFamily: "'Arial Black', 'Helvetica Neue', sans-serif",
    fontWeight: "900",
    letterSpacing: "0.02em",
    sample: "POWERFUL",
  },
  {
    id: "elegant_serif",
    label: "Elegant Serif",
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontWeight: "400",
    letterSpacing: "0.05em",
    sample: "Sophisticated",
  },
  {
    id: "handwritten",
    label: "Handwritten",
    fontFamily: "'Caveat', 'Comic Sans MS', cursive",
    fontWeight: "600",
    letterSpacing: "0",
    sample: "Personal",
  },
  {
    id: "modern_display",
    label: "Modern Display",
    fontFamily: "'Bebas Neue', Impact, 'Arial Narrow Bold', sans-serif",
    fontWeight: "400",
    letterSpacing: "0.08em",
    sample: "MODERN",
  },
];

export const OVERLAY_PRESETS = [
  {
    id: "none",
    label: "None",
    cssStyle: {},
    description: "No overlay",
  },
  {
    id: "gradient_wash",
    label: "Gradient Wash",
    cssStyle: {
      background: "linear-gradient(to bottom, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)",
    },
    description: "Dark fade from bottom",
  },
  {
    id: "color_tint",
    label: "Color Tint",
    cssStyle: {},
    description: "Solid color wash",
    needsColor: true,
  },
  {
    id: "blur",
    label: "Blur",
    cssStyle: {
      backdropFilter: "blur(6px)",
      background: "rgba(0,0,0,0.15)",
    },
    description: "Frosted glass",
  },
  {
    id: "geometric",
    label: "Geometric",
    cssStyle: {
      backgroundImage:
        "repeating-linear-gradient(45deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 10px, transparent 10px, transparent 20px)",
    },
    description: "Diagonal stripe pattern",
  },
  {
    id: "lower_thirds",
    label: "Lower Thirds",
    cssStyle: {
      background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 40%)",
    },
    description: "Strong bottom band",
  },
];

export const CTA_BUTTON_PRESETS = [
  {
    id: "solid_white",
    label: "Solid White",
    cta_button_bg_color: "#ffffff",
    cta_button_text_color: "#000000",
    cta_button_border_radius: 4,
    cta_button_shadow: false,
  },
  {
    id: "pill_outline",
    label: "Pill Outline",
    cta_button_bg_color: "transparent",
    cta_button_text_color: "#ffffff",
    cta_button_border_radius: 999,
    cta_button_shadow: false,
    border: "2px solid rgba(255,255,255,0.8)",
  },
  {
    id: "dark_solid",
    label: "Dark Solid",
    cta_button_bg_color: "#111111",
    cta_button_text_color: "#ffffff",
    cta_button_border_radius: 6,
    cta_button_shadow: true,
  },
  {
    id: "brand_purple",
    label: "Brand",
    cta_button_bg_color: "#6366f1",
    cta_button_text_color: "#ffffff",
    cta_button_border_radius: 8,
    cta_button_shadow: false,
  },
];

export const CTA_ANIMATION_PRESETS = [
  { id: "slide_up", label: "Slide Up" },
  { id: "fade", label: "Fade" },
  { id: "pop", label: "Pop" },
  { id: "slide_in", label: "Slide In" },
];

export const MOOD_TAGS = [
  "energy", "power", "authority", "calm", "inspiring",
  "urgent", "celebratory", "mysterious", "playful",
];
