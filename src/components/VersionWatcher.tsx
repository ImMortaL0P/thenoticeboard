"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const CURRENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";

export function VersionWatcher() {
  const router = useRouter();

  useEffect(() => {
    if (CURRENT_VERSION.startsWith("dev")) return;

    let intervalId: NodeJS.Timeout;
    
    // Check version every 5 minutes
    const checkVersion = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        
        if (data.version && data.version !== "unknown" && data.version !== CURRENT_VERSION) {
          console.log(`New version detected: ${data.version} (current: ${CURRENT_VERSION}). Reloading...`);
          // Hard reload the page to get the new assets
          window.location.reload();
        }
      } catch (err) {
        // Silent failure so we don't break the UI if offline
      }
    };

    intervalId = setInterval(checkVersion, 5 * 60 * 1000);
    // Extra checks on focus
    const onFocus = () => checkVersion();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
