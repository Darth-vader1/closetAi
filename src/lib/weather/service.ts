/**
 * Weather Service using Open-Meteo (100% Free, No API Key Required)
 * Geocodes city names and fetches live forecast data for clothing recommendations.
 */

import { FORECAST_WINDOW_DAYS, type PlanWeather, type PlanWeatherDay } from "@/lib/packing/schemas";

export interface WeatherForecast {
  city: string;
  temperatureC: number;
  condition: string;
  isRainy: boolean;
  isCold: boolean;
  isWarm: boolean;
  summary: string;
}

// Fallback coordinates for major cities if geocoding is unavailable
const CITY_COORDINATES: Record<string, { lat: number; lon: number }> = {
  lagos: { lat: 6.5244, lon: 3.3792 },
  abuja: { lat: 9.0765, lon: 7.3986 },
  london: { lat: 51.5074, lon: -0.1278 },
  "new york": { lat: 40.7128, lon: -74.006 },
  paris: { lat: 48.8566, lon: 2.3522 },
  toronto: { lat: 43.6532, lon: -79.3832 },
  accra: { lat: 5.6037, lon: -0.187 },
  nairobi: { lat: -1.2921, lon: 36.8219 },
};

/**
 * Geocode a city name into latitude & longitude using Open-Meteo's geocoding API.
 */
async function geocodeCity(city: string): Promise<{ lat: number; lon: number } | null> {
  const normalized = city.trim().toLowerCase();
  if (CITY_COORDINATES[normalized]) {
    return CITY_COORDINATES[normalized];
  }

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
      { next: { revalidate: 86400 } }, // cache geocoding for 24 hours
    );

    if (!res.ok) return null;
    const data = await res.json();
    if (data.results && data.results.length > 0) {
      return {
        lat: data.results[0].latitude,
        lon: data.results[0].longitude,
      };
    }
  } catch {
    // Return null on network error
  }

  return null;
}

/**
 * Fetch current live weather for a city or location string.
 */
export async function getLiveWeather(city?: string | null): Promise<WeatherForecast | null> {
  // No hardcoded fallback city: without a location we return null so the UI can ask for one.
  const targetCity = city?.trim();
  if (!targetCity) return null;
  const coords = (await geocodeCity(targetCity)) ?? (await geocodePlace(targetCity));
  if (!coords) return null;
  return getLiveWeatherByCoords(coords.lat, coords.lon, targetCity);
}

/**
 * Reverse geocode coordinates into a readable place name (e.g. "Ilorin, Kwara").
 * Falls back to null if the lookup fails.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10&accept-language=en`,
      {
        headers: { "User-Agent": "ClosetAI/1.0 (stylist weather; https://closet-ai-official.vercel.app)" },
        next: { revalidate: 86400 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: { city?: string; town?: string; village?: string; county?: string; state?: string };
    };
    const a = data.address;
    if (!a) return null;
    const place = a.city ?? a.town ?? a.village ?? a.county;
    return [place, a.state].filter(Boolean).join(", ") || null;
  } catch {
    return null;
  }
}

/**
 * Fetch current live weather for explicit coordinates (e.g. from the browser's geolocation).
 */
export async function getLiveWeatherByCoords(
  lat: number,
  lon: number,
  label?: string | null,
): Promise<WeatherForecast | null> {
  const targetCity = label?.trim() || (await reverseGeocode(lat, lon)) || "Your location";
  const coords = { lat, lon };

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&hourly=temperature_2m&timezone=auto`,
      { next: { revalidate: 1800 } }, // cache weather for 30 minutes
    );

    if (!res.ok) return null;
    const data = await res.json();
    const current = data.current;
    if (!current) return null;

    const temp = Math.round(current.temperature_2m);
    const code = current.weather_code ?? 0;
    const precipitation = current.precipitation ?? 0;

    // WMO Weather interpretation codes (0: Clear, 1-3: Partly Cloudy, 51-67: Rain, 71-77: Snow, 80-82: Showers, 95+: Thunderstorm)
    const isRainy = (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95 || precipitation > 0.5;
    const isCold = temp < 16;
    const isWarm = temp >= 24;

    let condition = "Clear & Pleasant";
    if (code === 0) condition = "Sunny & Clear";
    else if (code >= 1 && code <= 3) condition = "Partly Cloudy";
    else if (isRainy) condition = "Rain Showers";
    else if (code >= 71 && code <= 77) condition = "Snowy";

    let advice = "";
    if (isRainy) advice = "Rain today, skip suede or delicate fabrics and consider an umbrella or outer layer.";
    else if (isWarm) advice = "Warm weather, breathable natural fabrics (cotton, linen) recommended.";
    else if (isCold) advice = "Cool weather, light layering or an outer jacket suggested.";
    else advice = "Comfortable mild conditions, ideal for versatile layering.";

    return {
      city: targetCity,
      temperatureC: temp,
      condition,
      isRainy,
      isCold,
      isWarm,
      summary: `${targetCity}: ${temp}°C, ${condition}. ${advice}`,
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------------
// Planner weather: geocoding + forecast window + seasonal norms (used by the "Pack for..." planner)
// ------------------------------------------------------------------------------------------------

export interface GeocodedPlace {
  lat: number;
  lon: number;
  name: string;
}

const DAY_MS = 86_400_000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function isoToMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function todayMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function wmoCondition(code: number): string {
  if (code === 0) return "Sunny";
  if (code <= 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Foggy";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorms";
  return "Mixed";
}

async function openMeteoSearch(name: string, count: number) {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=${count}&language=en&format=json`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string; country?: string }>;
    };
    return data.results ?? [];
  } catch {
    return [];
  }
}

