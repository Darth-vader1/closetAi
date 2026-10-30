"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Sparkles, ArrowRight, X, Shirt, Palette, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfettiParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  rotation: number;
  vRot: number;
  shape: "rect" | "circle";
  opacity: number;
}

const DynamicFloatingObsidianPrism = dynamic(
  () => import("./floating-obsidian-prism").then((m) => m.FloatingObsidianPrism),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] w-full flex items-center justify-center">
        <div className="size-16 rounded-full bg-accent/20 animate-pulse" />
      </div>
    ),
  },
);

export function PremiumCelebrationModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Clean up ?upgraded=true from the URL so reload doesn't re-trigger it
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("upgraded")) {
        url.searchParams.delete("upgraded");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    }

    // Launch Luxury Confetti Shower
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const colors = [
      "#d4af37", // Champagne Gold
      "#9a4a2f", // Terracotta
      "#fef08a", // Pale Gold
      "#f5f5f4", // Warm Ivory
      "#e0a899", // Rose Gold
      "#1c1917", // Obsidian
    ];

    const particles: ConfettiParticle[] = [];
    const count = window.innerWidth < 768 ? 90 : 180;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: window.innerWidth * 0.5 + (Math.random() - 0.5) * 200,
        y: window.innerHeight * 0.35 + (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 12 - 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * 360,
        vRot: (Math.random() - 0.5) * 12,
        shape: Math.random() > 0.4 ? "rect" : "circle",
        opacity: 1,
      });
    }

    const startTime = performance.now();

    const animateConfetti = (time: number) => {
      const elapsed = time - startTime;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let anyAlive = false;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22; // Gravity
        p.vx *= 0.985; // Wind resistance
        p.rotation += p.vRot;

        // Fade out gradually after 3.5 seconds
        if (elapsed > 3500) {
          p.opacity = Math.max(0, p.opacity - 0.015);
        }

        if (p.opacity > 0 && p.y < canvas.height + 50) {
          anyAlive = true;
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;

          if (p.shape === "rect") {
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
          } else {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      if (anyAlive && elapsed < 7500) {
        animRef.current = requestAnimationFrame(animateConfetti);
      }
    };

    animRef.current = requestAnimationFrame(animateConfetti);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      {/* Full-Screen Confetti Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-10 w-full h-full"
      />

      {/* Main Luxury Pop-Out Modal */}
      <div className="relative z-20 w-full max-w-xl rounded-3xl bg-gradient-to-b from-stone-900 via-stone-950 to-black text-stone-100 border border-amber-500/30 shadow-2xl shadow-amber-500/10 overflow-hidden my-auto animate-in zoom-in-95 duration-400">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-30 size-8 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-stone-300 hover:text-white transition"
          aria-label="Close celebration"
        >
          <X className="size-4" />
        </button>

        {/* Floating 3D Obsidian Crystal Stage */}
        <div className="relative w-full bg-gradient-to-b from-amber-500/10 via-transparent to-transparent pt-3 pb-1">
          <DynamicFloatingObsidianPrism height={240} />
        </div>

        {/* Congratulatory Content Body */}
        <div className="px-6 sm:px-8 pb-8 pt-1 text-center space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-500/20 via-amber-400/25 to-amber-500/20 border border-amber-400/40 px-3.5 py-1 text-xs font-semibold text-amber-300 uppercase tracking-widest">
            <Sparkles className="size-3.5 text-amber-300 animate-spin" style={{ animationDuration: "8s" }} />
            <span>VIP Access Activated</span>
          </div>

          <div className="space-y-2">
            <h2 className="font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-white">
              Welcome to ClosetAI Premium
            </h2>
            <p className="text-xs sm:text-sm text-stone-300 max-w-md mx-auto leading-relaxed">
              Your payment was successful! Your personalized atelier is now empowered with full Gemini AI styling and unrestricted studio capacity.
            </p>
          </div>

          {/* Unlocked Capabilities Grid */}
          <div className="grid grid-cols-2 gap-3 text-left pt-2">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <Shirt className="size-3.5" />
                <span>Unlimited Wardrobe</span>
              </div>
              <p className="text-[11px] text-stone-400 leading-snug">
                Store and catalogue every garment without item caps.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <Sparkles className="size-3.5" />
                <span>100 Outfits / Mo</span>
              </div>
              <p className="text-[11px] text-stone-400 leading-snug">
                High-context AI recommendations tailored to your style.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <Wand2 className="size-3.5" />
                <span>30 Beautify / Mo</span>
              </div>
              <p className="text-[11px] text-stone-400 leading-snug">
                Neural shadow flattening and professional photo studio polish.
              </p>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-semibold text-xs">
                <Palette className="size-3.5" />
                <span>Priority Stylist</span>
              </div>
              <p className="text-[11px] text-stone-400 leading-snug">
                Multi-turn outfit consultations and smart packing lists.
              </p>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="pt-3 flex flex-col sm:flex-row items-center gap-3">
            <Button
              asChild
              className="w-full sm:flex-1 py-5 text-sm font-semibold bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 hover:brightness-110 text-stone-950 shadow-lg shadow-amber-500/20"
            >
              <Link href="/wardrobe" onClick={onClose}>
                <span>Step Into Your Wardrobe</span>
                <ArrowRight className="size-4 ml-1.5" />
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full sm:w-auto py-5 text-xs border-white/20 text-stone-300 hover:bg-white/10 hover:text-white"
            >
              Continue to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
