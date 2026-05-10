import { useEffect, useRef } from "react";
import { Preview } from "@creatomate/preview";

export default function CreatomatePreview({ source, modifications, height = 480 }) {
  const containerRef = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const token = process.env.REACT_APP_CREATOMATE_PREVIEW_TOKEN || "";
    if (!token) {
      console.warn("REACT_APP_CREATOMATE_PREVIEW_TOKEN missing — preview disabled");
      return;
    }
    const preview = new Preview(containerRef.current, "player", token);
    previewRef.current = preview;
    preview.onReady = async () => {
      if (source) await preview.setSource(source);
      if (modifications) await preview.setModifications(modifications);
    };
    return () => {
      try { preview.dispose(); } catch (_) {}
    };
  }, [source]);

  useEffect(() => {
    if (previewRef.current && modifications) {
      previewRef.current.setModifications(modifications).catch(() => {});
    }
  }, [JSON.stringify(modifications)]);

  return <div ref={containerRef} style={{ width: "100%", height }} />;
}