/**
 * Resolve a city, town or campus name to coordinates.
 * 1. Open-Meteo geocoder on the full string, then on the first comma segment (using the rest of the
 *    string, e.g. "Nigeria", to pick the right country).
 * 2. OpenStreetMap Nominatim, which also knows universities and campuses ("University of Lagos").
 * Returns null when nothing matches; callers must tell the user rather than guessing.
 */
export async function geocodePlace(query: string): Promise<GeocodedPlace | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const builtin = CITY_COORDINATES[q.toLowerCase()];
  if (builtin) return { ...builtin, name: q };

  const label = (r: { name: string; admin1?: string; country?: string }) =>
    [r.name, r.admin1, r.country].filter(Boolean).join(", ");

  const direct = await openMeteoSearch(q, 1);
  if (direct[0]) return { lat: direct[0].latitude, lon: direct[0].longitude, name: label(direct[0]) };

  const [head, ...rest] = q.split(",").map((s) => s.trim()).filter(Boolean);
  if (head && rest.length > 0) {
    const hint = rest.join(" ").toLowerCase();
    const candidates = await openMeteoSearch(head, 10);
    const match =
      candidates.find((c) => hint.includes((c.country ?? "").toLowerCase()) || hint.includes((c.admin1 ?? "").toLowerCase())) ??
      candidates[0];
    if (match) return { lat: match.latitude, lon: match.longitude, name: label(match) };
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=en`,
      {
        headers: { "User-Agent": "ClosetAI/1.0 (packing planner; https://closet-ai-official.vercel.app)" },
        next: { revalidate: 86400 },
      },
    );
    if (res.ok) {
      const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
      const first = data[0];
      if (first) {
        const lat = Number(first.lat);
        const lon = Number(first.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          return { lat, lon, name: first.display_name.split(",").slice(0, 3).join(",").trim() };
        }
      }
    }
  } catch {
    // fall through
  }
  return null;
}

function monthRangeLabel(fromMs: number, toMs: number): string {
  const a = new Date(fromMs).getUTCMonth();
  const b = new Date(toMs).getUTCMonth();
  return a === b ? MONTHS[a] : `${MONTHS[a]}–${MONTHS[b]}`;
}

async function fetchForecast(place: GeocodedPlace): Promise<PlanWeatherDay[] | null> {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code` +
        `&timezone=auto&forecast_days=${FORECAST_WINDOW_DAYS}`,
      { next: { revalidate: 3600 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: {
        time: string[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        precipitation_probability_max?: Array<number | null>;
        weather_code: number[];
      };
    };
    const d = data.daily;
    if (!d?.time?.length) return null;
    return d.time.map((date, i) => ({
      date,
      maxC: Math.round(d.temperature_2m_max[i]),
      minC: Math.round(d.temperature_2m_min[i]),
      rainChance: d.precipitation_probability_max?.[i] ?? null,
      condition: wmoCondition(d.weather_code[i] ?? 0),
    }));
  } catch {
    return null;
  }
}

/** Seasonal norms from the same calendar dates in the most recent fully-observed year. */
async function fetchSeasonal(place: GeocodedPlace, fromMs: number, toMs: number) {
  let shiftYears = 1;
  const limit = todayMs() - 7 * DAY_MS;
  const shift = (ms: number, years: number) => {
    const d = new Date(ms);
    d.setUTCFullYear(d.getUTCFullYear() - years);
    return d.getTime();
  };
  while (shift(toMs, shiftYears) > limit && shiftYears < 3) shiftYears++;
  const start = toIsoDate(shift(fromMs, shiftYears));
  const end = toIsoDate(shift(toMs, shiftYears));
  try {
    const res = await fetch(
      `https://archive-api.open-meteo.com/v1/archive?latitude=${place.lat}&longitude=${place.lon}` +
        `&start_date=${start}&end_date=${end}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: { temperature_2m_max: Array<number | null>; temperature_2m_min: Array<number | null>; precipitation_sum: Array<number | null> };
    };
    const d = data.daily;
    if (!d) return null;
    const avg = (xs: Array<number | null>) => {
      const vals = xs.filter((x): x is number => typeof x === "number");
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    };
    const precip = d.precipitation_sum.filter((x): x is number => typeof x === "number");
    return {
      avgMaxC: avg(d.temperature_2m_max),
      avgMinC: avg(d.temperature_2m_min),
      rainyDayShare: precip.length ? Math.round((precip.filter((p) => p >= 1).length / precip.length) * 100) / 100 : null,
    };
  } catch {
    return null;
  }
}

/**
 * Weather for a whole plan. Real forecast ONLY for the plan days inside the 16-day window; every
 * other day is described with seasonal norms and labelled as such. Never throws.
 */
export async function getPlanWeather(location: string, startDate: string, days: number): Promise<PlanWeather> {
  const planStart = isoToMs(startDate);
  const planEnd = planStart + (days - 1) * DAY_MS;
  const fullMonths = monthRangeLabel(planStart, planEnd);

  const place = await geocodePlace(location);
  if (!place) {
    return {
      query: location,
      resolvedName: null,
      forecast: [],
      daysBeyondForecast: days,
      seasonal: { monthLabel: fullMonths, avgMaxC: null, avgMinC: null, rainyDayShare: null, basis: "general_norms" },
      notice: `Couldn't find the weather for ${location}; using seasonal norms for ${fullMonths}.`,
      promptSummary: `Location "${location}" could not be resolved. No forecast available. Assume typical ${fullMonths} climate for that region.`,
      flags: { rainy: false, cold: false, hot: false },
    };
  }

  const forecastAll = (await fetchForecast(place)) ?? [];
  const forecast = forecastAll.filter((f) => {
    const ms = isoToMs(f.date);
    return ms >= planStart && ms <= planEnd;
  });
  const covered = new Set(forecast.map((f) => f.date));
  const daysBeyondForecast = days - covered.size;

  let seasonal: PlanWeather["seasonal"] = null;
  if (daysBeyondForecast > 0) {
    const lastForecastMs = forecast.length ? isoToMs(forecast[forecast.length - 1].date) : planStart - DAY_MS;
    const fromMs = Math.max(planStart, lastForecastMs + DAY_MS);
    const monthLabel = monthRangeLabel(fromMs, planEnd);
    const norms = await fetchSeasonal(place, fromMs, planEnd);
    seasonal = norms
      ? { monthLabel, ...norms, basis: "last_year_observed" }
      : { monthLabel, avgMaxC: null, avgMinC: null, rainyDayShare: null, basis: "general_norms" };
  }

  const fMax = forecast.length ? Math.round(forecast.reduce((a, f) => a + f.maxC, 0) / forecast.length) : null;
  const fMin = forecast.length ? Math.round(forecast.reduce((a, f) => a + f.minC, 0) / forecast.length) : null;
  const rainyForecastDays = forecast.filter((f) => (f.rainChance ?? 0) >= 60 || /rain|shower|thunder|drizzle/i.test(f.condition)).length;

  const maxRef = fMax ?? seasonal?.avgMaxC ?? null;
  const minRef = Math.min(fMin ?? Infinity, seasonal?.avgMinC ?? Infinity);
  const flags = {
    rainy: (forecast.length > 0 && rainyForecastDays / forecast.length >= 0.3) || (seasonal?.rainyDayShare ?? 0) >= 0.35,
    cold: Number.isFinite(minRef) ? minRef < 12 || (maxRef !== null && maxRef < 17) : false,
    hot: maxRef !== null && maxRef >= 30,
  };

  const parts: string[] = [`Resolved location: ${place.name}.`];
  if (forecast.length) {
    parts.push(
      `Forecast for ${forecast.length} of ${days} day(s) (${forecast[0].date} to ${forecast[forecast.length - 1].date}): ` +
        `highs ~${fMax}°C, lows ~${fMin}°C, ${rainyForecastDays} rainy day(s). Daily: ` +
        forecast.slice(0, 7).map((f) => `${f.date} ${f.minC}-${f.maxC}°C ${f.condition}`).join("; ") +
        (forecast.length > 7 ? "; ..." : "") +
        ".",
    );
  }
  if (seasonal) {
    parts.push(
      seasonal.basis === "last_year_observed"
        ? `For the remaining ${daysBeyondForecast} day(s) there is NO forecast; seasonal norms for ${seasonal.monthLabel}: ` +
            `highs ~${seasonal.avgMaxC ?? "?"}°C, lows ~${seasonal.avgMinC ?? "?"}°C, rain on ~${Math.round((seasonal.rainyDayShare ?? 0) * 100)}% of days.`
        : `For the remaining ${daysBeyondForecast} day(s) there is NO forecast; assume typical ${seasonal.monthLabel} climate for this region.`,
    );
  }

  let notice: string | null = null;
  if (seasonal && forecast.length === 0) {
    notice =
      forecastAll.length === 0
        ? `Couldn't load a forecast for ${place.name}; using seasonal norms for ${seasonal.monthLabel}.`
        : `Your dates are beyond the ${FORECAST_WINDOW_DAYS}-day forecast window, so this plan uses seasonal norms for ${place.name} in ${seasonal.monthLabel}.`;
  } else if (seasonal) {
    notice = `Forecast covers the first ${forecast.length} day(s); the remaining ${daysBeyondForecast} day(s) use seasonal norms for ${seasonal.monthLabel}.`;
  }

  return {
    query: location,
    resolvedName: place.name,
    forecast,
    daysBeyondForecast,
    seasonal,
    notice,
    promptSummary: parts.join(" "),
    flags,
  };
}
