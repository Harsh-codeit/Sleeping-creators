import { useEffect, useState, useCallback } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// Module-level shared cache so every component sees the same list and
// updates propagate without prop-drilling.
let _tags = null;          // null until first fetch
let _inflight = null;      // shared promise for concurrent first fetches
const _listeners = new Set();

function _broadcast(nextTags) {
  _tags = nextTags;
  _listeners.forEach((cb) => cb(nextTags));
}

async function _fetch() {
  if (_inflight) return _inflight;
  _inflight = axios
    .get(`${API}/music/tags`)
    .then((r) => {
      const list = r.data?.tags || [];
      _broadcast(list);
      return list;
    })
    .finally(() => {
      _inflight = null;
    });
  return _inflight;
}

export function useMusicTags() {
  const [tags, setTags] = useState(_tags || []);

  useEffect(() => {
    _listeners.add(setTags);
    if (_tags === null) _fetch().catch(() => {});
    else setTags(_tags);
    return () => {
      _listeners.delete(setTags);
    };
  }, []);

  const refresh = useCallback(() => _fetch(), []);

  const createTag = useCallback(async (raw) => {
    const tag = (raw || "").trim().toLowerCase();
    if (!tag) throw new Error("Tag must not be empty");
    const r = await axios.post(`${API}/music/tags`, { tag });
    const list = r.data?.tags || [];
    _broadcast(list);
    return tag;
  }, []);

  const deleteTag = useCallback(async (tag) => {
    const r = await axios.delete(`${API}/music/tags/${encodeURIComponent(tag)}`);
    const list = r.data?.tags || [];
    _broadcast(list);
  }, []);

  return { tags, refresh, createTag, deleteTag };
}
