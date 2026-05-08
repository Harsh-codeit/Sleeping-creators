import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader } from "lucide-react";

/**
 * Handles the Facebook OAuth popup callback.
 * Notifies the opener window, then closes itself.
 */
export default function FacebookCallback() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("processing"); // processing | success | error

  useEffect(() => {
    const success    = params.get("success") === "true";
    const error      = params.get("error");
    const clientId   = params.get("client_id");
    const pageName   = params.get("page_name");
    const selectPage = params.get("select_page") === "true";
    const pageCount  = params.get("page_count");

    setStatus(success ? "success" : "error");

    // Notify the opener window (if this was opened as a popup)
    if (window.opener) {
      window.opener.postMessage(
        { type: "FACEBOOK_AUTH", success, error, clientId, pageName, selectPage, pageCount },
        window.location.origin
      );
      // Give user a moment to see the result, then close
      setTimeout(() => window.close(), 1800);
    }
  }, [params]);

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-4 px-6">
        {status === "processing" && (
          <>
            <Loader size={40} className="text-zinc-400 animate-spin mx-auto" />
            <p className="text-zinc-400 font-mono text-sm">Connecting Facebook...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle size={40} className="text-emerald-400 mx-auto" />
            <div className="text-white font-semibold">Facebook Connected!</div>
            {params.get("page_name") && (
              <div className="text-zinc-400 font-mono text-sm">{decodeURIComponent(params.get("page_name"))}</div>
            )}
            {params.get("select_page") === "true" && (
              <div className="text-zinc-400 font-mono text-sm">{params.get("page_count")} pages found — select one in the dashboard</div>
            )}
            <p className="text-zinc-600 text-xs font-mono">This window will close automatically...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={40} className="text-red-400 mx-auto" />
            <div className="text-white font-semibold">Connection Failed</div>
            <p className="text-zinc-400 text-xs font-mono max-w-xs">
              {params.get("error") || "An error occurred during Facebook authentication."}
            </p>
            <button
              onClick={() => window.close()}
              className="mt-2 px-4 py-2 border border-zinc-700 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
