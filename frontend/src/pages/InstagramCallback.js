import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader } from "lucide-react";

/**
 * Handles the Instagram OAuth popup callback.
 * Notifies the opener window, then closes itself.
 */
export default function InstagramCallback() {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("processing"); // processing | success | error

  useEffect(() => {
    const success  = params.get("success") === "true";
    const error    = params.get("error");
    const clientId = params.get("client_id");
    const username = params.get("username");

    setStatus(success ? "success" : "error");

    // Notify the opener window (if this was opened as a popup)
    if (window.opener) {
      window.opener.postMessage(
        { type: "INSTAGRAM_AUTH", success, error, clientId, username },
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
            <p className="text-zinc-400 font-mono text-sm">Connecting Instagram...</p>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle size={40} className="text-emerald-400 mx-auto" />
            <div className="text-white font-semibold">Instagram Connected!</div>
            {params.get("username") && (
              <div className="text-zinc-400 font-mono text-sm">@{params.get("username")}</div>
            )}
            <p className="text-zinc-600 text-xs font-mono">This window will close automatically...</p>
          </>
        )}
        {status === "error" && (
          <>
            <XCircle size={40} className="text-red-400 mx-auto" />
            <div className="text-white font-semibold">
              {params.get("error") === "personal_account"
                ? "Personal Account Not Supported"
                : "Connection Failed"}
            </div>
            {params.get("error") === "personal_account" ? (
              <div className="text-zinc-300 text-xs max-w-sm space-y-2 text-left">
                <p className="font-mono">
                  @{params.get("username")} is set to{" "}
                  <span className="text-amber-400">{params.get("account_type") || "PERSONAL"}</span>.
                  Instagram only allows publishing from <span className="text-emerald-400">Business</span> or{" "}
                  <span className="text-emerald-400">Creator</span> accounts.
                </p>
                <p className="text-zinc-500 font-mono text-[11px] leading-relaxed">
                  Fix it: Instagram app → Settings → Account type and tools → Switch to Business or Creator account, then reconnect here.
                </p>
              </div>
            ) : (
              <p className="text-zinc-400 text-xs font-mono max-w-xs">
                {params.get("error") || "An error occurred during Instagram authentication."}
              </p>
            )}
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
