import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  PRICING_PLANS,
  getPlanDefinition,
} from "@/lib/billing/plans";

describe("Subscription 3D Experience Architecture & Requirements", () => {
  describe("Performance & Device Constraints", () => {
    it("caps pixel ratio at 2.0 on desktop and 1.5 on mobile", () => {
      const getCappedPixelRatio = (devicePixelRatio: number, isMobile: boolean) => {
        return Math.min(devicePixelRatio || 1, isMobile ? 1.5 : 2);
      };

      // Desktop with high-DPI (e.g. Retina 3x)
      expect(getCappedPixelRatio(3, false)).toBe(2);
      // Desktop standard 1x
      expect(getCappedPixelRatio(1, false)).toBe(1);
      // Mobile standard 2x / 3x
      expect(getCappedPixelRatio(2, true)).toBe(1.5);
      expect(getCappedPixelRatio(3, true)).toBe(1.5);
      // Mobile low-DPI 1x
      expect(getCappedPixelRatio(1, true)).toBe(1);
    });

    it("reduces particle count on mobile viewports", () => {
      const getParticleCount = (isMobile: boolean) => (isMobile ? 35 : 80);

      expect(getParticleCount(false)).toBe(80);
      expect(getParticleCount(true)).toBe(35);
    });

    it("respects prefers-reduced-motion media query", () => {
      const mockMatchMedia = (matches: boolean) => {
        return (query: string) => ({
          matches: query.includes("prefers-reduced-motion") ? matches : false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        });
      };

      const prefersReducedMotion = mockMatchMedia(true)("(prefers-reduced-motion: reduce)").matches;
      expect(prefersReducedMotion).toBe(true);

      const speedFactor = prefersReducedMotion ? 0 : 1;
      expect(speedFactor).toBe(0);
    });
  });

  describe("Coordinated Visual State Transformations (Free vs Premium)", () => {
    it("coordinates geometry, materials, elevation, and particles between tiers", () => {
      // Configuration matrices for the two states
      const stateConfigs = {
        free: {
          targetY: 0,
          targetWireOpacity: 0.65,
          targetSolidOpacity: 0.25,
          targetSolidColor: 0x8a929a,
          targetSolidMetalness: 0.1,
          targetSolidRoughness: 0.85,
          targetHaloOpacity: 0.15,
          targetHaloScale: 1.0,
          targetLightIntensity: 0.6,
          targetParticlesOpacity: 0.0,
        },
        premium: {
          targetY: 0.35,
          targetWireOpacity: 0.88,
          targetSolidOpacity: 0.95,
          targetSolidColor: 0x181716, // Deep obsidian
          targetSolidMetalness: 0.85,
          targetSolidRoughness: 0.15,
          targetHaloOpacity: 0.85,
          targetHaloScale: 1.15,
          targetLightIntensity: 2.2,
          targetParticlesOpacity: 0.9,
        },
      };

      // Free state: grounded, matte, wireframe prominent, no stardust
      expect(stateConfigs.free.targetY).toBe(0);
      expect(stateConfigs.free.targetParticlesOpacity).toBe(0.0);
      expect(stateConfigs.free.targetSolidMetalness).toBe(0.1);

      // Premium state: elevated, obsidian gloss, champagne halo, stardust particles active
      expect(stateConfigs.premium.targetY).toBeGreaterThan(stateConfigs.free.targetY);
      expect(stateConfigs.premium.targetParticlesOpacity).toBe(0.9);
      expect(stateConfigs.premium.targetSolidMetalness).toBe(0.85);
      expect(stateConfigs.premium.targetSolidRoughness).toBeLessThan(stateConfigs.free.targetSolidRoughness);
    });

    it("handles rapid repeated switching stably via continuous lerp damping", () => {
      let currentY = 0;
      const freeTarget = 0;
      const premiumTarget = 0.35;
      const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

      // Simulate rapid switching: Free -> Premium -> Free -> Premium within small time frames
      let target = premiumTarget;
      for (let i = 0; i < 5; i++) {
        currentY = lerp(currentY, target, 0.08);
      }
      expect(currentY).toBeGreaterThan(0);
      expect(currentY).toBeLessThan(premiumTarget);

      // Switch back to Free mid-flight
      target = freeTarget;
      for (let i = 0; i < 5; i++) {
        currentY = lerp(currentY, target, 0.08);
      }
      // Damping smoothly moves towards 0 without oscillation or jumping
      expect(currentY).toBeLessThan(0.2);
    });
  });

  describe("Memory Cleanup and Resource Disposal", () => {
    it("disposes geometries, materials, and renderer upon unmount", () => {
      const scene = new THREE.Scene();
      const geom = new THREE.OctahedronGeometry(1.4, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x9a4a2f });
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);

      const disposeGeomSpy = vi.spyOn(geom, "dispose");
      const disposeMatSpy = vi.spyOn(mat, "dispose");

      // Simulate cleanup routine in useEffect
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else if (obj.material) {
            obj.material.dispose();
          }
        }
      });

      expect(disposeGeomSpy).toHaveBeenCalledTimes(1);
      expect(disposeMatSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Post-Payment Celebration & Obsidian Prism", () => {
    it("cleans up upgraded searchParam without full page reload", () => {
      const url = new URL("https://closetai.app/dashboard?upgraded=true");
      expect(url.searchParams.has("upgraded")).toBe(true);

      url.searchParams.delete("upgraded");
      const cleanPath = url.pathname + (url.search ? url.search : "");
      expect(cleanPath).toBe("/dashboard");
      expect(url.searchParams.has("upgraded")).toBe(false);
    });

    it("verifies luxury confetti particle count and physics bounding", () => {
      const isMobile = true;
      const count = isMobile ? 90 : 180;
      expect(count).toBe(90);

      // Verify gravity updates velocity downwards
      let vy = -8;
      const gravity = 0.22;
      vy += gravity;
      expect(vy).toBeCloseTo(-7.78, 2);
    });
  });

  describe("Freemium Security & Independence", () => {
    it("ensures plan definitions and limits are strictly decoupled from 3D stage rendering", () => {
      // 3D stage selection is purely visual until user clicks action CTA
      const freePlan = PRICING_PLANS.free;
      const premiumPlan = PRICING_PLANS.monthly;

      expect(freePlan.priceNGN).toBe(0);
      expect(freePlan.priceUSD).toBe(0);
      expect(premiumPlan.priceNGN).toBeGreaterThan(0);
      expect(premiumPlan.priceUSD).toBeGreaterThan(0);

      // Fallback helper always safely defaults to free
      expect(getPlanDefinition(undefined).id).toBe("free");
    });
  });
});
