"use client";

import { useEffect, useRef, useState } from "react";

// ─── Garment definitions ──────────────────────────────────────────────────────
// Each garment is a CSS shape built from divs. No emoji, no SVG paths.
// Colors stay within the warm, editorial palette.
const GARMENTS = [
  { label: "Dress shirt",  type: "shirt",    body: "#d6c9b8", collar: "#c4b5a2", sleeve: "#c9baa8" },
  { label: "Knit sweater", type: "sweater",  body: "#8a7a5f", collar: "#7a6a50", sleeve: "#7d6e54" },
  { label: "Jacket",       type: "jacket",   body: "#4a5568", collar: "#3a4555", sleeve: "#424e60", lapel: "#5a6678" },
  { label: "Summer dress", type: "dress",    body: "#c4907a", collar: "#b8806a", strap: "#b87060" },
  { label: "Trousers",     type: "trousers", body: "#2f3a4a", crease: "#3a4a5a" },
] as const;

// ─── Garment shape components ─────────────────────────────────────────────────

function Shirt({ body, collar, sleeve }: { body: string; collar: string; sleeve: string }) {
  return (
    <div style={{ position: "relative", width: 52, height: 64 }}>
      {/* Left sleeve */}
      <div style={{
        position: "absolute", top: 8, left: -10, width: 18, height: 28,
        background: sleeve, borderRadius: "6px 2px 4px 6px",
        transform: "rotate(-8deg)", transformOrigin: "top right",
      }}/>
      {/* Right sleeve */}
      <div style={{
        position: "absolute", top: 8, right: -10, width: 18, height: 28,
        background: sleeve, borderRadius: "2px 6px 6px 4px",
        transform: "rotate(8deg)", transformOrigin: "top left",
      }}/>
      {/* Body */}
      <div style={{
        position: "absolute", top: 14, left: 4, right: 4, bottom: 0,
        background: body, borderRadius: "0 0 6px 6px",
      }}/>
      {/* Collar */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 18, height: 16, background: collar,
        borderRadius: "0 0 8px 8px", zIndex: 2,
      }}/>
      {/* Button line */}
      {[14, 24, 34, 44].map(y => (
        <div key={y} style={{
          position: "absolute", top: y, left: "50%", transform: "translateX(-50%)",
          width: 3, height: 3, borderRadius: "50%", background: "#a89880", zIndex: 3,
        }}/>
      ))}
    </div>
  );
}

function Sweater({ body, collar, sleeve }: { body: string; collar: string; sleeve: string }) {
  return (
    <div style={{ position: "relative", width: 54, height: 62 }}>
      {/* Left sleeve */}
      <div style={{
        position: "absolute", top: 10, left: -12, width: 20, height: 30,
        background: sleeve, borderRadius: "6px 2px 4px 8px",
        transform: "rotate(-10deg)", transformOrigin: "top right",
      }}/>
      {/* Right sleeve */}
      <div style={{
        position: "absolute", top: 10, right: -12, width: 20, height: 30,
        background: sleeve, borderRadius: "2px 6px 8px 4px",
        transform: "rotate(10deg)", transformOrigin: "top left",
      }}/>
      {/* Body */}
      <div style={{
        position: "absolute", top: 12, left: 2, right: 2, bottom: 0,
        background: body, borderRadius: "2px 2px 8px 8px",
      }}/>
      {/* Ribbed hem */}
      <div style={{
        position: "absolute", bottom: 0, left: 2, right: 2, height: 8,
        background: collar, borderRadius: "0 0 8px 8px", opacity: 0.7,
      }}/>
      {/* Round neck */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 22, height: 13, background: collar,
        borderRadius: "50% 50% 0 0", zIndex: 2,
      }}/>
    </div>
  );
}

