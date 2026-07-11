/**
 * SlidePreview — renders a carousel slide (or template thumbnail) from MongoDB canvas config.
 * Pure CSS, no image uploads. Used in TemplateLibrary cards, CreatePost picker, and
 * the generated slide viewer.
 *
 * Props:
 *   template      — MongoDB template doc (canvas, font_style, layout_style, niche, name, description)
 *   slide         — optional { heading, body, slide_number, isCover } — if omitted, shows template name
 *   compact       — boolean, reduced font sizes for thumbnail/picker use
 *   handle        — optional Instagram handle string (e.g. "@yourbrand")
 *   creatorName   — optional display name for social_card layout
 *   creatorAvatar — optional avatar URL for social_card layout
 */

const FONT_MAP = {
  sans:    "system-ui, -apple-system, sans-serif",
  mono:    "'Courier New', Courier, monospace",
  serif:   "Georgia, 'Times New Roman', serif",
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
  lifestyle:  "#f43f5e",
  general:    "#8b8bff",
};

const SCHEME_ACCENTS = {
  // Dark templates
  purple:        "#5B5BD6",
  dark:          "#5B5BD6",
  blue:          "#60a5fa",
  "blue-dark":   "#38bdf8",
  green:         "#34d399",
  "green-dark":  "#34d399",
  gold:          "#C9A227",
  "gold-dark":   "#fbbf24",
  pink:          "#f472b6",
  "purple-pink": "#c084fc",
  "orange-dark": "#fb923c",
  // New color schemes
  "yellow-black": "#FACC15",
  ocean:         "#38BDF8",
  rose:          "#F43F5E",
  red:           "#FCA5A5",
  newspaper:     "#374151",
  lavender:      "#7C3AED",
  forest:        "#86EFAC",
  cream:         "#8B6914",
  light:         "#374151",
};

function renderInline(text, textColor) {
  const tc = textColor || "#fff";
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i} style={{ fontWeight: 700, color: tc }}>{part}</strong> : part
  );
}

function renderMarkdown(text, bodyStyle, textColor) {
  if (!text) return null;
  const tc = textColor || "#fff";
  const lines = text.split("\n");
  const out = [];
  let bullets = [];
  const flushBullets = (key) => {
    if (!bullets.length) return;
    out.push(
      <ul key={`ul-${key}`} style={{ margin: "3px 0 3px 14px", padding: 0, listStyleType: "disc" }}>
        {bullets.map((b, j) => (
          <li key={j} style={{ marginBottom: 2 }}>{renderInline(b, tc)}</li>
        ))}
      </ul>
    );
    bullets = [];
  };
  lines.forEach((line, i) => {
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
    } else {
      flushBullets(i);
      if (line.trim()) out.push(<span key={i}>{renderInline(line, tc)}<br /></span>);
    }
  });
  flushBullets("end");
  return <div style={bodyStyle}>{out}</div>;
}

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

