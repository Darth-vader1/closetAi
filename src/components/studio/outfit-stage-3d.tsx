"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Maximize2, Minimize2, RotateCcw, Play, Pause, Sun, Moon, Layers } from "lucide-react";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { categoryGroup } from "@/lib/wardrobe/categories";

interface OutfitStage3DProps {
  items: WardrobeItem[];
  imageUrls: Record<string, string>;
  className?: string;
  autoRotate?: boolean;
}

interface GarmentSlot {
  item: WardrobeItem;
  url: string;
  targetPos: THREE.Vector3;
  targetScale: THREE.Vector3;
  explodedOffset: THREE.Vector3;
}

export function OutfitStage3D({ items, imageUrls, className = "", autoRotate = true }: OutfitStage3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [spinning, setSpinning] = useState(autoRotate);
  const [exploded, setExploded] = useState(false);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  // References for animation state
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const stageGroupRef = useRef<THREE.Group | null>(null);
  const meshesRef = useRef<Array<{ mesh: THREE.Mesh; slot: GarmentSlot }>>([]);
  const animFrameRef = useRef<number | null>(null);

  // Drag interaction state
  const isDraggingRef = useRef(false);
  const prevMousePosRef = useRef({ x: 0, y: 0 });
  const targetRotationRef = useRef({ x: 0, y: 0 });
  const currentRotationRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 480;
    const height = container.clientHeight || 560;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 0.1, 5.2);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
    keyLight.position.set(4, 5, 4);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xdbeafe, 1.2, 10);
    rimLight.position.set(-4, 3, -3);
    scene.add(rimLight);

    // 5. Stage Platform / Pedestal
    const stageGroup = new THREE.Group();
    stageGroupRef.current = stageGroup;
    scene.add(stageGroup);

    // Ground reflective podium
    const podiumGeometry = new THREE.CylinderGeometry(1.6, 1.7, 0.08, 64);
    const podiumMaterial = new THREE.MeshStandardMaterial({
      color: isDarkTheme ? 0x1f242d : 0xf1ebe2,
      roughness: 0.35,
      metalness: 0.1,
    });
    const podium = new THREE.Mesh(podiumGeometry, podiumMaterial);
    podium.position.y = -2.1;
    stageGroup.add(podium);

    // Subtle outer halo ring
    const ringGeo = new THREE.RingGeometry(1.72, 1.76, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isDarkTheme ? 0x38bdf8 : 0xd97706,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -2.06;
    stageGroup.add(ring);

    // 6. Slots & Positioning for Garments
    const slots: GarmentSlot[] = [];
    const textureLoader = new THREE.TextureLoader();

    // Categorize
    const tops = items.filter((i) => categoryGroup(i.category) === "top");
    const bottoms = items.filter((i) => categoryGroup(i.category) === "bottom");
    const fullbodies = items.filter((i) => categoryGroup(i.category) === "fullbody" || categoryGroup(i.category) === "traditional");
    const shoes = items.filter((i) => categoryGroup(i.category) === "footwear");
    const outerwear = items.filter((i) => categoryGroup(i.category) === "outerwear");
    const accessories = items.filter((i) => categoryGroup(i.category) === "accessory");

    // Assign positions based on human anatomy in the 3D look
    // Outerwear (layer in front of torso)
    outerwear.forEach((item, idx) => {
      slots.push({
        item,
        url: imageUrls[item.imagePath] || "",
        targetPos: new THREE.Vector3(0, 0.75, 0.35 + idx * 0.1),
        targetScale: new THREE.Vector3(1.7, 1.7, 1),
        explodedOffset: new THREE.Vector3(0, 0.2, 0.8),
      });
    });

    // Fullbody dress or traditional
    if (fullbodies.length > 0) {
      fullbodies.forEach((item) => {
        slots.push({
          item,
          url: imageUrls[item.imagePath] || "",
          targetPos: new THREE.Vector3(0, 0.15, 0.1),
          targetScale: new THREE.Vector3(1.6, 2.2, 1),
          explodedOffset: new THREE.Vector3(0, 0.1, 0.5),
        });
      });
    } else {
      // Tops
      tops.forEach((item, idx) => {
        slots.push({
          item,
          url: imageUrls[item.imagePath] || "",
          targetPos: new THREE.Vector3(0, 0.7, 0.08 + idx * 0.06),
          targetScale: new THREE.Vector3(1.5, 1.5, 1),
          explodedOffset: new THREE.Vector3(0, 0.2, 0.4),
        });
      });

      // Bottoms
      bottoms.forEach((item, idx) => {
        slots.push({
          item,
          url: imageUrls[item.imagePath] || "",
          targetPos: new THREE.Vector3(0, -0.65, 0.02 + idx * 0.05),
          targetScale: new THREE.Vector3(1.4, 1.6, 1),
          explodedOffset: new THREE.Vector3(0, -0.1, -0.3),
        });
      });
    }

    // Footwear (grounded on pedestal)
    shoes.forEach((item, idx) => {
      slots.push({
        item,
        url: imageUrls[item.imagePath] || "",
        targetPos: new THREE.Vector3(0, -1.6, 0.2 + idx * 0.05),
        targetScale: new THREE.Vector3(1.1, 0.9, 1),
        explodedOffset: new THREE.Vector3(0, -0.3, 0.6),
      });
    });

    // Accessories (floating stylishly off to the side)
    accessories.forEach((item, idx) => {
      const side = idx % 2 === 0 ? 1.25 : -1.25;
      slots.push({
        item,
        url: imageUrls[item.imagePath] || "",
        targetPos: new THREE.Vector3(side, 0.35 + idx * 0.25, 0.25),
        targetScale: new THREE.Vector3(0.9, 0.9, 1),
        explodedOffset: new THREE.Vector3(side * 1.4, 0.3, 0.5),
      });
    });

    // Fallback: If no recognized category mapping matched, arrange vertically
    if (slots.length === 0) {
      items.forEach((item, idx) => {
        const y = 1.0 - idx * 0.9;
        slots.push({
          item,
          url: imageUrls[item.imagePath] || "",
          targetPos: new THREE.Vector3(0, y, idx * 0.1),
          targetScale: new THREE.Vector3(1.4, 1.4, 1),
          explodedOffset: new THREE.Vector3(0, 0, idx * 0.4),
        });
      });
    }

    const planeGeo = new THREE.PlaneGeometry(1, 1);
    const createdMeshes: Array<{ mesh: THREE.Mesh; slot: GarmentSlot }> = [];

    slots.forEach((slot) => {
      if (!slot.url) return;

      textureLoader.load(
        slot.url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.generateMipmaps = true;

          const aspect = tex.image.width ? tex.image.width / tex.image.height : 1;
          const mat = new THREE.MeshStandardMaterial({
            map: tex,
            transparent: true,
            roughness: 0.6,
            metalness: 0.05,
            side: THREE.DoubleSide,
            alphaTest: 0.05,
          });

          const mesh = new THREE.Mesh(planeGeo, mat);
          mesh.position.copy(slot.targetPos);
          mesh.scale.set(slot.targetScale.x * aspect, slot.targetScale.y, 1);

          stageGroup.add(mesh);
          createdMeshes.push({ mesh, slot });
          setLoadedCount((c) => c + 1);
        },
        undefined,
        (err) => console.warn("Could not load 3D garment texture:", err),
      );
    });

    meshesRef.current = createdMeshes;

    // 7. Interaction Handlers
    const onMouseDown = (e: MouseEvent) => {
      isDraggingRef.current = true;
      prevMousePosRef.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - prevMousePosRef.current.x;
      const dy = e.clientY - prevMousePosRef.current.y;
      prevMousePosRef.current = { x: e.clientX, y: e.clientY };

      targetRotationRef.current.y += dx * 0.008;
      targetRotationRef.current.x = Math.max(-0.4, Math.min(0.4, targetRotationRef.current.x + dy * 0.005));
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
    };

    // Touch handlers for mobile
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDraggingRef.current = true;
        prevMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - prevMousePosRef.current.x;
      const dy = e.touches[0].clientY - prevMousePosRef.current.y;
      prevMousePosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };

      targetRotationRef.current.y += dx * 0.008;
      targetRotationRef.current.x = Math.max(-0.4, Math.min(0.4, targetRotationRef.current.x + dy * 0.005));
    };

    const onTouchEnd = () => {
      isDraggingRef.current = false;
    };

    const dom = renderer.domElement;
    dom.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    dom.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);

    // 8. Animation Loop
    const startTime = performance.now();

    const animate = () => {
      const elapsed = (performance.now() - startTime) * 0.001;

      // Auto-spin if active and not dragging
      if (spinning && !isDraggingRef.current) {
        targetRotationRef.current.y += 0.006;
      }

      // Smooth lerp rotation
      currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * 0.08;
      currentRotationRef.current.y += (targetRotationRef.current.y - currentRotationRef.current.y) * 0.08;

      if (stageGroupRef.current) {
        stageGroupRef.current.rotation.y = currentRotationRef.current.y;
        stageGroupRef.current.rotation.x = currentRotationRef.current.x;

        // Gentle idle breathing floating motion
        stageGroupRef.current.position.y = Math.sin(elapsed * 1.5) * 0.04;
      }

      // Animate layer explosion / collapse
      meshesRef.current.forEach(({ mesh, slot }) => {
        const dest = exploded
          ? slot.targetPos.clone().add(slot.explodedOffset)
          : slot.targetPos;
        mesh.position.lerp(dest, 0.08);
      });

      renderer.render(scene, camera);
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // 9. Resize Observer
    const ro = new ResizeObserver((entries) => {
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
    ro.observe(container);

    return () => {
      ro.disconnect();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      dom.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      dom.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      renderer.dispose();
      podiumGeometry.dispose();
      ringGeo.dispose();
      planeGeo.dispose();
      container.innerHTML = "";
    };
  }, [items, imageUrls, isDarkTheme]);

  const resetView = () => {
    targetRotationRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      className={`relative select-none overflow-hidden rounded-2xl border transition-colors duration-500 ${
        isDarkTheme
          ? "border-neutral-800 bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100"
          : "border-border/60 bg-gradient-to-b from-[#fbf8f3] via-[#f7f2ea] to-[#f0e9dd] text-foreground"
      } ${className}`}
    >
      {/* 3D WebGL Canvas */}
      <div ref={mountRef} className="h-[480px] w-full cursor-grab active:cursor-grabbing sm:h-[540px]" />

      {/* Floating Header / Hint */}
      <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-border/40 bg-background/70 px-3 py-1.5 text-xs font-medium backdrop-blur-md">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
        <span>3D Lookbook Stage · Drag to Orbit 360°</span>
      </div>

      {/* Floating Control Toolbar */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/80 p-1.5 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={() => setExploded(!exploded)}
          title={exploded ? "Collapse Layers" : "Explode / Separate Layers in 3D"}
          className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors ${
            exploded ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{exploded ? "Collapse" : "Spread Layers"}</span>
        </button>

        <button
          type="button"
          onClick={() => setSpinning(!spinning)}
          title={spinning ? "Pause 360° Turntable" : "Start 360° Turntable"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {spinning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={resetView}
          title="Reset Camera Angle"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => setIsDarkTheme(!isDarkTheme)}
          title={isDarkTheme ? "Switch to Day Studio" : "Switch to Night Gallery"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {isDarkTheme ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Item count tag */}
      <div className="pointer-events-none absolute bottom-4 left-4 text-[11px] font-medium text-muted-foreground">
        {items.length} pieces assembled in 3D
      </div>
    </div>
  );
}
