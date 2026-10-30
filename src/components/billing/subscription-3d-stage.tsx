"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { Sparkles, Layers, RotateCcw } from "lucide-react";

interface Subscription3DStageProps {
  selectedTier: "free" | "premium";
  onSelectTier?: (tier: "free" | "premium") => void;
  className?: string;
}

/**
 * Checks whether WebGL is supported in the current browser environment.
 */
function isWebGLAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

/**
 * Interactive Three.js Fashion Atelier Capsule Stage.
 *
 * Visually communicates the transition between ClosetAI Free (minimalist titanium/wireframe)
 * and ClosetAI Premium (crystallized obsidian & warm champagne gold with stardust particles).
 */
export function Subscription3DStage({
  selectedTier,
  onSelectTier,
  className = "",
}: Subscription3DStageProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState(true);
  const [isInteracting, setIsInteracting] = useState(false);

  // Sync tier state without triggering re-renders in the Three.js loop
  const tierRef = useRef(selectedTier);
  useEffect(() => {
    tierRef.current = selectedTier;
  }, [selectedTier]);

  const animFrameRef = useRef<number | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const resetRotationRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    if (!isWebGLAvailable()) {
      setHasWebGL(false);
      return;
    }

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 260;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

    // Detect user accessibility preference
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(0, 0.6, 4.4);
    camera.lookAt(0, 0.1, 0);

    // 2. Renderer with performance caps
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      setHasWebGL(false);
      return;
    }

    renderer.setSize(width, height);
    const maxPr = isMobile ? 1.5 : 2.0;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPr));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 3. Lighting System
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff5eb, 1.8);
    keyLight.position.set(3.5, 4.0, 3.0);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xf5d0b5, 1.4, 8);
    rimLight.position.set(-3.0, 2.5, -2.5);
    scene.add(rimLight);

    const bottomHaloLight = new THREE.PointLight(0x9a4a2f, 0, 5);
    bottomHaloLight.position.set(0, -0.6, 0);
    scene.add(bottomHaloLight);

    // 4. Main Stage Root Group
    const stageGroup = new THREE.Group();
    stageGroup.position.y = -0.15;
    scene.add(stageGroup);

    // 5. Dual-Tier Podium Base
    const podiumGeo = new THREE.CylinderGeometry(1.4, 1.5, 0.08, 48);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0x1c1715,
      roughness: 0.25,
      metalness: 0.4,
    });
    const podiumMesh = new THREE.Mesh(podiumGeo, podiumMat);
    podiumMesh.position.y = -0.7;
    stageGroup.add(podiumMesh);

    // Inlaid Emissive Halo Ring
    const haloGeo = new THREE.RingGeometry(1.42, 1.48, 48);
    const haloMat = new THREE.MeshStandardMaterial({
      color: 0x9a4a2f,
      emissive: 0x9a4a2f,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      side: THREE.DoubleSide,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    haloMesh.rotation.x = -Math.PI / 2;
    haloMesh.position.y = -0.655;
    stageGroup.add(haloMesh);

    // 6. Sculptural Centerpiece: The Atelier Fashion Prism
    const centerpieceGroup = new THREE.Group();
    centerpieceGroup.position.y = 0.2;
    stageGroup.add(centerpieceGroup);

    // Outer Atelier Faceted Gemstone (Octahedral diamond structure)
    const gemGeo = new THREE.OctahedronGeometry(0.75, 0);
    const gemMat = new THREE.MeshStandardMaterial({
      color: 0x2e201b,
      roughness: 0.15,
      metalness: 0.5,
      emissive: 0x5a2314,
      emissiveIntensity: 0.25,
      flatShading: true,
    });
    const gemMesh = new THREE.Mesh(gemGeo, gemMat);
    gemMesh.scale.set(0.9, 1.25, 0.9);
    centerpieceGroup.add(gemMesh);

    // Architectural Wireframe Cage (Visible in Free tier, subtle accent in Premium)
    const wireGeo = new THREE.OctahedronGeometry(0.82, 0);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xb5aca0,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const wireMesh = new THREE.Mesh(wireGeo, wireMat);
    wireMesh.scale.set(0.9, 1.25, 0.9);
    centerpieceGroup.add(wireMesh);

    // Ethereal Floating Fashion Ring (Horizontal golden orbital ribbon)
    const orbitRingGeo = new THREE.TorusGeometry(1.05, 0.018, 16, 64);
    const orbitRingMat = new THREE.MeshStandardMaterial({
      color: 0xd4a373,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0xd4a373,
      emissiveIntensity: 0.2,
    });
    const orbitRingMesh = new THREE.Mesh(orbitRingGeo, orbitRingMat);
    orbitRingMesh.rotation.x = Math.PI / 3;
    centerpieceGroup.add(orbitRingMesh);

    // Delicate Top Atelier Finial Hook
    const hookGeo = new THREE.TorusGeometry(0.18, 0.016, 16, 32, Math.PI * 1.3);
    const hookMesh = new THREE.Mesh(hookGeo, orbitRingMat);
    hookMesh.position.y = 1.05;
    hookMesh.rotation.z = Math.PI * 0.1;
    centerpieceGroup.add(hookMesh);

    // 7. Stardust Embers Particle System (Premium celebration)
    const particleCount = isMobile ? 24 : 54;
    const particleGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    const velocities: Array<{ x: number; y: number; z: number; speed: number }> = [];

    for (let i = 0; i < particleCount; i++) {
      const radius = 0.4 + Math.random() * 1.4;
      const angle = Math.random() * Math.PI * 2;
      const y = -0.4 + Math.random() * 1.8;

      posArray[i * 3] = Math.cos(angle) * radius;
      posArray[i * 3 + 1] = y;
      posArray[i * 3 + 2] = Math.sin(angle) * radius;

      velocities.push({
        x: (Math.random() - 0.5) * 0.015,
        y: 0.004 + Math.random() * 0.008,
        z: (Math.random() - 0.5) * 0.015,
        speed: 0.008 + Math.random() * 0.012,
      });
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xfde3c8,
      size: 0.045,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const particlePoints = new THREE.Points(particleGeo, particleMat);
    stageGroup.add(particlePoints);

    // 8. Interaction State (Mouse & Touch Orbit with Damping)
    let isDragging = false;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let targetRotationY = 0;
    let targetRotationX = 0;
    let currentRotationY = 0;
    let currentRotationX = 0;

    resetRotationRef.current = () => {
      targetRotationY = 0;
      targetRotationX = 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      // Allow primary pointer interactions only
      if (e.button !== 0 && e.pointerType === "mouse") return;
      isDragging = true;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
      setIsInteracting(true);
      dom.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevPointerX;
      const deltaY = e.clientY - prevPointerY;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;

      targetRotationY += deltaX * 0.008;
      targetRotationX += deltaY * 0.004;
      // Clamp vertical tilt so the stage doesn't flip upside down
      targetRotationX = Math.max(-0.25, Math.min(0.35, targetRotationX));
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      setIsInteracting(false);
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture was already released
      }
    };

    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerUp);

    // 9. Viewport & Visibility Observers (Pause when off-screen or tab hidden)
    let isIntersecting = true;
    let isTabVisible = true;

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isIntersecting = Boolean(entry?.isIntersecting);
      },
      { threshold: 0.05 },
    );
    intersectionObserver.observe(container);

    const onVisibilityChange = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // 10. Animation & Metamorphosis Loop
    let clock = new THREE.Clock();
    let currentElevateY = 0.2;
    let previousTier = tierRef.current;
    let burstIntensity = 0;

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      // Save GPU/CPU cycles when offscreen or inactive
      if (!isIntersecting || !isTabVisible) return;

      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();
      const activeTier = tierRef.current;

      // Detect transition trigger for burst effect
      if (activeTier !== previousTier) {
        if (activeTier === "premium") {
          burstIntensity = prefersReducedMotion ? 0 : 1.0;
        }
        previousTier = activeTier;
      }

      // Decaying burst impulse
      if (burstIntensity > 0) {
        burstIntensity = Math.max(0, burstIntensity - delta * 1.8);
      }

      // Tier Target Lerps
      const isPremium = activeTier === "premium";
      const targetElevate = isPremium ? 0.38 : 0.12;
      const targetGemScale = isPremium ? 1.05 : 0.72;
      const targetWireOpacity = isPremium ? 0.25 : 0.65;
      const targetParticleOpacity = isPremium ? 0.85 : 0.05;
      const targetPodiumColor = isPremium ? 0x1c1715 : 0xd8d1c5;
      const targetHaloColor = isPremium ? 0x9a4a2f : 0xb5aca0;
      const targetHaloIntensity = isPremium ? 0.85 : 0.0;
      const targetHaloLightIntensity = isPremium ? 1.2 : 0.0;
      const targetKeyIntensity = isPremium ? 2.0 : 1.3;

      // Smooth interpolation factors
      const LERP_SPEED = 0.06;
      currentElevateY += (targetElevate - currentElevateY) * LERP_SPEED;

      // Vertical hover oscillation
      const hoverOffset = prefersReducedMotion
        ? 0
        : Math.sin(elapsed * 1.8) * (isPremium ? 0.04 : 0.015);

      centerpieceGroup.position.y = currentElevateY + hoverOffset;

      // Scale & wireframe transitions
      gemMesh.scale.lerp(
        new THREE.Vector3(targetGemScale * 0.9, targetGemScale * 1.25, targetGemScale * 0.9),
        LERP_SPEED,
      );
      wireMesh.scale.copy(gemMesh.scale).multiplyScalar(1.04);
      wireMat.opacity += (targetWireOpacity - wireMat.opacity) * LERP_SPEED;
      particleMat.opacity += (targetParticleOpacity - particleMat.opacity) * LERP_SPEED;

      // Material colors & emissive shifts
      podiumMat.color.lerp(new THREE.Color(targetPodiumColor), LERP_SPEED);
      haloMat.color.lerp(new THREE.Color(targetHaloColor), LERP_SPEED);
      haloMat.emissive.lerp(new THREE.Color(targetHaloColor), LERP_SPEED);
      haloMat.emissiveIntensity +=
        (targetHaloIntensity - haloMat.emissiveIntensity) * LERP_SPEED;
      bottomHaloLight.intensity +=
        (targetHaloLightIntensity - bottomHaloLight.intensity) * LERP_SPEED;
      keyLight.intensity += (targetKeyIntensity - keyLight.intensity) * LERP_SPEED;

      if (isPremium) {
        gemMat.color.lerp(new THREE.Color(0x351f18), LERP_SPEED);
        gemMat.emissive.lerp(new THREE.Color(0x732c1b), LERP_SPEED);
        gemMat.emissiveIntensity = 0.35 + Math.sin(elapsed * 2.2) * 0.08;
      } else {
        gemMat.color.lerp(new THREE.Color(0x7a736a), LERP_SPEED);
        gemMat.emissive.lerp(new THREE.Color(0x000000), LERP_SPEED);
        gemMat.emissiveIntensity = 0.0;
      }

      // Orbital rotation & drag damping
      if (!prefersReducedMotion && !isDragging) {
        const autoSpinSpeed = (isPremium ? 0.007 : 0.003) + burstIntensity * 0.025;
        targetRotationY += autoSpinSpeed;
      }

      currentRotationY += (targetRotationY - currentRotationY) * 0.08;
      currentRotationX += (targetRotationX - currentRotationX) * 0.08;

      stageGroup.rotation.y = currentRotationY;
      stageGroup.rotation.x = currentRotationX;

      // Centerpiece secondary counter-rotation for visual depth
      if (!prefersReducedMotion) {
        orbitRingMesh.rotation.z = elapsed * (isPremium ? 0.8 : 0.2);
        centerpieceGroup.rotation.y = -elapsed * 0.15;
      }

      // Stardust particle animation
      if (particleMat.opacity > 0.02) {
        const positions = particleGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < particleCount; i++) {
          const idx = i * 3;
          const vel = velocities[i];

          // Outward radial impulse during burst
          if (burstIntensity > 0.01) {
            positions[idx] += vel.x * burstIntensity * 6;
            positions[idx + 2] += vel.z * burstIntensity * 6;
          }

          // Gentle vertical rise & orbit
          positions[idx + 1] += vel.y;
          if (positions[idx + 1] > 1.8) {
            positions[idx + 1] = -0.3;
          }

          // Orbital precession around Y
          const x = positions[idx];
          const z = positions[idx + 2];
          const angle = vel.speed * (isPremium ? 1.0 : 0.3);
          positions[idx] = x * Math.cos(angle) - z * Math.sin(angle);
          positions[idx + 2] = x * Math.sin(angle) + z * Math.cos(angle);
        }
        particleGeo.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 11. Responsive Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const w = entry.contentRect.width;
      const h = entry.contentRect.height;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // 12. Complete Resource Cleanup on Unmount
    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);

      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerUp);

      renderer.dispose();
      podiumGeo.dispose();
      podiumMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      gemGeo.dispose();
      gemMat.dispose();
      wireGeo.dispose();
      wireMat.dispose();
      orbitRingGeo.dispose();
      orbitRingMat.dispose();
      hookGeo.dispose();
      particleGeo.dispose();
      particleMat.dispose();

      container.innerHTML = "";
    };
  }, []);

  const handleResetRotation = useCallback(() => {
    resetRotationRef.current?.();
  }, []);

  const isPremium = selectedTier === "premium";

  return (
    <div
      className={`relative w-full max-w-xl mx-auto overflow-hidden rounded-2xl border transition-all duration-500 ${
        isPremium
          ? "border-accent/40 bg-gradient-to-b from-accent-soft/20 via-surface to-surface shadow-lg shadow-accent/10"
          : "border-border/70 bg-gradient-to-b from-surface-muted/40 via-surface to-surface shadow-xs"
      } ${className}`}
    >
      {/* 3D WebGL Canvas or Static Fallback */}
      {hasWebGL ? (
        <div
          ref={mountRef}
          role="img"
          aria-label={`3D interactive ${isPremium ? "ClosetAI Premium luxury atelier prism" : "ClosetAI Free minimalist wireframe capsule"}. Drag horizontally to orbit.`}
          className="h-[210px] sm:h-[250px] w-full cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: "pan-y" }} // Essential: Prevents canvas drag from hijacking page scroll on phones
        />
      ) : (
        /* Static High-Resolution Fallback when WebGL is unavailable */
        <div className="h-[210px] sm:h-[250px] w-full flex flex-col items-center justify-center p-6 text-center select-none bg-surface-muted/30">
          <div
            className={`inline-flex items-center justify-center size-16 rounded-full border transition-all ${
              isPremium
                ? "border-accent/50 bg-accent-soft/30 text-accent shadow-md shadow-accent/20"
                : "border-border bg-surface text-muted"
            }`}
          >
            <Sparkles className="size-8" />
          </div>
          <h4 className="mt-3 font-serif font-semibold text-foreground text-sm sm:text-base">
            {isPremium ? "ClosetAI Premium Atelier" : "ClosetAI Free Studio"}
          </h4>
          <p className="mt-1 text-xs text-muted max-w-xs">
            {isPremium
              ? "Unlimited wardrobe capacity & high-context personal styling."
              : "Essential wardrobe cataloguing & weekly outfits."}
          </p>
        </div>
      )}

      {/* Floating State Badge & Interactivity Hint */}
      <div className="absolute top-3 left-3 pointer-events-none flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase transition-all backdrop-blur-xs border ${
            isPremium
              ? "border-accent/40 bg-accent text-accent-contrast shadow-xs"
              : "border-border bg-surface/90 text-muted shadow-xs"
          }`}
        >
          <Sparkles className="size-2.5" />
          <span>{isPremium ? "Premium Atelier" : "Free Studio"}</span>
        </span>
        <span className="text-[10px] text-muted hidden sm:inline">
          {isInteracting ? "Orbiting 360°" : "Drag to orbit"}
        </span>
      </div>

      {/* Quick Interactive Tier Selector Tabs on Stage */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-surface/90 border border-border/80 rounded-full p-0.5 shadow-xs backdrop-blur-xs">
        <button
          type="button"
          onClick={() => onSelectTier?.("free")}
          className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full transition-all ${
            !isPremium
              ? "bg-foreground text-background shadow-xs font-semibold"
              : "text-muted hover:text-foreground"
          }`}
        >
          Free
        </button>
        <button
          type="button"
          onClick={() => onSelectTier?.("premium")}
          className={`px-2.5 py-0.5 text-[11px] font-medium rounded-full transition-all flex items-center gap-1 ${
            isPremium
              ? "bg-accent text-accent-contrast shadow-xs font-semibold"
              : "text-muted hover:text-foreground"
          }`}
        >
          <Sparkles className="size-2.5" />
          <span>Premium</span>
        </button>
      </div>

      {/* Bottom Floating Reset View Control */}
      <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleResetRotation}
          title="Reset 3D perspective"
          className="size-6 inline-flex items-center justify-center rounded-full bg-surface/80 hover:bg-surface text-muted hover:text-foreground border border-border/70 shadow-xs transition"
        >
          <RotateCcw className="size-3" />
        </button>
      </div>

      {/* Bottom Feature Tag */}
      <div className="absolute bottom-2.5 left-3 pointer-events-none text-[10.5px] text-muted">
        {isPremium ? (
          <span className="font-medium text-accent">
            ✨ Obsidian Prism &middot; 100 outfits/mo &middot; 30 beautify/mo
          </span>
        ) : (
          <span>Titanium Wireframe &middot; 5 outfits/wk &middot; 30 items</span>
        )}
      </div>
    </div>
  );
}