function Jacket({ body, collar, sleeve, lapel }: { body: string; collar: string; sleeve: string; lapel: string }) {
  return (
    <div style={{ position: "relative", width: 56, height: 70 }}>
      {/* Left sleeve */}
      <div style={{
        position: "absolute", top: 12, left: -12, width: 20, height: 36,
        background: sleeve, borderRadius: "6px 2px 4px 8px",
        transform: "rotate(-6deg)", transformOrigin: "top right",
      }}/>
      {/* Right sleeve */}
      <div style={{
        position: "absolute", top: 12, right: -12, width: 20, height: 36,
        background: sleeve, borderRadius: "2px 6px 8px 4px",
        transform: "rotate(6deg)", transformOrigin: "top left",
      }}/>
      {/* Body */}
      <div style={{
        position: "absolute", top: 14, left: 2, right: 2, bottom: 0,
        background: body, borderRadius: "0 0 6px 6px",
      }}/>
      {/* Left lapel */}
      <div style={{
        position: "absolute", top: 8, left: 6, width: 14, height: 24,
        background: lapel, borderRadius: "6px 0 10px 2px",
        transform: "skewY(-8deg)",
      }}/>
      {/* Right lapel */}
      <div style={{
        position: "absolute", top: 8, right: 6, width: 14, height: 24,
        background: lapel, borderRadius: "0 6px 2px 10px",
        transform: "skewY(8deg)",
      }}/>
      {/* Collar */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: 20, height: 16, background: collar,
        borderRadius: "2px 2px 0 0", zIndex: 2,
      }}/>
      {/* Pocket flap */}
      <div style={{
        position: "absolute", top: 36, left: 10, width: 12, height: 4,
        background: lapel, borderRadius: 2, opacity: 0.8,
      }}/>
    </div>
  );
}

function Dress({ body, collar, strap }: { body: string; collar: string; strap: string }) {
  return (
    <div style={{ position: "relative", width: 48, height: 80 }}>
      {/* Left strap */}
      <div style={{
        position: "absolute", top: 0, left: 10, width: 8, height: 18,
        background: strap, borderRadius: "4px 4px 0 0",
      }}/>
      {/* Right strap */}
      <div style={{
        position: "absolute", top: 0, right: 10, width: 8, height: 18,
        background: strap, borderRadius: "4px 4px 0 0",
      }}/>
      {/* Bodice */}
      <div style={{
        position: "absolute", top: 14, left: 4, right: 4, height: 26,
        background: collar, borderRadius: "2px",
      }}/>
      {/* Skirt — flares out */}
      <div style={{
        position: "absolute", top: 38, left: -2, right: -2, bottom: 0,
        background: body, borderRadius: "0 0 12px 12px",
        clipPath: "polygon(8% 0%, 92% 0%, 100% 100%, 0% 100%)",
      }}/>
    </div>
  );
}

function Trousers({ body, crease }: { body: string; crease: string }) {
  return (
    <div style={{ position: "relative", width: 48, height: 78 }}>
      {/* Waistband */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 10,
        background: crease, borderRadius: "4px 4px 0 0",
      }}/>
      {/* Left leg */}
      <div style={{
        position: "absolute", top: 8, left: 0, width: 22, bottom: 0,
        background: body, borderRadius: "0 0 4px 4px",
      }}/>
      {/* Right leg */}
      <div style={{
        position: "absolute", top: 8, right: 0, width: 22, bottom: 0,
        background: body, borderRadius: "0 0 4px 4px",
      }}/>
      {/* Centre divide */}
      <div style={{
        position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
        width: 2, height: "70%", background: crease, opacity: 0.5,
      }}/>
      {/* Left crease */}
      <div style={{
        position: "absolute", top: 20, left: 10, width: 1, bottom: 8,
        background: crease, opacity: 0.35,
      }}/>
      {/* Right crease */}
      <div style={{
        position: "absolute", top: 20, right: 10, width: 1, bottom: 8,
        background: crease, opacity: 0.35,
      }}/>
    </div>
  );
}

