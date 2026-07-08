/**
 * SlidePreview — renders a carousel slide (or template thumbnail) from MongoDB canvas config.
 * Pure CSS, no image uploads. Used in TemplateLibrary cards, CreatePost picker, and
 * the generated slide viewer.
 *
 * Props:
 *   template  — MongoDB template doc (canvas, font_style, layout_style, niche, name, description)
 *   slide     — optional { heading, body, slide_number, isCover } — if omitted, shows template name
 *   compact   — boolean, reduced font sizes for thumbnail/picker use
 *   handle    — optional Instagram handle string (e.g. "@yourbrand")
 */

const FONT_MAP = {
  // Legacy keys from seeded templates
  sans:    "system-ui, -apple-system, sans-serif",
  mono:    "'Courier New', Courier, monospace",
  serif:   "Georgia, 'Times New Roman', serif",
  // Active keys from TemplateBuilder
  bold:    "Georgia, 'Times New Roman', serif",
  clean:   "'Times New Roman', Times, serif",
  elegant: "'Bodoni Moda', 'Book Antiqua', Palatino, serif",
  playful: "'Dancing Script', 'Brush Script MT', cursive",
};

const NICHE_COLORS = {
  startup:    "#5B5BD6",
  education:  "#38bdf8",
  finance:    "#34d399",
  fitness:    "#fb923c",
  technology: "#60a5fa",
  marketing:  "#f472b6",
  mindset:    "#fbbf24",
  general:    "#8b8bff",
};

const SCHEME_ACCENTS = {
  purple: "#5B5BD6",
  dark:   "#5B5BD6",
  blue:   "#60a5fa",
  green:  "#34d399",
  gold:   "#fbbf24",
  pink:   "#f472b6",
};

function getBg(zone) {
  if (!zone) return "#111827";
  if (zone.bgType === "gradient" && zone.gradFrom && zone.gradTo) {
    return `linear-gradient(145deg, ${zone.gradFrom}, ${zone.gradTo})`;
  }
  return zone.bg || "#111827";
}

function getZone(template, slide) {
  const zones = template?.canvas?.zones || {};
  if (!slide) return zones.first || {};
  if (slide.isCover) return zones.first || {};
  return zones.middle || zones.first || {};
}

export default function SlidePreview({ template, slide, compact = false, handle }) {
  const zone = getZone(template, slide);
  const bg = getBg(zone);
  const elements = zone.elements || ["heading", "body"];
  const isCentered = ["centered", "quote-driven"].includes(template?.layout_style);
  const isBold = template?.font_style === "bold";
  const fontFamily = FONT_MAP[template?.font_style] || FONT_MAP.sans;
  const accentColor = SCHEME_ACCENTS[template?.color_scheme] || NICHE_COLORS[template?.niche] || "#5B5BD6";

  const heading = slide?.heading || (compact ? template?.name : (template?.name || ""));
  const body    = slide?.body    || (!compact ? (template?.description || "") : "");
  const num     = slide?.slide_number;

  const s = {
    wrap: {
      width: "100%",
      height: "100%",
      background: bg,
      fontFamily,
      display: "flex",
      flexDirection: "column",
      alignItems: isCentered ? "center" : "flex-start",
      justifyContent: "center",
      padding: compact ? "10px 10px" : "24px 22px",
      position: "relative",
      overflow: "hidden",
      boxSizing: "border-box",
    },
    accent: {
      width: compact ? 20 : 32,
      height: compact ? 2 : 3,
      background: accentColor,
      borderRadius: 99,
      marginBottom: compact ? 6 : 12,
      flexShrink: 0,
    },
    heading: {
      fontSize: compact ? 10 : 17,
      fontWeight: isBold ? 800 : 700,
      color: "#ffffff",
      margin: 0,
      lineHeight: 1.3,
      textAlign: isCentered ? "center" : "left",
      letterSpacing: template?.font_style === "mono" ? "-0.02em" : "normal",
      wordBreak: "break-word",
      display: "-webkit-box",
      WebkitLineClamp: compact ? 3 : 5,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
    },
    body: {
      fontSize: compact ? 8 : 12,
      color: "rgba(255,255,255,0.55)",
      margin: compact ? "4px 0 0" : "8px 0 0",
      lineHeight: 1.5,
      textAlign: isCentered ? "center" : "left",
      display: "-webkit-box",
      WebkitLineClamp: compact ? 2 : 4,
      WebkitBoxOrient: "vertical",
      overflow: "hidden",
      wordBreak: "break-word",
    },
    slideNum: {
      position: "absolute",
      top: compact ? 6 : 14,
      left: compact ? 6 : 14,
      fontSize: compact ? 7 : 10,
      color: "rgba(255,255,255,0.3)",
      fontWeight: 700,
      letterSpacing: "0.05em",
    },
    nicheBadge: {
      position: "absolute",
      top: compact ? 6 : 12,
      right: compact ? 6 : 12,
      background: `${accentColor}22`,
      color: accentColor,
      fontSize: compact ? 7 : 9,
      fontWeight: 700,
      padding: compact ? "2px 5px" : "3px 8px",
      borderRadius: 99,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      border: `1px solid ${accentColor}44`,
    },
    authorBlock: {
      position: "absolute",
      bottom: compact ? 6 : 14,
      left: compact ? 8 : 18,
      fontSize: compact ? 7 : 10,
      color: "rgba(255,255,255,0.3)",
      fontWeight: 500,
    },
    quoteDecor: {
      position: "absolute",
      top: compact ? -4 : 0,
      left: compact ? 6 : 14,
      fontSize: compact ? 32 : 72,
      color: `${accentColor}33`,
      fontFamily: "Georgia, serif",
      lineHeight: 1,
      userSelect: "none",
      pointerEvents: "none",
    },
    statNum: {
      fontSize: compact ? 16 : 36,
      fontWeight: 800,
      color: accentColor,
      margin: 0,
      lineHeight: 1,
      marginBottom: compact ? 4 : 8,
    },
  };

  const showNum    = elements.includes("number") && num;
  const showQuote  = elements.includes("quote");
  const showStat   = elements.includes("stat");
  const showAuthor = elements.includes("author_block");
  const showNiche  = !compact && !slide && template?.niche;

  return (
    <div style={s.wrap}>
      {/* Slide number */}
      {showNum && <span style={s.slideNum}>{String(num).padStart(2, "0")}</span>}

      {/* Niche badge — only in template preview mode */}
      {showNiche && <span style={s.nicheBadge}>{template.niche}</span>}

      {/* Quote decoration */}
      {showQuote && <div style={s.quoteDecor}>"</div>}

      {/* Stat number (shows heading as big number) */}
      {showStat && heading && <p style={s.statNum}>{heading.match(/\d+/) || ""}</p>}

      {/* Accent bar */}
      <div style={s.accent} />

      {/* Heading */}
      {elements.includes("heading") && heading && (
        <p style={s.heading}>{heading}</p>
      )}

      {/* Body */}
      {elements.includes("body") && body && !compact && (
        <p style={s.body}>{body}</p>
      )}
      {elements.includes("content") && body && !compact && (
        <p style={s.body}>{body}</p>
      )}

      {/* Author block */}
      {showAuthor && (
        <span style={s.authorBlock}>{handle || "@sleepingcreators"}</span>
      )}
    </div>
  );
}
