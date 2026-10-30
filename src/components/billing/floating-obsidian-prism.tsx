"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { RotateCcw } from "lucide-react";

interface FloatingObsidianPrismProps {
  className?: string;
  height?: number;
}

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
 * 3D Floating Premium Obsidian Diamond.
 * A luxury digital fashion artifact crafted with deep obsidian glass,
 * warm champagne gold wireframe accents, an emissive halo ring,
 * and an orbiting stardust constellation.
 */
export function FloatingObsidianPrism({
  className = "",
  height = 280,
}: FloatingObsidianPrismProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState(true);
  const [isInteracting, setIsInteracting] = useState(false);

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

    const width = container.clientWidth || 360;
    const canvasHeight = height;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      42,
      width / canvasHeight,
      0.1,
      100,
    );
    camera.position.set(0, 0.4, 4.4);
    camera.lookAt(0, 0.1, 0);

    // 2. Renderer with performance caps
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const maxDPR = isMobile ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDPR);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setSize(width, canvasHeight);
      renderer.setPixelRatio(dpr);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      rendererRef.current = renderer;
      container.appendChild(renderer.domElement);
    } catch {
      setHasWebGL(false);
      return;
    }

    // 3. Lighting Setup: Luxury Editorial Lighting
    const ambientLight = new THREE.AmbientLight(0xfff7ed, 1.2);
    scene.add(ambientLight);

    // Champagne Warm Key Light
    const keyLight = new THREE.DirectionalLight(0xfef3c7, 3.2);
    keyLight.position.set(4, 5, 4);
    scene.add(keyLight);

    // Terracotta Warm Accent Point Light
    const accentPointLight = new THREE.PointLight(0x9a4a2f, 3.5, 9);
    accentPointLight.position.set(-2.5, 1.5, 2);
    scene.add(accentPointLight);

    // Champagne Gold Sparkle Rim Light
    const goldRimLight = new THREE.PointLight(0xd4af37, 3.0, 8);
    goldRimLight.position.set(2, -1.5, 2.5);
    scene.add(goldRimLight);

    // 4. Floating Obsidian Prism Group
    const prismGroup = new THREE.Group();
    scene.add(prismGroup);

    // Solid Octahedron (Deep Obsidian Mirror Glass)
    const solidGeometry = new THREE.OctahedronGeometry(1.2, 0);
    const solidMaterial = new THREE.MeshStandardMaterial({
      color: 0x141210, // Deep polished obsidian
      roughness: 0.12,
      metalness: 0.88,
      transparent: true,
      opacity: 0.96,
    });
    const solidMesh = new THREE.Mesh(solidGeometry, solidMaterial);
    solidMesh.scale.set(1, 1.35, 1);
    prismGroup.add(solidMesh);

    // Champagne Gold Wireframe Cage
    const wireGeometry = new THREE.OctahedronGeometry(1.22, 0);
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0xd4af37, // Champagne gold
      wireframe: true,
      transparent: true,
      opacity: 0.85,
    });
    const wireMesh = new THREE.Mesh(wireGeometry, wireMaterial);
    wireMesh.scale.set(1, 1.35, 1);
    prismGroup.add(wireMesh);

    // Inner Glowing Core (Warm Terracotta Heart)
    const innerGeometry = new THREE.OctahedronGeometry(0.55, 0);
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: 0x9a4a2f, // Terracotta accent
      wireframe: true,
      transparent: true,
      opacity: 0.6,
    });
    const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
    innerMesh.scale.set(1, 1.25, 1);
    prismGroup.add(innerMesh);

    // Orbiting Champagne Halo Ring
    const haloGeometry = new THREE.TorusGeometry(1.6, 0.02, 16, 64);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xd4af37,
      transparent: true,
      opacity: 0.75,
    });
    const haloMesh = new THREE.Mesh(haloGeometry, haloMaterial);
    haloMesh.rotation.x = Math.PI / 2.3;
    haloMesh.rotation.y = 0.2;
    prismGroup.add(haloMesh);

    // Secondary Terracotta Elliptical Ring
    const halo2Geometry = new THREE.TorusGeometry(1.85, 0.015, 16, 64);
    const halo2Material = new THREE.MeshBasicMaterial({
      color: 0x9a4a2f,
      transparent: true,
      opacity: 0.5,
    });
    const halo2Mesh = new THREE.Mesh(halo2Geometry, halo2Material);
    halo2Mesh.rotation.x = Math.PI / 1.7;
    halo2Mesh.rotation.z = -0.3;
    prismGroup.add(halo2Mesh);

    // 5. Orbiting Stardust Particles
    const particleCount = isMobile ? 45 : 95;
    const particlePositions = new Float32Array(particleCount * 3);
    const particleVelocities: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i < particleCount; i++) {
      const radius = 1.6 + Math.random() * 1.8;
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;

      particlePositions[i * 3] = radius * Math.cos(theta) * Math.cos(phi);
      particlePositions[i * 3 + 1] = radius * Math.sin(phi);
      particlePositions[i * 3 + 2] = radius * Math.sin(theta) * Math.cos(phi);

      particleVelocities.push({
        x: (Math.random() - 0.5) * 0.003,
        y: 0.002 + Math.random() * 0.004,
        z: (Math.random() - 0.5) * 0.003,
      });
    }

    const particlesGeometry = new THREE.BufferGeometry();
    particlesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(particlePositions, 3),
    );

    // Champagne sparkle point texture
    const canvasTexture = document.createElement("canvas");
    canvasTexture.width = 32;
    canvasTexture.height = 32;
    const ctx = canvasTexture.getContext("2d");
    if (ctx) {
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, "rgba(255, 245, 215, 1)");
      gradient.addColorStop(0.4, "rgba(212, 175, 55, 0.7)");
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 32, 32);
    }
    const particleTexture = new THREE.CanvasTexture(canvasTexture);

    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.12,
      map: particleTexture,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particles);

    // 6. Interactive Drag & Motion Controls
    let isDragging = false;
    let prevPointerX = 0;
    let prevPointerY = 0;
    let angularVelocityY = 0;
    let angularVelocityX = 0;
    let userRotationY = 0;
    let userRotationX = 0;

    resetRotationRef.current = () => {
      userRotationY = 0;
      userRotationX = 0;
      angularVelocityY = 0;
      angularVelocityX = 0;
    };

    const handlePointerDown = (e: PointerEvent) => {
      isDragging = true;
      setIsInteracting(true);
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;
      angularVelocityY = 0;
      angularVelocityX = 0;
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevPointerX;
      const deltaY = e.clientY - prevPointerY;
      prevPointerX = e.clientX;
      prevPointerY = e.clientY;

      angularVelocityY = deltaX * 0.007;
      angularVelocityX = deltaY * 0.005;

      userRotationY += angularVelocityY;
      userRotationX += angularVelocityX;
      userRotationX = Math.max(-0.6, Math.min(0.6, userRotationX));
    };

    const handlePointerUp = () => {
      isDragging = false;
      setIsInteracting(false);
    };

    const domElement = renderer.domElement;
    domElement.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    // 7. Viewport & Tab Visibility Throttling
    let isVisibleInViewport = true;
    let isTabVisible = !document.hidden;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisibleInViewport = Boolean(entry?.isIntersecting);
      },
      { threshold: 0.1 },
    );
    observer.observe(container);

    const handleVisibilityChange = () => {
      isTabVisible = !document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 8. Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (!isVisibleInViewport || !isTabVisible) {
        return;
      }

      const delta = clock.getDelta();
      const elapsedTime = clock.getElapsedTime();

      // Inertia Damping
      if (!isDragging) {
        angularVelocityY *= 0.94;
        angularVelocityX *= 0.94;
        userRotationY += angularVelocityY;
        userRotationX += angularVelocityX;
      }

      // Continuous Idle Spin & Levitation Bobbing
      const idleSpinSpeed = prefersReducedMotion ? 0 : 0.65;
      prismGroup.rotation.y = userRotationY + (prefersReducedMotion ? 0 : elapsedTime * idleSpinSpeed);
      prismGroup.rotation.x = userRotationX + Math.sin(elapsedTime * 1.2) * 0.08;
      
      // Floating bob
      prismGroup.position.y = Math.sin(elapsedTime * 1.8) * 0.14;

      // Inner and halo complementary rotations
      innerMesh.rotation.y = -elapsedTime * 0.8;
      haloMesh.rotation.z = elapsedTime * 0.4;
      halo2Mesh.rotation.z = -elapsedTime * 0.35;

      // Orbiting Stardust Particles
      if (!prefersReducedMotion) {
        particles.rotation.y = elapsedTime * 0.18;
        const posAttr = particlesGeometry.attributes.position as THREE.BufferAttribute;
        const posArray = posAttr.array as Float32Array;

        for (let i = 0; i < particleCount; i++) {
          posArray[i * 3 + 1] += particleVelocities[i].y * 0.5;
          if (posArray[i * 3 + 1] > 2.5) {
            posArray[i * 3 + 1] = -2.2;
          }
        }
        posAttr.needsUpdate = true;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Handling
    const handleResize = () => {
      if (!container || !renderer) return;
      const newWidth = container.clientWidth;
      camera.aspect = newWidth / canvasHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, canvasHeight);
    };
    window.addEventListener("resize", handleResize);

    // 10. Complete Memory Disposal on Unmount
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }

      domElement.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      observer.disconnect();

      // Dispose Geometries & Materials
      [
        solidGeometry,
        wireGeometry,
        innerGeometry,
        haloGeometry,
        halo2Geometry,
        particlesGeometry,
      ].forEach((g) => g.dispose());

      [
        solidMaterial,
        wireMaterial,
        innerMaterial,
        haloMaterial,
        halo2Material,
        particlesMaterial,
      ].forEach((m) => m.dispose());

      particleTexture.dispose();
      renderer.dispose();

      if (domElement.parentElement === container) {
        container.removeChild(domElement);
      }
    };
  }, [height]);

  const handleResetRotation = useCallback(() => {
    resetRotationRef.current?.();
  }, []);

  return (
    <div
      className={`relative w-full flex items-center justify-center overflow-hidden rounded-2xl ${className}`}
      style={{ height }}
    >
      {hasWebGL ? (
        <div
          ref={mountRef}
          role="img"
          aria-label="3D Floating Obsidian Diamond Prism with Champagne Orbiting Rings. Drag horizontally to orbit 360 degrees."
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          style={{ touchAction: "pan-y" }}
        />
      ) : (
        /* Static High-Resolution Fallback */
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center select-none bg-surface-muted/30">
          <div className="size-16 rounded-full border border-accent/50 bg-accent-soft/30 text-accent shadow-md shadow-accent/20 flex items-center justify-center">
            <span className="text-3xl">💎</span>
          </div>
          <h4 className="mt-3 font-serif font-semibold text-foreground text-base">
            ClosetAI Premium Obsidian
          </h4>
        </div>
      )}

      {/* Interactivity Badge */}
      <div className="absolute top-2.5 left-3 pointer-events-none flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9.5px] font-bold tracking-widest uppercase bg-black/40 text-amber-200 border border-amber-300/30 backdrop-blur-xs">
          <span>Obsidian Atelier</span>
        </span>
        <span className="text-[10px] text-muted/80 hidden sm:inline">
          {isInteracting ? "360° Drag" : "Interactive Orbit"}
        </span>
      </div>

      {/* Reset Camera Button */}
      <div className="absolute bottom-2.5 right-3">
        <button
          type="button"
          onClick={handleResetRotation}
          title="Reset 3D perspective"
          className="size-6 inline-flex items-center justify-center rounded-full bg-black/40 hover:bg-black/60 text-white/80 hover:text-white border border-white/20 shadow-xs transition"
        >
          <RotateCcw className="size-3" />
        </button>
      </div>
    </div>
  );
}
