import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader, ExternalLink } from "lucide-react";

export default function BundleConnect() {
  const { clientId } = useParams();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const popup = window.open(
      `/api/bundle/authorize/${clientId}`,
      "bundle_connect",
      "width=600,height=700,top=100,left=200,resizable=yes,scrollbars=yes"
    );
    if (!popup) setBlocked(true);
  }, [clientId]);

  function openManually() {
    window.open(
      `/api/bundle/authorize/${clientId}`,
      "bundle_connect",
      "width=600,height=700,top=100,left=200,resizable=yes,scrollbars=yes"
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-center space-y-4 px-6">
        {blocked ? (
          <>
            <ExternalLink size={40} className="text-zinc-400 mx-auto" />
            <div className="text-white font-semibold">Popup was blocked</div>
            <p className="text-zinc-400 text-sm font-mono max-w-xs">
              Your browser blocked the popup. Click the button below to connect your Instagram.
            </p>
            <button
              onClick={openManually}
              className="mt-2 px-6 py-3 bg-white text-black text-sm font-semibold hover:bg-zinc-200 transition-colors duration-150"
            >
              Connect your Instagram
            </button>
          </>
        ) : (
          <>
            <Loader size={40} className="text-zinc-400 animate-spin mx-auto" />
            <p className="text-zinc-400 text-sm font-mono">Opening connection window...</p>
          </>
        )}
      </div>
    </div>
  );
}
