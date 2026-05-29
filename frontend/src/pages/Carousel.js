import { useState, useEffect, useRef, useCallback } from "react";
import JSZip from "jszip";
import axios from "axios";
import { toast } from "sonner";
import {
  Wand2, Plus, Trash2, Save, Check, LayoutGrid,
  ImageDown, Download, ExternalLink, ChevronDown,
  Sparkles, X, PenLine, Copy, Send
} from "lucide-react";
import ImageElementOverlay from "../components/ImageElementOverlay";
import { VideoCreator } from "../components/VideoCreator";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const PLATFORMS = ["instagram", "facebook", "linkedin", "twitter", "threads"];
const CHAR_LIMIT_DEFAULT = 280;
const FORMAT_OPTIONS = [
  { value: "auto", label: "Auto (AI picks)" },
  { value: "tips", label: "Tips / Insights" },
  { value: "story", label: "Storytelling Arc" },
  { value: "myth_bust", label: "Myth-Busting" },
  { value: "case_study", label: "Case Study" },
  { value: "step_by_step", label: "Step-by-Step" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function VerifiedBadge({ size = 16 }) {
  return (
    <span style={{ width: size, height: size, background: "#3b82f6", borderRadius: "50%",
      display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 11 11" fill="none">
        <path d="M2 5.5L4.5 8L9 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Avatar({ url, initials, size, bg = "#333", fg = "#fff" }) {
  return url ? (
    <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
  ) : (
    <div style={{ width: size, height: size, borderRadius: "50%", background: bg, flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, color: fg }}>{initials}</div>
  );
}

function getInitials(name) {
  return (name || "AU").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

function cleanContent(text) {
  return (text || "")
    .replace(/^\[CAROUSEL\]\s*/i, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1")
    .replace(/_{1,2}([^_\n]+)_{1,2}/g, "$1")
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*–\s*/g, "-")
    .replace(/^[•●◦▪▸►→✔✘★☆➤]\s*/gm, "- ")
    .replace(/…/g, "...")
    .trim();
}

function quoteFontSize(text, scale) {
  const n = text.length;
  let base;
  if (n < 60)       base = 31;
  else if (n < 100) base = 27;
  else if (n < 160) base = 23;
  else if (n < 240) base = 19;
  else if (n < 360) base = 16;
  else if (n < 500) base = 13.5;
  else              base = 11.5;
  return Math.round(base * scale);
}

// ─── Slide Card ──────────────────────────────────────────────────────────────

function getSlideContent(slide) {
  if (slide?.type) {
    const parts = [slide.title, slide.subtitle, slide.highlight, slide.body].filter(Boolean);
    return parts.join("\n");
  }
  if (slide?.content) return slide.content;
  const parts = [];
  if (slide?.heading) parts.push(slide.heading);
  if (slide?.body) parts.push(slide.body);
  return parts.join("\n");
}

function SlideCard({ slide, config, scale, theme }) {
  const raw        = getSlideContent(slide);
  const content    = cleanContent(raw);
  const paragraphs = content.split("\n").filter(Boolean).slice(0, 4);
  const initials   = getInitials(config.authorName);
  const handle     = config.authorHandle
    ? (config.authorHandle.startsWith("@") ? config.authorHandle : `@${config.authorHandle}`)
    : "@handle";
  const s          = n => Math.round(n * scale);
  const contentFs  = quoteFontSize(content, scale);
  const pGap       = Math.max(Math.round(contentFs * 0.48), s(11));
  const handleLine = [handle, config.authorTitle].filter(Boolean).join(" · ");

  const themes = {
    dark:  { outerBg: "#000000", cardBg: "#0f0f0f", cardBdr: "#222222", cardShd: "none",
             text: "#f0f0f0", handle: "#6b7280", footer: "#333333", avBg: "#333333", avFg: "#ffffff" },
    white: { outerBg: "#ffffff", cardBg: "#ffffff", cardBdr: "#e5e7eb", cardShd: "none",
             text: "#0f1419", handle: "#536471", footer: "#9ca3af", avBg: "#e8e8e8", avFg: "#555555" },
    cream: { outerBg: "#FDF6EC", cardBg: "#ffffff", cardBdr: "#E8D5BC",
             cardShd: `0 ${s(12)}px ${s(40)}px rgba(0,0,0,0.08)`,
             text: "#1a1a1a", handle: "#8B6914", footer: "#B08A4A", avBg: "#F0E6D3", avFg: "#8B6914" },
  };
  const t = themes[theme] || themes.dark;

  return (
    <div style={{ width: "100%", height: "100%", background: t.outerBg,
      display: "flex", padding: s(28), boxSizing: "border-box",
      fontFamily: "'Helvetica', 'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ flex: 1, background: t.cardBg, border: `1px solid ${t.cardBdr}`,
        borderRadius: s(14), padding: `${s(40)}px ${s(44)}px`,
        boxShadow: t.cardShd, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: s(14),
          flexShrink: 0, marginBottom: s(30) }}>
          <Avatar url={config.profilePhotoUrl} initials={initials} size={s(46)} bg={t.avBg} fg={t.avFg} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: s(7), marginBottom: s(5) }}>
              <span style={{ fontSize: s(19), fontWeight: 700, color: t.text, letterSpacing: "-0.4px", lineHeight: 1.2 }}>
                {config.authorName || "Author Name"}
              </span>
              <VerifiedBadge size={s(17)} />
            </div>
            <span style={{ fontSize: s(13), color: t.handle, fontFamily: "'Helvetica', 'Helvetica Neue', Arial, sans-serif", fontWeight: 400 }}>
              {handleLine || "@handle"}
            </span>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column",
          justifyContent: "center", overflow: "hidden", minHeight: 0 }}>
          <div style={{ fontSize: contentFs, fontWeight: 400, lineHeight: 1.55,
            color: t.text, letterSpacing: "-0.2px", overflow: "hidden" }}>
            {paragraphs.length > 0 ? paragraphs.map((p, i) => (
              <p key={i} style={{ margin: 0, marginTop: i > 0 ? pGap : 0,
                fontWeight: (i === paragraphs.length - 1 && paragraphs.length > 1) ? 800 : 400 }}>{p}</p>
            )) : (
              <p style={{ color: "#555" }}>Your content here...</p>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0, marginTop: s(26),
          fontSize: s(13), color: t.footer, fontFamily: "'Helvetica', 'Helvetica Neue', Arial, sans-serif" }}>
          {handle} · Follow for more
        </div>
      </div>
    </div>
  );
}

function templateToTheme(template) {
  if (template === "full_white") return "white";
  if (template === "floating_card") return "cream";
  return "dark";
}

// Type → accent color mapping for badges and callout borders
const TYPE_COLORS = {
  hook: "#f59e0b", cta: "#10b981", problem: "#ef4444",
  psychology: "#a855f7", result: "#06b6d4", loop: "#f97316",
  scene: "#ec4899", tension: "#ef4444", turning_point: "#8b5cf6",
  insight: "#6366f1", myth: "#f97316", truth: "#22c55e",
  process: "#3b82f6", step: "#6366f1", tip: "#3b82f6",
  solution: "#06b6d4", offer: "#10b981",
};

function TypedSlideBlock({ slide, config, scale, theme }) {
  const s   = n => Math.round(n * scale);
  const themes = {
    dark:  { outerBg: "#000000", cardBg: "#0f0f0f", cardBdr: "#222222", cardShd: "none",
             text: "#f0f0f0", handle: "#6b7280", footer: "#333333", avBg: "#333333", avFg: "#ffffff" },
    white: { outerBg: "#ffffff", cardBg: "#ffffff", cardBdr: "#e5e7eb", cardShd: "none",
             text: "#0f1419", handle: "#536471", footer: "#9ca3af", avBg: "#e8e8e8", avFg: "#555555" },
    cream: { outerBg: "#FDF6EC", cardBg: "#ffffff", cardBdr: "#E8D5BC",
             cardShd: `0 ${s(12)}px ${s(40)}px rgba(0,0,0,0.08)`,
             text: "#1a1a1a", handle: "#8B6914", footer: "#B08A4A", avBg: "#F0E6D3", avFg: "#8B6914" },
  };
  const t       = themes[theme] || themes.dark;
  const initials = getInitials(config.authorName);
  const handle  = config.authorHandle
    ? (config.authorHandle.startsWith("@") ? config.authorHandle : `@${config.authorHandle}`)
    : "@handle";
  const handleLine = [handle, config.authorTitle].filter(Boolean).join(" · ");

  const type      = (slide.type || "insight").toLowerCase();
  const title     = cleanContent(slide.title     || "");
  const subtitle  = cleanContent(slide.subtitle  || "");
  const highlight = cleanContent(slide.highlight || "");
  const bodyRaw   = cleanContent(slide.body      || "");
  const bodyParagraphs = bodyRaw.split("\n").filter(Boolean).slice(0, 4);

  const accent   = TYPE_COLORS[type] || "#6b7280";
  const titleFs  = title.length < 45 ? s(32) : title.length < 90 ? s(24) : s(19);
  const bodyFs   = s(16);

  return (
    <div style={{ width: "100%", height: "100%", background: t.outerBg,
      display: "flex", padding: s(28), boxSizing: "border-box",
      fontFamily: "'Helvetica', 'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ flex: 1, background: t.cardBg, border: `1px solid ${t.cardBdr}`,
        borderRadius: s(14), padding: `${s(36)}px ${s(40)}px`,
        boxShadow: t.cardShd, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Profile header */}
        <div style={{ display: "flex", alignItems: "center", gap: s(12),
          flexShrink: 0, marginBottom: s(22) }}>
          <Avatar url={config.profilePhotoUrl} initials={initials} size={s(42)} bg={t.avBg} fg={t.avFg} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: s(6), marginBottom: s(4) }}>
              <span style={{ fontSize: s(17), fontWeight: 700, color: t.text,
                letterSpacing: "-0.3px", lineHeight: 1.2 }}>
                {config.authorName || "Author Name"}
              </span>
              <VerifiedBadge size={s(15)} />
            </div>
            <span style={{ fontSize: s(12), color: t.handle }}>{handleLine || "@handle"}</span>
          </div>
          {/* Type badge */}
          <span style={{ fontSize: s(8), fontWeight: 800, letterSpacing: "0.1em",
            background: accent, color: "#fff", borderRadius: s(3),
            padding: `${s(3)}px ${s(8)}px`, textTransform: "uppercase", flexShrink: 0 }}>
            {type}
          </span>
        </div>

        {/* Content area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column",
          justifyContent: "center", minHeight: 0, overflow: "hidden" }}>

          {/* Title */}
          {title ? (
            <div style={{ fontSize: titleFs, fontWeight: 800, lineHeight: 1.15,
              color: t.text, letterSpacing: "-0.5px",
              marginBottom: (subtitle || highlight || bodyParagraphs.length) ? s(14) : 0 }}>
              {title}
            </div>
          ) : (
            <div style={{ fontSize: s(20), color: "#444" }}>Add title...</div>
          )}

          {/* Subtitle (hook type) */}
          {subtitle && (
            <div style={{ fontSize: s(17), fontWeight: 400, color: t.handle,
              lineHeight: 1.4, marginBottom: bodyParagraphs.length ? s(14) : 0 }}>
              {subtitle}
            </div>
          )}

          {/* Highlight callout (solution type) */}
          {highlight && (
            <div style={{ fontSize: s(15), fontWeight: 700, color: accent,
              background: `${accent}18`,
              borderLeft: `${s(3)}px solid ${accent}`,
              padding: `${s(9)}px ${s(13)}px`,
              marginBottom: bodyParagraphs.length ? s(12) : 0,
              lineHeight: 1.3 }}>
              {highlight}
            </div>
          )}

          {/* Body paragraphs */}
          {bodyParagraphs.map((p, i) => (
            <p key={i} style={{ fontSize: bodyFs, fontWeight: 400, lineHeight: 1.6,
              color: t.text, margin: 0, marginTop: i > 0 ? s(10) : 0 }}>
              {p}
            </p>
          ))}
        </div>

        {/* Footer */}
        <div style={{ flexShrink: 0, marginTop: s(22),
          fontSize: s(12), color: t.footer,
          fontFamily: "'Helvetica', 'Helvetica Neue', Arial, sans-serif" }}>
          {handle} · Follow for more
        </div>
      </div>
    </div>
  );
}

function DarkCardSlide({ slide, config, scale = 1 }) {
  return <SlideCard slide={slide} config={config} scale={scale} theme="dark" />;
}
function FullWhiteSlide({ slide, config, scale = 1 }) {
  return <SlideCard slide={slide} config={config} scale={scale} theme="white" />;
}
function FloatingCardSlide({ slide, config, scale = 1 }) {
  return <SlideCard slide={slide} config={config} scale={scale} theme="cream" />;
}

const TEMPLATE_LABELS = { dark_card: "Dark Card", full_white: "Quote White", floating_card: "Floating Card" };

// ─── Option Pill ─────────────────────────────────────────────────────────────

function OptionPill({ label, value, active, options, onChange, searchable }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch(""); } };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchable && searchRef.current) searchRef.current.focus();
  }, [open, searchable]);

  const filtered = searchable && search
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono border transition-colors duration-150
          ${active ? "border-zinc-500 text-white bg-zinc-800" : "border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"}`}
      >
        <span className="max-w-[100px] truncate">{value || label}</span>
        <ChevronDown size={9} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1 bg-zinc-900 border border-zinc-700 shadow-lg z-50 min-w-[180px] max-h-56 flex flex-col">
          {searchable && (
            <div className="p-1.5 border-b border-zinc-800 flex-shrink-0">
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                className="w-full bg-zinc-950 border border-zinc-700 px-2 py-1 text-[11px] font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          )}
          <div className="overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-[11px] font-mono text-zinc-600">No results</div>
            ) : filtered.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors duration-100
                  ${opt.value === value ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Carousel Page ──────────────────────────────────────────────────────

export default function Carousel() {
  const [studioTab, setStudioTab] = useState("carousel"); // "carousel" | "video"
  const [template, setTemplate] = useState("dark_card");
  const [clients, setClients] = useState([]);
  const [savedCarousels, setSavedCarousels] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [config, setConfig] = useState({
    authorName: "", authorHandle: "", authorTitle: "", profilePhotoUrl: "",
    topic: "", slideCount: 5, platform: "instagram"
  });
  const [slideFormat, setSlideFormat] = useState("auto");
  const [slides, setSlides] = useState([]);
  const [editingSlideIdx, setEditingSlideIdx] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [carouselTitle, setCarouselTitle] = useState("");
  const [savedCarouselId, setSavedCarouselId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportedImages, setExportedImages] = useState([]);
  const [charLimit, setCharLimit] = useState(CHAR_LIMIT_DEFAULT);
  const [promptText, setPromptText] = useState("");
  const [showSaved, setShowSaved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const publishingRef = useRef(false);
  const elementImageInputRef = useRef(null);
  const [elementUploading, setElementUploading] = useState(false);
  const authorPhotoInputRef = useRef(null);
  const [authorPhotoUploading, setAuthorPhotoUploading] = useState(false);
  const [postType, setPostType] = useState("carousel"); // "carousel" | "single_image"
  const [availableTemplates, setAvailableTemplates] = useState([]);
  // Design context returned by generate endpoint (palette_name, visual_style, etc.)
  const [designContext, setDesignContext] = useState(null);
  // Preview image state: { [slideIndex]: { url, content_hash } }
  const [slidePreviews, setSlidePreviews] = useState({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimerRef = useRef(null);
  const previewAbortRef = useRef(null);
  const slidePreviewsRef = useRef(slidePreviews);
  slidePreviewsRef.current = slidePreviews;

  // Generate image previews for slides, only re-rendering changed ones
  const generatePreviews = useCallback(async (currentSlides, currentTemplate, currentConfig, currentDesignCtx) => {
    if (!currentSlides || currentSlides.length === 0) return;

    // Cancel any in-flight preview request
    if (previewAbortRef.current) previewAbortRef.current.abort();
    const abortController = new AbortController();
    previewAbortRef.current = abortController;

    const currentPreviews = slidePreviewsRef.current;
    // Build slides payload with previous hashes for cache detection
    const slidesPayload = currentSlides.map((s, i) => ({
      slide_number: s.slide_number || i + 1,
      content: s.content || "",
      heading: s.heading || "",
      body: s.body || "",
      callout: s.callout || null,
      elements: s.elements || [],
      _prev_hash: currentPreviews[i]?.content_hash || null,
      _prev_url: currentPreviews[i]?.url || null,
    }));

    setPreviewLoading(true);
    try {
      const resp = await axios.post(`${API}/carousel/preview-slides`, {
        template: currentTemplate,
        slides: slidesPayload,
        author_name: currentConfig.authorName || "",
        author_handle: currentConfig.authorHandle || "",
        author_title: currentConfig.authorTitle || "",
        profile_photo_url: currentConfig.profilePhotoUrl || "",
        design_context: currentDesignCtx || null,
        client_id: currentConfig.clientId || null,
        drive_image_index: currentConfig.driveImageIndex ?? null,
      }, { signal: abortController.signal });
      const previews = resp.data.previews || [];
      setSlidePreviews(prev => {
        const next = { ...prev };
        previews.forEach(p => {
          if (p) next[p.index] = { url: p.url, content_hash: p.content_hash };
        });
        return next;
      });
    } catch (e) {
      if (axios.isCancel(e)) return; // Cancelled by newer request, ignore
      console.error("Preview generation failed:", e);
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // Debounced preview trigger — waits 1.2s after last change
  const requestPreviews = useCallback((currentSlides, currentTemplate, currentConfig, currentDesignCtx) => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      generatePreviews(currentSlides, currentTemplate, currentConfig, currentDesignCtx);
    }, 1200);
  }, [generatePreviews]);

  // Trigger preview generation when slides, template, config, or design context change
  useEffect(() => {
    if (slides.length > 0) {
      requestPreviews(slides, template, config, designContext);
    } else {
      setSlidePreviews({});
    }
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current); };
  }, [slides, template, config.authorName, config.authorHandle, config.authorTitle, config.profilePhotoUrl, config.clientId, config.driveImageIndex, designContext, requestPreviews]);

  useEffect(() => {
    axios.get(`${API}/clients`).then(r => setClients(r.data)).catch(() => {});
    loadSavedCarousels();
    axios.get(`${API}/templates`).then(r => {
      const builtIn = [
        { value: "dark_card", label: "Dark Card" },
        { value: "full_white", label: "Quote White" },
        { value: "floating_card", label: "Floating Card" },
      ];
      const builtInIds = new Set(builtIn.map(t => t.value));
      // Include all DB templates (starters + custom), skip the 3 hardcoded built-ins
      // that already live in the renderer (they have no DB id matching their slug)
      const dbTpls = r.data
        .filter(t => !builtInIds.has(t.id))
        .map(t => ({ value: t.id, label: t.name }));
      setAvailableTemplates([...builtIn, ...dbTpls]);
    }).catch(() => {
      setAvailableTemplates([
        { value: "dark_card", label: "Dark Card" },
        { value: "full_white", label: "Quote White" },
        { value: "floating_card", label: "Floating Card" },
      ]);
    });
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    const c = clients.find(x => x.id === selectedClientId);
    if (c) {
      setConfig(prev => ({
        ...prev,
        clientId: selectedClientId,
        driveImageIndex: null,
        authorName: c.carousel_author_name || c.name,
        authorHandle: c.carousel_author_handle || (c.instagram_username ? `@${c.instagram_username}` : `@${c.name.toLowerCase().replace(/\s+/g, "")}`),
        authorTitle: c.carousel_author_title || c.industry || "",
        profilePhotoUrl: c.profile_photo_url || c.onboarding_data?.profile_photo_link || "",
      }));
    }
  }, [selectedClientId, clients]);

  const loadSavedCarousels = async () => {
    try { setSavedCarousels((await axios.get(`${API}/carousels`)).data); } catch {}
  };

  const generateAI = async (topicOverride) => {
    const topic = topicOverride || promptText || config.topic;
    if (!selectedClientId) return toast.error("Select a client first");
    setGenerating(true);
    setPromptText("");
    try {
      const resp = await axios.post(`${API}/carousel/generate`, {
        client_id: selectedClientId, platform: config.platform, template,
        topic: topic || undefined, slide_count: postType === "single_image" ? 1 : config.slideCount,
        slide_format: slideFormat === "auto" ? undefined : slideFormat,
      });
      const data = resp.data;
      setCarouselTitle(data.title || "");
      if (data.design_context) setDesignContext(data.design_context);
      setSlides((data.slides || []).map((s, i) => ({ id: Date.now() + i, ...s })));
      setConfig(prev => ({
        ...prev,
        authorName: data.author_name || prev.authorName,
        authorHandle: data.author_handle || prev.authorHandle,
        authorTitle: data.author_title || prev.authorTitle,
        driveImageIndex: data.drive_image_index ?? null,
      }));
      setEditingSlideIdx(0);
      setSavedCarouselId(null);
      setExportedImages([]);
      setSlidePreviews({});
      toast.success(`Generated ${data.slides?.length || 0} slides!`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "AI generation failed — check your API key");
    } finally {
      setGenerating(false);
    }
  };

  const addSlide = () => {
    const newSlide = { id: Date.now(), slide_number: slides.length + 1, content: "", elements: [] };
    setSlides(prev => [...prev, newSlide]);
    setEditingSlideIdx(slides.length);
  };

  const addTypedSlide = (type = "insight") => {
    const newSlide = {
      id: Date.now(),
      slide_number: slides.length + 1,
      type,
      title: "",
      body: "",
      elements: [],
    };
    setSlides(prev => [...prev, newSlide]);
    setEditingSlideIdx(slides.length);
  };

  const removeSlide = (idx) => {
    if (slides.length <= 1) return toast.error("Keep at least one slide");
    setSlides(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, slide_number: i + 1 })));
    // Shift preview indices down after removal
    setSlidePreviews(prev => {
      const next = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = parseInt(k);
        if (i < idx) next[i] = v;
        else if (i > idx) next[i - 1] = v;
        // skip the removed index
      });
      return next;
    });
    if (editingSlideIdx === idx) setEditingSlideIdx(Math.max(0, idx - 1));
    else if (editingSlideIdx > idx) setEditingSlideIdx(prev => prev - 1);
  };

  const updateSlide = (idx, content) => {
    setSlides(prev => prev.map((s, i) => i === idx ? { ...s, content } : s));
  };

  const updateSlideField = (idx, field, value) => {
    setSlides(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const slideContainerRefs = useRef({});

  const addImageElement = (slideIdx) => {
    const el = {
      id: `img-${Date.now()}`,
      type: "image",
      drive_source: true,
      x: 0.25, y: 0.25,
      width: 0.5, height: 0.4,
      rotation: 0, opacity: 1,
    };
    setSlides(prev => prev.map((s, i) =>
      i === slideIdx ? { ...s, elements: [...(s.elements || []), el] } : s
    ));
  };

  const handleAuthorPhotoUpload = async (file) => {
    if (!file) return;
    setAuthorPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await axios.post(`${API}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setConfig(p => ({ ...p, profilePhotoUrl: data.url }));
      toast.success("Author photo updated");
    } catch {
      toast.error("Upload failed");
    } finally {
      setAuthorPhotoUploading(false);
      if (authorPhotoInputRef.current) authorPhotoInputRef.current.value = "";
    }
  };

  const handleElementImageUpload = async (file, slideIdx) => {
    if (!file) return;
    setElementUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await axios.post(`${API}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const el = {
        id: `img-${Date.now()}`,
        type: "image",
        drive_source: false,
        url: data.url,
        x: 0.25, y: 0.25,
        width: 0.5, height: 0.4,
        rotation: 0, opacity: 1,
      };
      setSlides(prev => prev.map((s, i) =>
        i === slideIdx ? { ...s, elements: [...(s.elements || []), el] } : s
      ));
      toast.success("Image added");
    } catch {
      toast.error("Upload failed");
    } finally {
      setElementUploading(false);
      if (elementImageInputRef.current) elementImageInputRef.current.value = "";
    }
  };

  const updateImageElement = useCallback((slideIdx, elementId, updates) => {
    setSlides(prev => prev.map((s, i) =>
      i === slideIdx
        ? { ...s, elements: (s.elements || []).map(el => el.id === elementId ? { ...el, ...updates } : el) }
        : s
    ));
  }, []);

  const deleteImageElement = useCallback((slideIdx, elementId) => {
    setSlides(prev => prev.map((s, i) =>
      i === slideIdx
        ? { ...s, elements: (s.elements || []).filter(el => el.id !== elementId) }
        : s
    ));
  }, []);

  const saveCarousel = async () => {
    if (!selectedClientId || slides.length === 0) return toast.error("Select client and add slides first");
    setSaving(true);
    try {
      const resp = await axios.post(`${API}/carousels`, {
        client_id: selectedClientId, platform: config.platform, template,
        post_type: postType,
        title: carouselTitle || `Carousel - ${new Date().toLocaleDateString()}`,
        author_name: config.authorName, author_handle: config.authorHandle,
        author_title: config.authorTitle, profile_photo_url: config.profilePhotoUrl || "",
        slides: slides.map(s => ({
          slide_number: s.slide_number,
          type:      s.type      || null,
          title:     s.title     || "",
          subtitle:  s.subtitle  || "",
          highlight: s.highlight || "",
          content:   s.content   || "",
          heading:   s.heading   || "",
          body:      s.body      || "",
          callout:   s.callout   || null,
          visual:    s.visual    || null,
          elements:  s.elements  || [],
        })),
        design_context: designContext || null,
        drive_image_index: config.driveImageIndex ?? null,
        slide_previews: Object.entries(slidePreviews).map(([idx, p]) => ({
          index: parseInt(idx), url: p.url, content_hash: p.content_hash
        }))
      });
      setSavedCarouselId(resp.data.id);
      setExportedImages([]);
      toast.success("Carousel saved!");
      loadSavedCarousels();
    } catch { toast.error("Failed to save"); }
    finally { setSaving(false); }
  };

  const exportCarousel = async (carouselId) => {
    const id = carouselId || savedCarouselId;
    if (!id) return toast.error("Save the carousel first");
    setExporting(true);
    setExportedImages([]);
    try {
      const resp = await axios.post(`${API}/carousels/${id}/export`);
      setExportedImages(resp.data.images || []);
      setSavedCarouselId(id);
      toast.success(`${resp.data.count} slides exported!`);
      loadSavedCarousels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Export failed");
    } finally { setExporting(false); }
  };

  const downloadImage = async (url, filename) => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { toast.error("Download failed"); }
  };

  const downloadAll = async () => {
    let images = exportedImages;
    // Auto-export if no images ready yet
    if (!images.length) {
      if (!savedCarouselId) return toast.error("Save the carousel first");
      const toastId = toast.loading("Exporting slides...");
      try {
        const resp = await axios.post(`${API}/carousels/${savedCarouselId}/export`);
        images = resp.data.images || [];
        setExportedImages(images);
        toast.dismiss(toastId);
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Export failed", { id: toastId });
        return;
      }
    }
    if (!images.length) return toast.error("No slides to download");
    const toastId = toast.loading(`Zipping ${images.length} slides...`);
    try {
      const zip = new JSZip();
      await Promise.all(images.map(async (url, i) => {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Slide ${i + 1}: ${resp.status} ${resp.statusText}`);
        const blob = await resp.blob();
        const ext = url.endsWith(".jpg") || url.endsWith(".jpeg") ? "jpg" : "png";
        zip.file(`slide_${i + 1}.${ext}`, blob);
      }));
      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = "carousel_slides.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast.success(`Downloaded ${images.length} slides!`, { id: toastId });
    } catch (err) {
      toast.error(`Download failed: ${err.message || "unknown error"}`, { id: toastId });
    }
  };

  const publishCarousel = async () => {
    if (!savedCarouselId) return toast.error("Save the carousel first");
    if (publishingRef.current) return;
    publishingRef.current = true;
    setPublishing(true);
    try {
      // Ensure slides are exported first so we publish the already-rendered
      // preview images rather than triggering a fresh re-render on the backend.
      if (exportedImages.length === 0) {
        const exportResp = await axios.post(`${API}/carousels/${savedCarouselId}/export`);
        setExportedImages(exportResp.data.images || []);
      }
      const resp = await axios.post(`${API}/carousels/${savedCarouselId}/publish`);

      if (resp.data.status === "retrying_local") {
        toast.info("Retrying with local storage...", { duration: 20000 });
        try {
          const resp2 = await axios.post(
            `${API}/carousels/${savedCarouselId}/publish?local_fallback=true`, {}, { timeout: 120000 }
          );
          if (resp2.data.status === "published") {
            toast.success("Carousel published successfully!");
          } else if (resp2.data.status === "retrying_local") {
            toast.error("Publishing service unavailable. Please try again later.");
          } else {
            toast.error(resp2.data.error || resp2.data.error_message || "Publishing failed");
          }
        } catch (e2) {
          toast.error(e2.response?.data?.detail || "Local fallback publish failed");
        }
        loadSavedCarousels();
        return;
      }

      if (resp.data.status === "published") {
        toast.success("Carousel published successfully!");
      } else {
        toast.error(resp.data.error || "Publishing failed");
      }
      loadSavedCarousels();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Publishing failed");
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  };

  const deleteSaved = async (id) => {
    try {
      await axios.delete(`${API}/carousels/${id}`);
      setSavedCarousels(prev => prev.filter(c => c.id !== id));
      toast.success("Deleted");
    } catch { toast.error("Failed to delete"); }
  };

  const loadCarousel = (carousel) => {
    setSelectedClientId(carousel.client_id || "");
    setTemplate(carousel.template || "dark_card");
    setCarouselTitle(carousel.title || "");
    // Prefer the client's saved carousel_author_* fields over the carousel's own
    // stored author data — so changes in the Carousel Author Block always apply.
    const c = clients.find(x => x.id === carousel.client_id) || {};
    setConfig(prev => ({
      ...prev,
      clientId: carousel.client_id || "",
      driveImageIndex: carousel.drive_image_index ?? null,
      authorName: c.carousel_author_name || carousel.author_name || c.name || "",
      authorHandle: c.carousel_author_handle || carousel.author_handle || "",
      authorTitle: c.carousel_author_title || carousel.author_title || "",
      profilePhotoUrl: c.profile_photo_url || c.onboarding_data?.profile_photo_link || prev.profilePhotoUrl || "",
      platform: carousel.platform || "instagram"
    }));
    setSlides((carousel.slides || []).map((s, i) => ({ id: Date.now() + i, ...s, elements: s.elements || [] })));
    setEditingSlideIdx(0);
    setShowSaved(false);
    setSavedCarouselId(carousel.id);
    setExportedImages(carousel.exported_images || []);
    setPostType(carousel.post_type || "carousel");
    // Restore saved preview URLs so slides render instantly without re-fetching
    const restored = {};
    (carousel.slide_previews || []).forEach(p => {
      restored[p.index] = { url: p.url, content_hash: p.content_hash };
    });
    setSlidePreviews(restored);
    toast.success("Carousel loaded");
  };

  const handlePromptSubmit = (e) => {
    e.preventDefault();
    generateAI(promptText.trim() || "");
  };

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const isSingleImageMode = postType === "single_image";
  const clientHashtags   = selectedClient?.strategy?.hashtags ?? [];
  const hashtagOverLimit = isSingleImageMode && clientHashtags.length > 30;
  const editingSlide = editingSlideIdx !== null ? slides[editingSlideIdx] : null;

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="carousel-page">

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Content Studio</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab toggle */}
          <div className="flex items-center border border-zinc-800">
            {[["carousel", "Carousels"], ["video", "Videos"]].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setStudioTab(val)}
                className={`px-4 py-2 text-xs font-mono uppercase border-r border-zinc-800 last:border-0 transition-colors duration-150 ${studioTab === val ? "bg-white text-black font-semibold" : "text-zinc-500 hover:text-white hover:bg-zinc-800"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setShowSaved(s => !s); loadSavedCarousels(); }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-mono border transition-colors duration-150
              ${showSaved ? "bg-white text-black border-white" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
          >
            <LayoutGrid size={12} />
            Saved ({savedCarousels.length})
          </button>
          {slides.length > 0 && (
            <>
              <button onClick={saveCarousel} disabled={saving || !selectedClientId}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors duration-150 disabled:opacity-40">
                <Save size={12} /> {saving ? "Saving..." : "Save"}
              </button>
              <button onClick={() => exportCarousel(savedCarouselId)} disabled={exporting || !savedCarouselId}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono bg-white text-black font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-40">
                <ImageDown size={12} /> {exporting ? "Exporting..." : "Export PNG"}
              </button>
              <button onClick={publishCarousel} disabled={publishing || !savedCarouselId}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-colors duration-150 disabled:opacity-40">
                <Send size={12} /> {publishing ? "Publishing..." : "Post Now"}
              </button>
            </>
          )}
          {savedCarouselId && (
            <button onClick={downloadAll}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-mono border border-emerald-700 text-emerald-400 hover:bg-emerald-900/30 transition-colors duration-150">
              <Download size={12} /> Download All
            </button>
          )}
        </div>
        {hashtagOverLimit && (
          <div className="text-xs text-amber-600 mt-2 px-1">
            {clientHashtags.length} hashtags — only the first 30 will be used for this single image post.
          </div>
        )}
      </div>


      {studioTab === "carousel" && (
        <>

      {/* ─── Saved Panel ─────────────────────────────────────────────── */}
      {showSaved && (
        <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900 flex-shrink-0">
          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-3">Saved Carousels</div>
          {savedCarousels.length === 0 ? (
            <div className="text-xs text-zinc-600 font-mono">No saved carousels yet.</div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
              {savedCarousels.map(c => (
                <div key={c.id} className="flex-shrink-0 bg-zinc-950 border border-zinc-800 p-3 w-48 hover:border-zinc-600 transition-colors duration-150">
                  <div className="text-xs font-semibold text-white mb-1 truncate">{c.title || "Untitled"}</div>
                  <div className="text-[10px] font-mono text-zinc-500 mb-2">{c.client_name} · {c.slide_count} slides</div>
                  <div className="flex gap-2">
                    <button onClick={() => loadCarousel(c)} className="flex-1 text-[10px] font-mono bg-white text-black px-2 py-1 hover:bg-zinc-200 transition-colors duration-150">Edit</button>
                    <button onClick={() => exportCarousel(c.id)} className="p-1 text-zinc-500 hover:text-emerald-400 transition-colors duration-150"><ImageDown size={11} /></button>
                    <button onClick={() => deleteSaved(c.id)} className="p-1 text-zinc-600 hover:text-red-400 transition-colors duration-150"><Trash2 size={11} /></button>
                  </div>
                  {c.status === "exported" && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <Check size={9} className="text-emerald-400" />
                      <span className="text-[9px] font-mono text-emerald-400">{c.exported_images?.length || 0} PNGs</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Main: Grid + Right Sidebar ──────────────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">

        {/* ─── Center: Slide Grid ──────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Slides grid area */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-6">
            {slides.length === 0 ? (
              /* Empty state */
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 border-2 border-dashed border-zinc-700 flex items-center justify-center mb-4">
                  <Sparkles size={24} className="text-zinc-600" />
                </div>
                <div className="text-zinc-400 text-sm mb-1">Create a carousel</div>
                <div className="text-zinc-600 font-mono text-xs max-w-xs mb-6">
                  Select a client below, choose your options, and describe what you want — or just hit generate.
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-md">
                  {["5 growth tips for startups", "Leadership lessons", "Industry trends 2026", "How to build a brand"].map(s => (
                    <button key={s} onClick={() => setPromptText(s)}
                      className="px-3 py-1.5 text-[11px] font-mono border border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-colors duration-150">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Title + char limit bar */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                      {slides.length} slides
                    </span>
                    {carouselTitle && <span className="text-xs text-zinc-400 font-mono">· {carouselTitle}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-zinc-600">Char limit</span>
                    <input type="number" min={100} max={500} value={charLimit}
                      onChange={e => setCharLimit(parseInt(e.target.value) || CHAR_LIMIT_DEFAULT)}
                      className="w-16 bg-zinc-950 border border-zinc-700 px-2 py-1 text-[11px] text-white font-mono focus:outline-none focus:border-zinc-500 text-center" />
                    <button onClick={addSlide} title="Add blank slide"
                      className="p-1.5 text-zinc-500 hover:text-white border border-zinc-800 hover:bg-zinc-800 transition-colors duration-150">
                      <Plus size={12} />
                    </button>
                    <button onClick={() => addTypedSlide("insight")} title="Add typed slide"
                      className="px-2 py-1 text-[10px] font-mono text-zinc-500 hover:text-white border border-zinc-800 hover:bg-zinc-800 transition-colors duration-150">
                      + Typed
                    </button>
                  </div>
                </div>

                {/* Grid of slide image previews */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {slides.map((slide, idx) => {
                    const overLimit = getSlideContent(slide).length > charLimit;
                    const isActive = editingSlideIdx === idx;
                    const preview = slidePreviews[idx];
                    return (
                      <div key={slide.id} className="group relative">
                        <button
                          onClick={() => setEditingSlideIdx(isActive ? null : idx)}
                          className={`w-full border-2 overflow-hidden transition-all duration-150
                            ${isActive ? "border-white ring-1 ring-white/20" : overLimit ? "border-amber-600" : "border-zinc-800 hover:border-zinc-600"}`}
                          style={{ aspectRatio: "4/5" }}
                        >
                          <div
                            ref={el => { slideContainerRefs.current[idx] = el; }}
                            style={{ position: "relative", width: "100%", height: "100%" }}
                          >
                            {preview?.url ? (
                              <img
                                src={preview.url}
                                alt={`Slide ${idx + 1}`}
                                className="w-full h-full object-cover"
                                draggable={false}
                              />
                            ) : slide.type ? (
                              <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
                                <TypedSlideBlock
                                  slide={slide}
                                  config={config}
                                  scale={0.20}
                                  theme={templateToTheme(template)}
                                />
                              </div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-zinc-900">
                                {previewLoading ? (
                                  <div className="flex flex-col items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-zinc-600 border-t-white rounded-full animate-spin" />
                                    <span className="text-[10px] font-mono text-zinc-500">Rendering...</span>
                                  </div>
                                ) : (
                                  <span className="text-[10px] font-mono text-zinc-600">No preview</span>
                                )}
                              </div>
                            )}
                            {(slide.elements || []).map(el => (
                              <ImageElementOverlay
                                key={el.id}
                                element={el}
                                containerRef={{ current: slideContainerRefs.current[idx] }}
                                onUpdate={(id, updates) => updateImageElement(idx, id, updates)}
                                onDelete={(id) => deleteImageElement(idx, id)}
                              />
                            ))}
                          </div>
                        </button>
                        {/* Slide info */}
                        <div className="flex items-center justify-between mt-2 px-0.5">
                          <span className={`text-[11px] font-mono ${isActive ? "text-white" : "text-zinc-500"}`}>
                            Slide {idx + 1}{slide.type ? ` · ${slide.type}` : ""}
                          </span>
                          <span className={`text-[10px] font-mono ${overLimit ? "text-amber-400" : "text-zinc-600"}`}>
                            {getSlideContent(slide).length}/{charLimit}
                          </span>
                          <button onClick={(e) => { e.stopPropagation(); removeSlide(idx); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-zinc-700 hover:text-red-400 transition-all duration-150">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add slide card */}
                  <button onClick={addSlide}
                    className="border-2 border-dashed border-zinc-800 hover:border-zinc-600 flex flex-col items-center justify-center gap-2 transition-colors duration-150"
                    style={{ aspectRatio: "4/5" }}>
                    <Plus size={20} className="text-zinc-600" />
                    <span className="text-[11px] font-mono text-zinc-600">Add Slide</span>
                  </button>
                </div>

                {/* Exported PNGs */}
                {exportedImages.length > 0 && (
                  <div className="mt-8">
                    <div className="flex items-center gap-2 mb-3">
                      <Check size={10} className="text-emerald-400" />
                      <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">{exportedImages.length} PNGs exported</span>
                    </div>
                    <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
                      {exportedImages.map((url, i) => (
                        <div key={i} className="relative group">
                          <a href={url} target="_blank" rel="noopener noreferrer"
                            className="block border border-zinc-700 overflow-hidden hover:border-zinc-400 transition-colors duration-150"
                            style={{ aspectRatio: "4/5" }}>
                            <img src={url} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-150">
                              <ExternalLink size={14} className="text-white" />
                            </div>
                          </a>
                          <div className="flex items-center justify-between mt-1 px-0.5">
                            <span className="text-[9px] font-mono text-zinc-600">{i + 1}</span>
                            <button onClick={() => downloadImage(url, `slide_${i + 1}.png`)}
                              className="text-[9px] font-mono text-zinc-500 hover:text-white flex items-center gap-1 transition-colors duration-150">
                              <Download size={8} /> Save
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center gap-2 bg-zinc-950 border border-zinc-800 px-3 py-2">
                      <span className="text-[10px] font-mono text-zinc-600 flex-shrink-0">URL</span>
                      <code className="flex-1 text-[9px] text-zinc-400 truncate font-mono">{exportedImages[0]}</code>
                      <button onClick={() => { navigator.clipboard.writeText(exportedImages[0]); toast.success("Copied!"); }}
                        className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 hover:text-white border border-zinc-700 px-2 py-1 flex-shrink-0 hover:bg-zinc-800 transition-colors duration-150">
                        <Copy size={9} /> Copy
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ─── Bottom Input Bar ──────────────────────────────────── */}
          <div className="flex-shrink-0 border-t border-zinc-800 bg-zinc-950 px-6 py-4">
            {/* Options row */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <OptionPill label="Client" value={selectedClient?.name || ""} active={!!selectedClientId}
                options={clients.map(c => ({ value: c.id, label: c.name }))} onChange={setSelectedClientId} searchable />
              <OptionPill label="Template" value={availableTemplates.find(t => t.value === template)?.label || template} active={true}
                options={availableTemplates} onChange={setTemplate} />
              <OptionPill label="Platform" value={config.platform.charAt(0).toUpperCase() + config.platform.slice(1)} active={true}
                options={PLATFORMS.map(p => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
                onChange={v => setConfig(f => ({ ...f, platform: v }))} />
              <OptionPill label="Format" value={FORMAT_OPTIONS.find(o => o.value === slideFormat)?.label || "Auto"} active={true}
                options={FORMAT_OPTIONS} onChange={setSlideFormat} />
              <OptionPill label="Post Type" value={postType === "single_image" ? "Single Image" : "Carousel"} active={true}
                options={[{ value: "carousel", label: "Carousel" }, { value: "single_image", label: "Single Image" }]}
                onChange={setPostType} />
              {postType !== "single_image" && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-zinc-800 text-[11px] font-mono text-zinc-500">
                  <span>Slides</span>
                  <input type="number" min={3} max={10} value={config.slideCount}
                    onChange={e => setConfig(f => ({ ...f, slideCount: parseInt(e.target.value) || 5 }))}
                    className="w-8 bg-transparent text-white text-center focus:outline-none font-mono text-[11px]" />
                </div>
              )}
              {slides.length > 0 && !savedCarouselId && (
                <span className="text-[10px] font-mono text-zinc-600 ml-auto">Save to enable export</span>
              )}
            </div>
            {/* Topic Rules panel — shown when client has rules configured */}
            {selectedClientId && (() => {
              const includeEntries = (selectedClient?.strategy?.topics_include || []).map(e =>
                typeof e === "string" ? { text: e, type: "topic" } : e
              ).filter(e => e.text);
              const neverCover = (selectedClient?.onboarding_data?.not_to_do_list || []).filter(Boolean);
              if (!includeEntries.length && !neverCover.length) return null;
              return (
                <div className="flex items-start gap-3 mb-3 px-3 py-2 border border-zinc-800 bg-zinc-900/60">
                  <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest mt-0.5 flex-shrink-0">Topic Rules</span>
                  <div className="flex flex-wrap gap-1.5">
                    {includeEntries.map((e, i) => (
                      <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border ${
                        e.type === "mention"
                          ? "bg-sky-950/40 border-sky-900/60 text-sky-400/80"
                          : "bg-emerald-950/40 border-emerald-900/60 text-emerald-400/80"
                      }`}>
                        {e.text}
                        <span className="text-[8px] opacity-60 uppercase">{e.type}</span>
                      </span>
                    ))}
                    {neverCover.map((tag, i) => (
                      <span key={`nc-${i}`} className="inline-flex items-center px-2 py-0.5 text-[10px] font-mono border bg-rose-950/40 border-rose-900/60 text-rose-400/80">
                        <span className="text-[8px] opacity-60 uppercase mr-1">never</span>{tag}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* Prompt input */}
            <form onSubmit={handlePromptSubmit} className="flex items-center gap-3">
              <div className="flex-1 flex items-center bg-zinc-900 border border-zinc-700 focus-within:border-zinc-500 transition-colors duration-150">
                <input type="text" value={promptText} onChange={e => setPromptText(e.target.value)}
                  placeholder={selectedClientId ? "Describe your carousel topic or just hit Generate..." : "Select a client to get started..."}
                  disabled={!selectedClientId}
                  className="flex-1 bg-transparent px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none font-mono" />
                <button type="button" onClick={addSlide} disabled={!selectedClientId} title="Add blank slide"
                  className="px-3 py-2 text-zinc-600 hover:text-zinc-300 transition-colors duration-150 disabled:opacity-30">
                  <PenLine size={14} />
                </button>
              </div>
              <button type="submit" disabled={generating || !selectedClientId}
                className="flex items-center gap-2 px-5 py-3 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150 disabled:opacity-40 flex-shrink-0">
                {generating
                  ? <><Wand2 size={14} className="animate-spin" /> Generating...</>
                  : <><Wand2 size={14} /> Generate</>}
              </button>
            </form>
          </div>
        </div>

        {/* ─── Right Sidebar: Slide Editor ─────────────────────────── */}
        {editingSlide && (
          <div className="w-80 flex-shrink-0 border-l border-zinc-800 bg-zinc-900/50 flex flex-col overflow-hidden">
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 flex-shrink-0">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">
                Edit Slide {editingSlideIdx + 1}
              </span>
              <button onClick={() => setEditingSlideIdx(null)}
                className="p-1 text-zinc-600 hover:text-white transition-colors duration-150">
                <X size={14} />
              </button>
            </div>

            {/* Slide navigation */}
            <div className="flex items-center gap-1 px-4 py-3 flex-shrink-0">
              {!isSingleImageMode && slides.map((_, idx) => (
                <button key={idx} onClick={() => setEditingSlideIdx(idx)}
                  className={`flex-1 py-1 text-[10px] font-mono text-center transition-colors duration-100
                    ${editingSlideIdx === idx ? "bg-white text-black" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"}`}>
                  {idx + 1}
                </button>
              ))}
            </div>

            {/* Editor */}
            <div className="flex-1 flex flex-col px-4 pb-4 overflow-y-auto scrollbar-thin">
              {editingSlide?.type ? (
                <>
                  {/* Type selector */}
                  <div className="mt-2 mb-3">
                    <div className="text-[10px] font-mono text-zinc-500 mb-1.5">TYPE</div>
                    <div className="flex flex-wrap gap-1">
                      {["hook","tip","insight","problem","solution","step","result","cta","myth","truth","process","scene","tension","turning_point","loop","offer","psychology"].map(typeName => (
                        <button
                          key={typeName}
                          onClick={() => updateSlideField(editingSlideIdx, "type", typeName)}
                          className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wider transition-colors duration-100"
                          style={{
                            background: editingSlide.type === typeName ? (TYPE_COLORS[typeName] || "#6b7280") : "transparent",
                            color: editingSlide.type === typeName ? "#fff" : "#6b7280",
                            border: `1px solid ${editingSlide.type === typeName ? (TYPE_COLORS[typeName] || "#6b7280") : "#3f3f46"}`,
                            borderRadius: 3,
                          }}
                        >
                          {typeName}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Title */}
                  <div className="label-xs">Title</div>
                  <textarea
                    value={editingSlide.title || ""}
                    onChange={e => updateSlideField(editingSlideIdx, "title", e.target.value)}
                    rows={3}
                    placeholder="Slide title..."
                    className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none font-mono"
                  />

                  {/* Subtitle — hook only */}
                  {editingSlide.type === "hook" && (
                    <>
                      <div className="label-xs mt-3">Subtitle <span className="text-zinc-600 normal-case font-normal">(optional)</span></div>
                      <textarea
                        value={editingSlide.subtitle || ""}
                        onChange={e => updateSlideField(editingSlideIdx, "subtitle", e.target.value)}
                        rows={2}
                        placeholder="Amplifier line..."
                        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none font-mono"
                      />
                    </>
                  )}

                  {/* Highlight — solution type */}
                  {editingSlide.type === "solution" && (
                    <>
                      <div className="label-xs mt-3">Highlight <span className="text-zinc-600 normal-case font-normal">(optional)</span></div>
                      <input
                        value={editingSlide.highlight || ""}
                        onChange={e => updateSlideField(editingSlideIdx, "highlight", e.target.value)}
                        placeholder="Key phrase or stat..."
                        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-mono"
                      />
                    </>
                  )}

                  {/* Body — all types except hook */}
                  {editingSlide.type !== "hook" && (
                    <>
                      <div className="label-xs mt-3">Body</div>
                      <textarea
                        value={editingSlide.body || ""}
                        onChange={e => updateSlideField(editingSlideIdx, "body", e.target.value)}
                        rows={6}
                        placeholder="Slide body text...&#10;&#10;Use new lines for paragraphs."
                        className="w-full bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none font-mono leading-relaxed"
                      />
                    </>
                  )}

                  {/* Char count */}
                  <div className="mt-1.5 text-[10px] font-mono text-zinc-600">
                    {getSlideContent(editingSlide).length} chars
                  </div>
                </>
              ) : (
                <>
                  <div className="label-xs mt-1">Content</div>
                  <textarea
                    value={getSlideContent(editingSlide)}
                    onChange={e => updateSlide(editingSlideIdx, e.target.value)}
                    rows={8}
                    placeholder="Enter slide content...&#10;&#10;Use new lines for paragraphs.&#10;Keep it punchy."
                    className="w-full bg-zinc-950 border border-zinc-700 px-3 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none font-mono leading-relaxed"
                  />
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] font-mono text-zinc-600">
                      {getSlideContent(editingSlide).length} / {charLimit}
                    </span>
                    <span className={`text-[10px] font-mono ${getSlideContent(editingSlide).length > charLimit ? "text-amber-400" : "text-emerald-500"}`}>
                      {getSlideContent(editingSlide).length > charLimit ? "Over limit" : "Good"}
                    </span>
                  </div>
                  <div className="mt-1 h-1 bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-150 ${getSlideContent(editingSlide).length > charLimit ? "bg-amber-500" : "bg-emerald-500"}`}
                      style={{ width: `${Math.min(100, (getSlideContent(editingSlide).length / charLimit) * 100)}%` }}
                    />
                  </div>
                </>
              )}

              {/* Existing elements list — delete only, no add button */}
              {(editingSlide?.elements || []).length > 0 && (
                <div className="border-t border-zinc-800 pt-3 mt-3 space-y-1">
                  {(editingSlide.elements || []).map((el, i) => (
                    <div key={el.id} className="flex items-center justify-between px-2 py-1.5 bg-zinc-900 border border-zinc-800">
                      <div className="flex items-center gap-2 min-w-0">
                        {el.url
                          ? <img src={el.url} alt="" className="w-6 h-6 object-cover rounded" />
                          : <span className="text-zinc-600 text-[10px]">☁</span>
                        }
                        <span className="text-[10px] font-mono text-zinc-400 truncate">
                          {el.url ? `Image ${i + 1}` : "Drive Image"}
                        </span>
                      </div>
                      <button
                        onClick={() => deleteImageElement(editingSlideIdx, el.id)}
                        className="text-zinc-600 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
                        title="Remove element"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Author details */}
              <div className="label-xs mt-5">Author</div>
              <div className="space-y-2">
                {/* Author photo */}
                <input
                  ref={authorPhotoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={e => handleAuthorPhotoUpload(e.target.files?.[0])}
                />
                <div className="flex items-center gap-2">
                  {config.profilePhotoUrl
                    ? <img src={config.profilePhotoUrl} alt="" className="w-8 h-8 rounded-full object-cover border border-zinc-700 flex-shrink-0" />
                    : <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex-shrink-0" />
                  }
                  <button
                    onClick={() => authorPhotoInputRef.current?.click()}
                    disabled={authorPhotoUploading}
                    className="flex-1 py-1.5 text-[11px] font-mono border border-dashed border-zinc-700 hover:border-zinc-500 text-zinc-500 hover:text-white transition-colors duration-150 disabled:opacity-50"
                  >
                    {authorPhotoUploading ? "Uploading..." : config.profilePhotoUrl ? "Change Photo" : "Upload Photo"}
                  </button>
                </div>
                <input value={config.authorName}
                  onChange={e => setConfig(p => ({ ...p, authorName: e.target.value }))}
                  placeholder="Full name" className="field" />
                <input value={config.authorHandle}
                  onChange={e => setConfig(p => ({ ...p, authorHandle: e.target.value }))}
                  placeholder="@handle" className="field" />
                <input value={config.authorTitle}
                  onChange={e => setConfig(p => ({ ...p, authorTitle: e.target.value }))}
                  placeholder="Role / Company" className="field" />
              </div>

              {/* Design Profile badge */}
              {designContext && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Design</span>
                  <span className="text-xs font-mono border border-zinc-700 rounded px-2 py-0.5 text-zinc-300">
                    {designContext.palette_name}
                  </span>
                  <span className="text-xs font-mono border border-zinc-700 rounded px-2 py-0.5 text-zinc-400">
                    {designContext.visual_style}
                  </span>
                </div>
              )}

              {/* Carousel title */}
              <div className="label-xs mt-5">Title</div>
              <input value={carouselTitle} onChange={e => setCarouselTitle(e.target.value)}
                placeholder="Carousel title" className="field" />

              {/* Delete slide */}
              <button onClick={() => removeSlide(editingSlideIdx)}
                className="mt-5 flex items-center justify-center gap-2 py-2 text-xs font-mono text-zinc-600 border border-zinc-800 hover:border-red-900 hover:text-red-400 transition-colors duration-150">
                <Trash2 size={11} /> Remove Slide {editingSlideIdx + 1}
              </button>
            </div>
          </div>
        )}
      </div>

        </>
      )}

      {studioTab === "video" && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <VideoCreator />
        </div>
      )}
    </div>
  );
}
