// Safely turn any axios/thrown error into a human-readable STRING for a toast.
//
// Why this exists: <Toaster> (sonner) is mounted in App.js *above* the app's
// ErrorBoundary. If a toast is handed a non-string (e.g. a FastAPI 422 body,
// whose `detail` is an array of error objects), React tries to render those
// objects as children — "Objects are not valid as a React child" — and the
// throw happens above the boundary, blanking the entire page. Always coerce
// to a string at the call site.

export function detailToText(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  // FastAPI validation errors: detail = [{ loc, msg, type, ... }, ...]
  if (Array.isArray(detail)) {
    return detail
      .map(d => (typeof d === "string" ? d : (d && typeof d.msg === "string" ? d.msg : "")))
      .filter(Boolean)
      .join("; ");
  }
  if (typeof detail === "object" && typeof detail.msg === "string") return detail.msg;
  return "";
}

export function errText(err, fallback = "Something went wrong") {
  return detailToText(err?.response?.data?.detail) || fallback;
}