// ─── Hanger component ─────────────────────────────────────────────────────────
function Hanger() {
  return (
    <svg viewBox="0 0 40 22" width={40} height={22} aria-hidden>
      {/* Hook */}
      <path d="M20 2 C20 2 20 0 22 0 C24 0 24 2 24 3 C24 6 20 8 20 8" fill="none" stroke="#8b7355" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Bar */}
      <line x1="20" y1="8" x2="2" y2="20" stroke="#8b7355" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="20" y1="8" x2="38" y2="20" stroke="#8b7355" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="2" y1="20" x2="38" y2="20" stroke="#8b7355" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

// ─── Garment shape dispatcher ─────────────────────────────────────────────────
function GarmentShape({ type, body, collar, sleeve, lapel, strap, crease }: {
  type: string;
  body: string;
  collar?: string;
  sleeve?: string;
  lapel?: string;
  strap?: string;
  crease?: string;
}) {
  if (type === "shirt")    return <Shirt    body={body} collar={collar!} sleeve={sleeve!}/>;
  if (type === "sweater")  return <Sweater  body={body} collar={collar!} sleeve={sleeve!}/>;
  if (type === "jacket")   return <Jacket   body={body} collar={collar!} sleeve={sleeve!} lapel={lapel!}/>;
  if (type === "dress")    return <Dress    body={body} collar={collar!} strap={strap!}/>;
  if (type === "trousers") return <Trousers body={body} crease={crease!}/>;
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function WardrobeHero() {
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Detect reduced-motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Open doors once per session
  useEffect(() => {
    if (reducedMotion) { setDoorsOpen(true); return; }
    let stored = false;
    try { stored = !!sessionStorage.getItem("closetai-doors-opened"); } catch { /* ok */ }
    if (stored) {
      setDoorsOpen(true);
    } else {
      const t = setTimeout(() => {
        setDoorsOpen(true);
        try { sessionStorage.setItem("closetai-doors-opened", "1"); } catch { /* ok */ }
      }, 600);
      return () => clearTimeout(t);
    }
  }, [reducedMotion]);

  // ── Layout constants ──
  const W = 320;
  const H = 400;
  const BORDER_R = 12;
  const WALL = 10;

  // Garment hanging positions — evenly spaced as percentages across the wardrobe width
  // Interior is ~94% of width (3% margin each side)
  const positions = GARMENTS.map((_, i) => {
    const pct = 3 + (94 / (GARMENTS.length + 1)) * (i + 1);
    return `${pct}%`;
  });

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label="Animated wardrobe opening to reveal hanging clothes"
      className="mx-auto w-full select-none"
      style={{ maxWidth: W, aspectRatio: `${W} / ${H}` }}
    >
      {/* ── Outer shell — gives perspective context for 3D door rotation ── */}
      <div
        style={{
          position: "relative",
          width: "100%",
          paddingBottom: `${(H / W) * 100}%`,
          perspective: "900px",
          perspectiveOrigin: "50% 50%",
        }}
      >
        {/* Absolute inner that fills the padding-box */}
        <div style={{ position: "absolute", inset: 0 }}>

          {/* ── Wardrobe frame (back + sides) ── */}
          <div style={{
            position: "absolute", inset: 0,
            background: "#e8ddd0",
            borderRadius: BORDER_R,
            boxShadow: "0 8px 40px rgba(60,40,20,0.18), inset 0 0 0 2px #cfc6b8",
          }}>
            {/* Wood-grain stripes */}
            {[0.18, 0.38, 0.56, 0.72, 0.86].map((pct, i) => (
              <div key={i} style={{
                position: "absolute", inset: 0,
                borderRadius: BORDER_R,
                background: `linear-gradient(${88 + i * 4}deg, transparent ${pct * 100 - 1}%, #d5c9b8 ${pct * 100}%, transparent ${pct * 100 + 1}%)`,
                opacity: 0.45,
                pointerEvents: "none",
              }}/>
            ))}

            {/* Interior back panel */}
            <div style={{
              position: "absolute",
              top: WALL, left: WALL, right: WALL, bottom: WALL,
              background: "#faf7f2",
              borderRadius: BORDER_R - 4,
              boxShadow: "inset 0 2px 12px rgba(60,40,20,0.08)",
            }}>
              {/* Hanging rail */}
              <div style={{
                position: "absolute",
                top: "14%",
                left: 4, right: 4, height: 6,
                background: "linear-gradient(180deg, #a08060 0%, #7a6040 100%)",
                borderRadius: 3,
                boxShadow: "0 2px 6px rgba(60,40,20,0.25)",
                opacity: doorsOpen ? 1 : 0,
                transition: reducedMotion ? "none" : "opacity 0.4s ease 0.8s",
              }}>
                {/* Rail end caps */}
                <div style={{ position: "absolute", left: -3, top: -3, width: 12, height: 12, borderRadius: "50%", background: "#9a4a2f", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}/>
                <div style={{ position: "absolute", right: -3, top: -3, width: 12, height: 12, borderRadius: "50%", background: "#9a4a2f", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }}/>
              </div>

              {/* Bottom shelf */}
              <div style={{
                position: "absolute",
                bottom: 28, left: 0, right: 0, height: 6,
                background: "#d8cfc4",
                boxShadow: "0 -1px 4px rgba(60,40,20,0.10)",
              }}/>
              {/* Shelf shadow */}
              <div style={{
                position: "absolute",
                bottom: 22, left: 0, right: 0, height: 6,
                background: "linear-gradient(180deg, rgba(60,40,20,0.08) 0%, transparent 100%)",
              }}/>
            </div>
          </div>

          {/* ── Garments (rendered behind doors via z-index) ── */}
          <div style={{ position: "absolute", top: "18%", left: 0, right: 0, zIndex: 2, pointerEvents: "none" }}>
            {GARMENTS.map((g, i) => {
              const delayS = reducedMotion ? 0 : 1.1 + i * 0.1;
              return (
                <div
                  key={g.label}
                  style={{
                    position: "absolute",
                    left: positions[i],
                    transform: "translateX(-50%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    opacity: doorsOpen ? 1 : 0,
                    transition: reducedMotion ? "none" : `opacity 0.5s ease ${delayS}s, transform 0.5s cubic-bezier(0.2,0.8,0.3,1) ${delayS}s`,
                    animation: (doorsOpen && !reducedMotion)
                      ? `garmentSway ${2.8 + i * 0.4}s ease-in-out ${delayS + 0.6}s infinite alternate`
                      : "none",
                  }}
                >
                  <Hanger />
                  <div style={{ marginTop: 2 }}>
                    <GarmentShape
                      type={g.type}
                      body={g.body}
                      collar={"collar" in g ? g.collar : undefined}
                      sleeve={"sleeve" in g ? g.sleeve : undefined}
                      lapel={"lapel" in g ? g.lapel : undefined}
                      strap={"strap" in g ? g.strap : undefined}
                      crease={"crease" in g ? g.crease : undefined}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── LEFT DOOR ── */}
          {/* Door uses transform-style:preserve-3d so the handle child inherits 3D space */}
          <div style={{
            position: "absolute",
            top: 0, left: 0,
            width: "50%", height: "100%",
            transformOrigin: "left center",
            transformStyle: "preserve-3d",
            transform: (doorsOpen && !reducedMotion) ? "rotateY(-108deg)" : "rotateY(0deg)",
            transition: reducedMotion ? "none" : "transform 1.3s cubic-bezier(0.4,0,0.2,1) 0s",
            zIndex: doorsOpen ? 3 : 10,
          }}>
            {/* Door face */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(160deg, #ede0cf 0%, #d8c9b4 60%, #c8b8a0 100%)",
              borderRadius: `${BORDER_R}px 2px 2px ${BORDER_R}px`,
              border: "2px solid #b8a080",
              boxShadow: "inset -4px 0 12px rgba(60,40,20,0.12)",
              overflow: "hidden",
            }}>
              {/* Wood grain */}
              {[0.25, 0.55, 0.78].map((pct, i) => (
                <div key={i} style={{
                  position: "absolute", inset: 0,
                  background: `linear-gradient(95deg, transparent ${pct * 100 - 1}%, rgba(160,120,70,0.18) ${pct * 100}%, transparent ${pct * 100 + 2}%)`,
                }}/>
              ))}
              {/* Panel recesses — top and bottom decorative insets */}
              <div style={{
                position: "absolute", top: 14, left: 12, right: 12, height: "36%",
                border: "1.5px solid #c0aa88", borderRadius: 6,
                boxShadow: "inset 0 1px 4px rgba(60,40,20,0.10)",
              }}/>
              <div style={{
                position: "absolute", bottom: 14, left: 12, right: 12, top: "52%",
                border: "1.5px solid #c0aa88", borderRadius: 6,
                boxShadow: "inset 0 1px 4px rgba(60,40,20,0.10)",
              }}/>
            </div>
            {/* Handle — positioned on the right edge of the left door */}
            <div style={{
              position: "absolute", top: "50%", right: 10,
              transform: "translateY(-50%)",
              width: 10, height: 36,
              background: "linear-gradient(180deg, #b07050 0%, #9a4a2f 50%, #b07050 100%)",
              borderRadius: 5,
              boxShadow: "1px 0 4px rgba(60,20,0,0.30)",
            }}/>
          </div>

          {/* ── RIGHT DOOR ── */}
          <div style={{
            position: "absolute",
            top: 0, right: 0,
            width: "50%", height: "100%",
            transformOrigin: "right center",
            transformStyle: "preserve-3d",
            transform: (doorsOpen && !reducedMotion) ? "rotateY(108deg)" : "rotateY(0deg)",
            transition: reducedMotion ? "none" : "transform 1.3s cubic-bezier(0.4,0,0.2,1) 0s",
            zIndex: doorsOpen ? 3 : 10,
          }}>
            {/* Door face */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(200deg, #ede0cf 0%, #d8c9b4 60%, #c8b8a0 100%)",
              borderRadius: `2px ${BORDER_R}px ${BORDER_R}px 2px`,
              border: "2px solid #b8a080",
              boxShadow: "inset 4px 0 12px rgba(60,40,20,0.12)",
              overflow: "hidden",
            }}>
              {/* Wood grain */}
              {[0.25, 0.55, 0.78].map((pct, i) => (
                <div key={i} style={{
                  position: "absolute", inset: 0,
                  background: `linear-gradient(95deg, transparent ${pct * 100 - 1}%, rgba(160,120,70,0.18) ${pct * 100}%, transparent ${pct * 100 + 2}%)`,
                }}/>
              ))}
              {/* Panel recesses */}
              <div style={{
                position: "absolute", top: 14, left: 12, right: 12, height: "36%",
                border: "1.5px solid #c0aa88", borderRadius: 6,
                boxShadow: "inset 0 1px 4px rgba(60,40,20,0.10)",
              }}/>
              <div style={{
                position: "absolute", bottom: 14, left: 12, right: 12, top: "52%",
                border: "1.5px solid #c0aa88", borderRadius: 6,
                boxShadow: "inset 0 1px 4px rgba(60,40,20,0.10)",
              }}/>
            </div>
            {/* Handle */}
            <div style={{
              position: "absolute", top: "50%", left: 10,
              transform: "translateY(-50%)",
              width: 10, height: 36,
              background: "linear-gradient(180deg, #b07050 0%, #9a4a2f 50%, #b07050 100%)",
              borderRadius: 5,
              boxShadow: "-1px 0 4px rgba(60,20,0,0.30)",
            }}/>
          </div>

          {/* ── Wardrobe top crown ── */}
          <div style={{
            position: "absolute", top: -8, left: -6, right: -6, height: 18,
            background: "linear-gradient(180deg, #cfc0aa 0%, #e8ddd0 100%)",
            borderRadius: "8px 8px 0 0",
            boxShadow: "0 -2px 8px rgba(60,40,20,0.12)",
            zIndex: 11,
          }}/>

          {/* ── Wardrobe base plinth ── */}
          <div style={{
            position: "absolute", bottom: -10, left: -4, right: -4, height: 18,
            background: "linear-gradient(180deg, #e8ddd0 0%, #cfc0aa 100%)",
            borderRadius: "0 0 8px 8px",
            boxShadow: "0 4px 12px rgba(60,40,20,0.15)",
            zIndex: 11,
          }}>
            {/* Feet */}
            <div style={{ position: "absolute", bottom: -8, left: 18, width: 20, height: 10, background: "#c0aa88", borderRadius: "0 0 4px 4px" }}/>
            <div style={{ position: "absolute", bottom: -8, right: 18, width: 20, height: 10, background: "#c0aa88", borderRadius: "0 0 4px 4px" }}/>
          </div>

        </div>{/* /absolute inner */}
      </div>{/* /perspective wrapper */}
    </div>
  );
}
