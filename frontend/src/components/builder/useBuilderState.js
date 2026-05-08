import { useState, useCallback, useRef } from "react";

const MAX_UNDO = 50;
const ZONE_NAMES = ["first", "middle", "last"];

function generateId() {
  return "elem-" + Math.random().toString(36).slice(2, 10);
}

function emptyZone(canvas) {
  return {
    canvas: canvas || { width: 1080, height: 1350, background: { type: "solid", value: "#000000" } },
    elements: [],
  };
}

export default function useBuilderState(initialElements = [], initialZones = null) {
  const [activeZone, setActiveZone] = useState("middle");
  const [zones, setZones] = useState(() => {
    if (initialZones) return initialZones;
    return null;
  });
  const [elements, setElements] = useState(initialElements);
  const [selectedIds, setSelectedIds] = useState([]);

  const undoStacks = useRef({ first: [], middle: [], last: [], _legacy: [] });
  const redoStacks = useRef({ first: [], middle: [], last: [], _legacy: [] });

  const getUndoKey = useCallback(() => zones ? activeZone : "_legacy", [zones, activeZone]);

  const pushUndo = useCallback((prev) => {
    const key = zones ? activeZone : "_legacy";
    undoStacks.current[key].push(JSON.stringify(prev));
    if (undoStacks.current[key].length > MAX_UNDO) undoStacks.current[key].shift();
    redoStacks.current[key] = [];
  }, [zones, activeZone]);

  const undo = useCallback(() => {
    const key = getUndoKey();
    if (undoStacks.current[key].length === 0) return;
    if (zones) {
      setZones(prev => {
        const zone = prev[activeZone];
        redoStacks.current[key].push(JSON.stringify(zone.elements));
        return {
          ...prev,
          [activeZone]: { ...zone, elements: JSON.parse(undoStacks.current[key].pop()) },
        };
      });
      setZones(prev => {
        setElements(prev[activeZone].elements);
        return prev;
      });
    } else {
      setElements(prev => {
        redoStacks.current[key].push(JSON.stringify(prev));
        return JSON.parse(undoStacks.current[key].pop());
      });
    }
  }, [zones, activeZone, getUndoKey]);

  const redo = useCallback(() => {
    const key = getUndoKey();
    if (redoStacks.current[key].length === 0) return;
    if (zones) {
      setZones(prev => {
        const zone = prev[activeZone];
        undoStacks.current[key].push(JSON.stringify(zone.elements));
        return {
          ...prev,
          [activeZone]: { ...zone, elements: JSON.parse(redoStacks.current[key].pop()) },
        };
      });
      setZones(prev => {
        setElements(prev[activeZone].elements);
        return prev;
      });
    } else {
      setElements(prev => {
        undoStacks.current[key].push(JSON.stringify(prev));
        return JSON.parse(redoStacks.current[key].pop());
      });
    }
  }, [zones, activeZone, getUndoKey]);

  const enableZones = useCallback((canvas) => {
    const defaultZone = emptyZone(canvas);
    setZones({
      first: { ...defaultZone, canvas: { ...canvas } },
      middle: { canvas: { ...canvas }, elements: [...elements] },
      last: { ...defaultZone, canvas: { ...canvas } },
    });
    setActiveZone("middle");
  }, [elements]);

  const switchZone = useCallback((zoneName) => {
    if (!zones || !ZONE_NAMES.includes(zoneName)) return;
    setZones(prev => {
      const updated = { ...prev, [activeZone]: { ...prev[activeZone], elements } };
      setElements(updated[zoneName].elements);
      setSelectedIds([]);
      return updated;
    });
    setActiveZone(zoneName);
  }, [zones, activeZone, elements]);

  const updateZoneCanvas = useCallback((zoneName, canvasUpdate) => {
    if (!zones) return;
    setZones(prev => ({
      ...prev,
      [zoneName]: { ...prev[zoneName], canvas: { ...prev[zoneName].canvas, ...canvasUpdate } },
    }));
  }, [zones]);

  const getZonesForSave = useCallback(() => {
    if (!zones) return null;
    return { ...zones, [activeZone]: { ...zones[activeZone], elements } };
  }, [zones, activeZone, elements]);

  const loadZones = useCallback((zonesData, fallbackCanvas) => {
    if (!zonesData) {
      setZones(null);
      return;
    }
    const loaded = {};
    for (const name of ZONE_NAMES) {
      const z = zonesData[name] || {};
      loaded[name] = {
        canvas: z.canvas || fallbackCanvas || { width: 1080, height: 1350, background: { type: "solid", value: "#000000" } },
        elements: z.elements || [],
      };
    }
    setZones(loaded);
    setElements(loaded.middle.elements);
    setActiveZone("middle");
  }, []);

  const addElement = useCallback((type, defaults = {}) => {
    setElements(prev => {
      pushUndo(prev);
      const newElem = {
        id: generateId(),
        type,
        label: defaults.label || type.charAt(0).toUpperCase() + type.slice(1),
        x: defaults.x ?? 100,
        y: defaults.y ?? 100,
        width: defaults.width ?? 200,
        height: defaults.height ?? 50,
        grid_col: 1,
        grid_row: 1,
        rotation: 0,
        z_index: Math.max(0, ...prev.map(e => e.z_index || 0)) + 1,
        locked: false,
        visible: true,
        props: defaults.props || getDefaultProps(type),
      };
      return [...prev, newElem];
    });
  }, [pushUndo]);

  const updateElement = useCallback((id, changes) => {
    setElements(prev => {
      pushUndo(prev);
      return prev.map(e => e.id === id ? { ...e, ...changes } : e);
    });
  }, [pushUndo]);

  const updateElementProps = useCallback((id, propChanges) => {
    setElements(prev => {
      pushUndo(prev);
      return prev.map(e =>
        e.id === id ? { ...e, props: { ...e.props, ...propChanges } } : e
      );
    });
  }, [pushUndo]);

  const removeElements = useCallback((ids) => {
    setElements(prev => {
      pushUndo(prev);
      return prev.filter(e => !ids.includes(e.id));
    });
    setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
  }, [pushUndo]);

  const moveElement = useCallback((id, x, y) => {
    setElements(prev => {
      pushUndo(prev);
      return prev.map(e => e.id === id ? { ...e, x, y } : e);
    });
  }, [pushUndo]);

  const resizeElement = useCallback((id, width, height) => {
    setElements(prev => {
      pushUndo(prev);
      return prev.map(e => e.id === id ? { ...e, width, height } : e);
    });
  }, [pushUndo]);

  const select = useCallback((id, addToSelection = false) => {
    setSelectedIds(prev => {
      if (addToSelection) {
        return prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      }
      return [id];
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  const bringToFront = useCallback((id) => {
    setElements(prev => {
      pushUndo(prev);
      const maxZ = Math.max(...prev.map(e => e.z_index || 0));
      return prev.map(e => e.id === id ? { ...e, z_index: maxZ + 1 } : e);
    });
  }, [pushUndo]);

  const sendToBack = useCallback((id) => {
    setElements(prev => {
      pushUndo(prev);
      const minZ = Math.min(...prev.map(e => e.z_index || 0));
      return prev.map(e => e.id === id ? { ...e, z_index: minZ - 1 } : e);
    });
  }, [pushUndo]);

  return {
    elements,
    setElements,
    selectedIds,
    addElement,
    updateElement,
    updateElementProps,
    removeElements,
    moveElement,
    resizeElement,
    select,
    clearSelection,
    undo,
    redo,
    bringToFront,
    sendToBack,
    canUndo: undoStacks.current[getUndoKey()]?.length > 0,
    canRedo: redoStacks.current[getUndoKey()]?.length > 0,
    activeZone,
    zones,
    enableZones,
    switchZone,
    updateZoneCanvas,
    getZonesForSave,
    loadZones,
  };
}

function getDefaultProps(type) {
  switch (type) {
    case "text":
      return { content: "Text", fontSize: 44, fontFamily: "Helvetica", fontWeight: "600", color: "#ffffff", textAlign: "left", lineHeight: 1.5, padding: 0 };
    case "image":
      return { src: "", fit: "cover", borderRadius: 0, opacity: 1 };
    case "shape":
      return { shape: "rect", fill: "#333333", stroke: "none", strokeWidth: 0, borderRadius: 0 };
    case "icon":
      return { iconName: "★", size: 24, color: "#ffffff" };
    case "author_block":
      return { showAvatar: true, showName: true, showHandle: true, showTitle: true, layout: "horizontal", fontSize: 32, color: "#ffffff" };
    case "content":
      return { fontSize: 44, fontFamily: "Helvetica", fontWeight: "600", color: "#ffffff", lineHeight: 1.6, paraGap: 24, textAlign: "left" };
    case "logo":
      return { src: "", fit: "contain", opacity: 1 };
    default:
      return {};
  }
}
