import { describe, it, expect, vi } from "vitest";
import { geocodePlace, getPlanWeather } from "./service";

// Mock fetch globally
global.fetch = vi.fn();

describe("Weather Service", () => {
  describe("geocodePlace", () => {
    it("returns built-in coordinates for known cities", async () => {
      const result = await geocodePlace("Lagos");
      expect(result).toBeTruthy();
      expect(result?.lat).toBeCloseTo(6.5244, 2);
      expect(result?.lon).toBeCloseTo(3.3792, 2);
    });

    it("returns null for empty query", async () => {
      const result = await geocodePlace("");
      expect(result).toBeNull();
    });

    it("returns null for very short query", async () => {
      const result = await geocodePlace("X");
      expect(result).toBeNull();
    });

    it("handles API failure gracefully", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error("Network error"));

      const result = await geocodePlace("UnknownPlace12345");
      expect(result).toBeNull();
    });

    it("tries Open-Meteo API", async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              latitude: 51.5074,
              longitude: -0.1278,
              name: "London",
              country: "United Kingdom",
            },
          ],
        }),
      } as Response);

      const result = await geocodePlace("London");
      expect(result).toBeTruthy();
      expect(result?.lat).toBeCloseTo(51.5074, 2);
      expect(result?.lon).toBeCloseTo(-0.1278, 2);
    });

    it("falls back to Nominatim when Open-Meteo fails", async () => {
      // Open-Meteo returns empty
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        } as Response)
        // Nominatim succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              lat: "6.6774",
              lon: "3.1615",
              display_name: "University of Lagos, Akoka, Lagos, Nigeria",
            },
          ],
        } as Response);

      const result = await geocodePlace("University of Lagos");
      expect(result).toBeTruthy();
      expect(result?.lat).toBeCloseTo(6.6774, 2);
    });

    it("returns null when all geocoding fails", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as Response);

      const result = await geocodePlace("NonExistentPlace999");
      expect(result).toBeNull();
    });
  });

  describe("getPlanWeather", () => {
    it("returns notice when location cannot be resolved", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ results: [] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [],
        } as Response);

      const result = await getPlanWeather("FakeCity123", "2026-10-15", 7);

      expect(result.resolvedName).toBeNull();
      expect(result.notice).toBeTruthy();
      expect(result.notice).toContain("Couldn't find the weather");
      expect(result.notice).toContain("FakeCity123");
      expect(result.daysBeyondForecast).toBe(7);
      expect(result.forecast.length).toBe(0);
    });

    it("includes seasonal norms notice for long stays", async () => {
      // Mock successful geocoding
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [
              {
                latitude: 48.8566,
                longitude: 2.3522,
                name: "Paris",
                country: "France",
              },
            ],
          }),
        } as Response)
        // Mock forecast API (returns 16 days but plan is 30)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            daily: {
              time: Array.from({ length: 16 }, (_, i) => {
                const d = new Date("2026-10-15");
                d.setDate(d.getDate() + i);
                return d.toISOString().slice(0, 10);
              }),
              temperature_2m_max: Array(16).fill(15),
              temperature_2m_min: Array(16).fill(8),
              precipitation_probability_max: Array(16).fill(30),
              weather_code: Array(16).fill(1),
            },
          }),
        } as Response)
        // Mock seasonal API
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            daily: {
              temperature_2m_max: Array(14).fill(16),
              temperature_2m_min: Array(14).fill(9),
              precipitation_sum: Array(14).fill(0.5),
            },
          }),
        } as Response);

      const result = await getPlanWeather("Paris", "2026-10-15", 30);

      expect(result.resolvedName).toContain("Paris");
      expect(result.forecast.length).toBe(16); // Only 16 days in forecast window
      expect(result.daysBeyondForecast).toBe(14); // 30 - 16
      expect(result.seasonal).toBeTruthy();
      expect(result.notice).toBeTruthy();
      expect(result.notice).toContain("seasonal norms");
    });

    it("provides valid promptSummary for AI", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ latitude: 51.5, longitude: -0.1, name: "London", country: "UK" }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            daily: {
              time: ["2026-10-15", "2026-10-16", "2026-10-17"],
              temperature_2m_max: [18, 19, 17],
              temperature_2m_min: [12, 13, 11],
              precipitation_probability_max: [60, 70, 40],
              weather_code: [61, 61, 2],
            },
          }),
        } as Response);

      const result = await getPlanWeather("London", "2026-10-15", 3);

      expect(result.promptSummary).toBeTruthy();
      expect(typeof result.promptSummary).toBe("string");
      expect(result.promptSummary.length).toBeGreaterThan(20);
      expect(result.promptSummary).toContain("London");
    });

    it("sets weather flags correctly", async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            results: [{ latitude: 25, longitude: 55, name: "Dubai", country: "UAE" }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            daily: {
              time: ["2026-10-15", "2026-10-16", "2026-10-17"],
              temperature_2m_max: [38, 39, 40], // Hot
              temperature_2m_min: [28, 29, 30],
              precipitation_probability_max: [5, 5, 5], // Not rainy
              weather_code: [0, 0, 1],
            },
          }),
        } as Response);

      const result = await getPlanWeather("Dubai", "2026-10-15", 3);

      expect(result.flags.hot).toBe(true);
      expect(result.flags.cold).toBe(false);
      expect(result.flags.rainy).toBe(false);
    });

    it("never throws on error", async () => {
      vi.mocked(fetch).mockRejectedValue(new Error("Network failure"));

      const result = await getPlanWeather("AnyCity", "2026-10-15", 5);

      expect(result).toBeTruthy();
      expect(result.query).toBe("AnyCity");
    });
  });
});
