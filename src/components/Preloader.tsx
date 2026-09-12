"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function Preloader({ children }: { children: React.ReactNode }) {
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Only block scrolling while preloader is active
    document.body.style.overflow = "hidden";

    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 25) + 15;
      if (current >= 100) {
        current = 100;
        setProgress(100);
        clearInterval(interval);

        setTimeout(() => {
          setFading(true);
          setTimeout(() => {
            setLoading(false);
            document.body.style.overflow = "";
          }, 400); // Wait for fade transition
        }, 150);
      } else {
        setProgress(current);
      }
    }, 60);

    return () => {
      clearInterval(interval);
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <>
      {loading && (
        <div
          className={cn(
            "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]",
            fading ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
          )}
        >
          <div className="flex flex-col items-center justify-center gap-6 mix-blend-difference invert dark:mix-blend-normal dark:invert-0">
            <div className="text-8xl md:text-9xl font-display font-black tracking-tighter tabular-nums selection:bg-transparent">
              {progress}<span className="text-4xl md:text-5xl text-muted-foreground align-top">%</span>
            </div>

            <div className="h-1.5 w-64 overflow-hidden rounded-full bg-border">
              <div
                className="h-full bg-foreground transition-all duration-75 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="text-xs font-bold tracking-widest text-muted-foreground uppercase animate-pulse">
              Loading Notices
            </div>
          </div>
        </div>
      )}

      <div className={cn(
        "transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]",
        loading && !fading ? "opacity-0 translate-y-6 blur-sm pointer-events-none" : "opacity-100 translate-y-0 blur-0"
      )}>
        {children}
      </div>
    </>
  );
}
