import { useState, useCallback } from "react";

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

const ELEMENT_DEFAULTS = {
  text_overlay: {
    type: "text_overlay", x_ratio: 0.5, y_ratio: 0.5, z_index: 1,
    start_at: 0, duration: null, animation_in: "fade", animation_out: "none",
    overridable: false, override_key: null,
    props: { text: "Text Overlay", font: "bold_sans", size: "M", color: "#ffffff",
             bg_color: "#000000", bg_opacity: 0.5, bg_shape: "pill", align: "center", shadow: false },
  },
  lower_third: {
    type: "lower_third", x_ratio: 0.5, y_ratio: 0.85, z_index: 1,
    start_at: 0, duration: null, animation_in: "slide_up", animation_out: "none",
    overridable: false, override_key: null,
    props: { text: "Lower Third", font: "bold_sans", size: "M", color: "#ffffff",
             bg_color: "#000000", bg_opacity: 0.7, bg_shape: "box", align: "left", shadow: false },
  },
  countdown: {
    type: "countdown", x_ratio: 0.5, y_ratio: 0.5, z_index: 1,
    start_at: 0, duration: null, animation_in: "fade", animation_out: "none",
    overridable: false, override_key: null,
    props: { end_at: 10.0, color: "#ffffff", font: "bold_sans", size: "XL" },
  },
  cta_button: {
    type: "cta_button", x_ratio: 0.5, y_ratio: 0.88, z_index: 2,
    start_at: 3, duration: null, animation_in: "slide_up", animation_out: "none",
    overridable: true, override_key: "cta_button",
    props: { text: "Shop Now", bg_color: "#ffffff", text_color: "#000000",
             border_radius: 999, arrow: true, gradient: false,
             gradient_from: "#ffffff", gradient_to: "#cccccc" },
  },
  cta_text: {
    type: "cta_text", x_ratio: 0.5, y_ratio: 0.78, z_index: 1,
    start_at: 0, duration: null, animation_in: "fade", animation_out: "none",
    overridable: true, override_key: "cta_text",
    props: { text: "Follow us", font: "bold_sans", size: "M", color: "#ffffff",
             bg_color: "#000000", bg_opacity: 0.5, bg_shape: "none", align: "center", shadow: false },
  },
  link_in_bio: {
    type: "link_in_bio", x_ratio: 0.5, y_ratio: 0.93, z_index: 2,
    start_at: 0, duration: null, animation_in: "fade", animation_out: "none",
    overridable: false, override_key: null,
    props: { text: "Link in bio", handle: "@brand", bg_color: "#000000", text_color: "#ffffff" },
  },
  logo: {
    type: "logo", x_ratio: 0.85, y_ratio: 0.05, z_index: 3,
    start_at: 0, duration: null, animation_in: "fade", animation_out: "none",
    overridable: false, override_key: null,
    props: { drive_file_id: null, r2_url: null, opacity: 1.0, width_ratio: 0.15, height_ratio: 0.08 },
  },
  watermark: {
    type: "watermark", x_ratio: 0.5, y_ratio: 0.97, z_index: 3,
    start_at: 0, duration: null, animation_in: "none", animation_out: "none",
    overridable: false, override_key: null,
    props: { drive_file_id: null, r2_url: null, opacity: 0.5, width_ratio: 0.2, height_ratio: 0.05 },
  },
  rectangle: {
    type: "rectangle", x_ratio: 0.5, y_ratio: 0.5, z_index: 0,
    start_at: 0, duration: null, animation_in: "fade", animation_out: "none",
    overridable: false, override_key: null,
    props: { fill_color: "#000000", fill_opacity: 0.5, border_color: "#ffffff",
             border_width: 0, width_ratio: 0.8, height_ratio: 0.1 },
  },
  circle: {
    type: "circle", x_ratio: 0.5, y_ratio: 0.5, z_index: 0,
    start_at: 0, duration: null, animation_in: "fade", animation_out: "none",
    overridable: false, override_key: null,
    props: { fill_color: "#ffffff", fill_opacity: 0.8, border_color: "#ffffff",
             border_width: 0, width_ratio: 0.1, height_ratio: 0.1 },
  },
  line: {
    type: "line", x_ratio: 0.5, y_ratio: 0.5, z_index: 0,
    start_at: 0, duration: null, animation_in: "none", animation_out: "none",
    overridable: false, override_key: null,
    props: { color: "#ffffff", thickness: 2, width_ratio: 0.8 },
  },
};

export function useVideoBuilderState(initial = {}) {
  const [name, setName] = useState(initial.name || "");
  const [aspectRatio, setAspectRatio] = useState(initial.aspect_ratio || "9:16");
  const [videoClipId, setVideoClipId] = useState(initial.video_clip_id || null);
  const [videoOverridable, setVideoOverridable] = useState(initial.video_overridable ?? true);
  const [elements, setElements] = useState(
    (initial.elements || []).map(el => ({ ...el, id: el.id || uuid() }))
  );
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [picsumSeed, setPicsumSeed] = useState(Math.floor(Math.random() * 1000));
  const [dirty, setDirty] = useState(false);

  const addElement = useCallback((type) => {
    const defaults = ELEMENT_DEFAULTS[type];
    if (!defaults) return;
    const id = uuid();
    setElements(prev => {
      const el = { ...defaults, props: { ...defaults.props }, id, z_index: prev.length };
      return [...prev, el];
    });
    setSelectedElementId(id);
    setDirty(true);
  }, []);

  const updateElement = useCallback((id, patch) => {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...patch } : el));
    setDirty(true);
  }, []);

  const updateElementProps = useCallback((id, propsPatch) => {
    setElements(prev => prev.map(el =>
      el.id === id ? { ...el, props: { ...el.props, ...propsPatch } } : el
    ));
    setDirty(true);
  }, []);

  const deleteElement = useCallback((id) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedElementId(prev => prev === id ? null : prev);
    setDirty(true);
  }, []);

  const duplicateElement = useCallback((id) => {
    const newId = uuid();
    setElements(prev => {
      const src = prev.find(el => el.id === id);
      if (!src) return prev;
      const clone = {
        ...src,
        props: { ...src.props },
        id: newId,
        x_ratio: Math.min(src.x_ratio + 0.02, 1),
        y_ratio: Math.min(src.y_ratio + 0.02, 1),
        z_index: prev.length,
      };
      return [...prev, clone];
    });
    setSelectedElementId(newId);
    setDirty(true);
  }, []);

  const moveElementZ = useCallback((id, dir) => {
    setElements(prev => prev.map(el =>
      el.id === id ? { ...el, z_index: Math.max(0, el.z_index + dir) } : el
    ));
    setDirty(true);
  }, []);

  const shuffleBackground = useCallback(() => {
    setPicsumSeed(prev => prev + 1);
  }, []);

  const selectedElement = elements.find(el => el.id === selectedElementId) || null;

  const toPayload = () => ({
    name,
    aspect_ratio: aspectRatio,
    video_clip_id: videoClipId,
    video_overridable: videoOverridable,
    elements,
  });

  const markSaved = () => setDirty(false);

  return {
    name, setName,
    aspectRatio, setAspectRatio,
    videoClipId, setVideoClipId,
    videoOverridable, setVideoOverridable,
    elements,
    selectedElementId, setSelectedElementId,
    selectedElement,
    picsumSeed,
    dirty,
    addElement,
    updateElement,
    updateElementProps,
    deleteElement,
    duplicateElement,
    moveElementZ,
    shuffleBackground,
    toPayload,
    markSaved,
  };
}