export default function SlidePreview({ template, slide, compact = false, handle, creatorName, creatorAvatar }) {
  const zone = getZone(template, slide);
  const bg = getBg(zone);

  // Support light-background templates via zone.textColor
  const textColor = zone.textColor || "#ffffff";
  const isLightBg = !!zone.textColor;

  const elements = zone.elements || ["heading", "body"];
  const isCentered = ["centered", "quote-driven", "social_card"].includes(template?.layout_style);
  const isBold = template?.font_style === "bold";
  const fontFamily = FONT_MAP[template?.font_style] || FONT_MAP.sans;
  const accentColor = SCHEME_ACCENTS[template?.color_scheme] || NICHE_COLORS[template?.niche] || "#5B5BD6";

  const heading = slide?.heading || (compact ? template?.name : (template?.name || ""));
  const body    = slide?.body    || (!compact ? (template?.description || "") : "");
  const num     = slide?.slide_number;

  // ── Social Card layout ──────────────────────────────────────────────────────
  if (template?.layout_style === "social_card") {
    const initials = (creatorName || handle || "C").replace("@", "").charAt(0).toUpperCase();
    const displayName = creatorName || (handle ? handle.replace("@", "") : "Your Name");
    const displayHandle = handle || "@yourhandle";
    const bodyAlpha = isLightBg ? `${textColor}CC` : "rgba(255,255,255,0.7)";

    return (
      <div style={{
        width: "100%", height: "100%",
        background: bg,
        fontFamily,
        display: "flex",
        flexDirection: "column",
        padding: compact ? "10px" : "22px 20px",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Profile header */}
        <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10, marginBottom: compact ? 8 : 14, flexShrink: 0 }}>
          <div style={{
            width: compact ? 22 : 38, height: compact ? 22 : 38,
            borderRadius: "50%",
            background: accentColor,
            overflow: "hidden",
            flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {creatorAvatar ? (
              <img src={creatorAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ color: "#fff", fontSize: compact ? 9 : 15, fontWeight: 700 }}>{initials}</span>
            )}
          </div>
          <div>
            <div style={{ fontSize: compact ? 8 : 13, fontWeight: 700, color: textColor, lineHeight: 1.2 }}>{displayName}</div>
            <div style={{ fontSize: compact ? 6 : 10, color: `${textColor}88`, lineHeight: 1.2 }}>{displayHandle}</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: `${textColor}18`, marginBottom: compact ? 6 : 12, flexShrink: 0 }} />

        {/* Content */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {heading && (
            <p style={{
              fontSize: compact ? 9 : 15,
              fontWeight: isBold ? 800 : 600,
              color: textColor,
              margin: 0,
              lineHeight: 1.4,
              wordBreak: "break-word",
              display: "-webkit-box",
              WebkitLineClamp: compact ? 3 : 6,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              marginBottom: compact ? 3 : 6,
            }}>{heading}</p>
          )}
          {body && !compact && renderMarkdown(body, {
            fontSize: 12,
            color: bodyAlpha,
            lineHeight: 1.6,
            wordBreak: "break-word",
            overflow: "hidden",
          }, textColor)}
        </div>

        {/* Engagement bar */}
        {!compact && (
          <div style={{
            display: "flex",
            gap: 16,
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${textColor}18`,
            color: `${textColor}55`,
            fontSize: 11,
            flexShrink: 0,
          }}>
            <span>♡ Like</span>
            <span>💬 Comment</span>
            <span>↗ Share</span>
          </div>
        )}
      </div>
    );
  }

  // ── Standard layout ─────────────────────────────────────────────────────────
  const bodyAlpha = isLightBg ? `${textColor}CC` : "rgba(255,255,255,0.7)";
  const dimAlpha  = isLightBg ? `${textColor}66` : "rgba(255,255,255,0.3)";

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
      color: textColor,
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
      color: bodyAlpha,
      margin: compact ? "4px 0 0" : "8px 0 0",
      lineHeight: 1.55,
      textAlign: isCentered ? "center" : "left",
      wordBreak: "break-word",
      overflow: "hidden",
      maxHeight: compact ? "2.5em" : "none",
    },
    slideNum: {
      position: "absolute",
      top: compact ? 6 : 14,
      left: compact ? 6 : 14,
      fontSize: compact ? 7 : 10,
      color: dimAlpha,
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
      color: dimAlpha,
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
      {showNum && <span style={s.slideNum}>{String(num).padStart(2, "0")}</span>}
      {showNiche && <span style={s.nicheBadge}>{template.niche}</span>}
      {showQuote && <div style={s.quoteDecor}>"</div>}
      {showStat && heading && <p style={s.statNum}>{heading.match(/\d+/) || ""}</p>}

      <div style={s.accent} />

      {elements.includes("heading") && heading && (
        <p style={s.heading}>{heading}</p>
      )}

      {elements.includes("body") && body && !compact && renderMarkdown(body, s.body, textColor)}
      {elements.includes("content") && body && !compact && renderMarkdown(body, s.body, textColor)}

      {showAuthor && (
        <span style={s.authorBlock}>{handle || "@sleepingcreators"}</span>
      )}
    </div>
  );
}
