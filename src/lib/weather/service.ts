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

// Fallback coordinates & canonical labels for major cities, Nigerian states/regions, and common abbreviations/typos
const KNOWN_PLACE_ALIASES: Record<string, { lat: number; lon: number; canonicalName: string }> = {
  lagos: { lat: 6.5244, lon: 3.3792, canonicalName: "Lagos" },
  "lagos, nigeria": { lat: 6.5244, lon: 3.3792, canonicalName: "Lagos" },
  "lagos state": { lat: 6.5244, lon: 3.3792, canonicalName: "Lagos" },
  lagod: { lat: 6.5244, lon: 3.3792, canonicalName: "Lagos" },
  lekki: { lat: 6.4463, lon: 3.4772, canonicalName: "Lekki, Lagos" },
  "victoria island": { lat: 6.4281, lon: 3.422, canonicalName: "Victoria Island, Lagos" },
  "victoria island, lagos": { lat: 6.4281, lon: 3.422, canonicalName: "Victoria Island, Lagos" },
  ikoyi: { lat: 6.4549, lon: 3.4346, canonicalName: "Ikoyi, Lagos" },
  ikeja: { lat: 6.6018, lon: 3.3515, canonicalName: "Ikeja, Lagos" },
  yaba: { lat: 6.5158, lon: 3.3711, canonicalName: "Yaba, Lagos" },
  surulere: { lat: 6.4994, lon: 3.3553, canonicalName: "Surulere, Lagos" },
  abuja: { lat: 9.0765, lon: 7.3986, canonicalName: "Abuja" },
  "abuja, nigeria": { lat: 9.0765, lon: 7.3986, canonicalName: "Abuja" },
  fct: { lat: 9.0765, lon: 7.3986, canonicalName: "Abuja, FCT" },
  "f.c.t": { lat: 9.0765, lon: 7.3986, canonicalName: "Abuja, FCT" },
  "fct abuja": { lat: 9.0765, lon: 7.3986, canonicalName: "Abuja, FCT" },
  "abuja fct": { lat: 9.0765, lon: 7.3986, canonicalName: "Abuja, FCT" },
  "federal capital territory": { lat: 9.0765, lon: 7.3986, canonicalName: "Abuja, FCT" },
  "port harcourt": { lat: 4.8156, lon: 7.0498, canonicalName: "Port Harcourt" },
  "rivers state": { lat: 4.8156, lon: 7.0498, canonicalName: "Port Harcourt, Rivers" },
  ibadan: { lat: 7.3775, lon: 3.947, canonicalName: "Ibadan" },
  "oyo state": { lat: 7.3775, lon: 3.947, canonicalName: "Ibadan, Oyo" },
  ilorin: { lat: 8.4966, lon: 4.5421, canonicalName: "Ilorin, Kwara" },
  kwara: { lat: 8.4966, lon: 4.5421, canonicalName: "Kwara State" },
  "kwara state": { lat: 8.4966, lon: 4.5421, canonicalName: "Kwara State" },
  enugu: { lat: 6.4584, lon: 7.5464, canonicalName: "Enugu" },
  kano: { lat: 12.0022, lon: 8.592, canonicalName: "Kano" },
  kaduna: { lat: 10.5105, lon: 7.4165, canonicalName: "Kaduna" },
  "benin city": { lat: 6.335, lon: 5.6037, canonicalName: "Benin City" },
  uyo: { lat: 5.0377, lon: 7.9128, canonicalName: "Uyo" },
  calabar: { lat: 4.9757, lon: 8.3417, canonicalName: "Calabar" },
  abeokuta: { lat: 7.1475, lon: 3.3619, canonicalName: "Abeokuta, Ogun" },
  "ogun state": { lat: 7.1475, lon: 3.3619, canonicalName: "Ogun State" },
  osogbo: { lat: 7.7827, lon: 4.5418, canonicalName: "Osogbo, Osun" },
  akure: { lat: 7.2571, lon: 5.2058, canonicalName: "Akure, Ondo" },
  jos: { lat: 9.8965, lon: 8.8583, canonicalName: "Jos" },
  owerri: { lat: 5.4836, lon: 7.0333, canonicalName: "Owerri" },
  warri: { lat: 5.5167, lon: 5.75, canonicalName: "Warri" },
  asaba: { lat: 6.1982, lon: 6.7314, canonicalName: "Asaba" },
  london: { lat: 51.5074, lon: -0.1278, canonicalName: "London" },
  "new york": { lat: 40.7128, lon: -74.006, canonicalName: "New York" },
  paris: { lat: 48.8566, lon: 2.3522, canonicalName: "Paris" },
  toronto: { lat: 43.6532, lon: -79.3832, canonicalName: "Toronto" },
  accra: { lat: 5.6037, lon: -0.187, canonicalName: "Accra" },
  nairobi: { lat: -1.2921, lon: 36.8219, canonicalName: "Nairobi" },
  dubai: { lat: 25.2048, lon: 55.2708, canonicalName: "Dubai" },
  johannesburg: { lat: -26.2041, lon: 28.0473, canonicalName: "Johannesburg" },
};

/**
 * Fetch current live weather for a city or location string.
 */
export async function getLiveWeather(city?: string | null): Promise<WeatherForecast | null> {
  // No hardcoded fallback city: without a location we return null so the UI can ask for one.
  const targetCity = city?.trim();
  if (!targetCity) return null;
  const normalized = targetCity.toLowerCase().replace(/\s+/g, " ");
  const alias = KNOWN_PLACE_ALIASES[normalized];
  if (alias) {
    return getLiveWeatherByCoords(alias.lat, alias.lon, alias.canonicalName);
  }
  const place = await geocodePlace(targetCity);
  if (!place) return null;
  return getLiveWeatherByCoords(place.lat, place.lon, place.name || targetCity);
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
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code&hourly=temperature_2m&timezone=auto`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        next: { revalidate: 1800 }, // cache weather for 30 minutes
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) continue;
      const data = await res.json();
      const current = data.current;
      if (!current) continue;

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
      // retry once on transient network timeout
    }
  }
  return null;
}

const NON_LOCATION_STOPWORDS = new Set([
  "work",
  "office",
  "church",
  "school",
  "class",
  "dinner",
  "date",
  "date night",
  "lunch",
  "brunch",
  "breakfast",
  "party",
  "wedding",
  "owambe",
  "celebration",
  "meeting",
  "interview",
  "gym",
  "workout",
  "bed",
  "home",
  "closet",
  "wardrobe",
  "mind",
  "general",
  "particular",
  "detail",
  "person",
  "public",
  "advance",
  "style",
  "fashion",
  "summer",
  "winter",
  "spring",
  "autumn",
  "fall",
  "rain",
  "cold",
  "hot",
  "warm",
  "morning",
  "afternoon",
  "evening",
  "night",
  "today",
  "tomorrow",
  "tonight",
  "weekend",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
  "black",
  "white",
  "blue",
  "navy",
  "red",
  "green",
  "brown",
  "beige",
  "grey",
  "gray",
  "pink",
  "yellow",
]);

/**
 * Extracts a city or location name if the user's message explicitly asks about weather or outfits
 * in/for/to a specific place (e.g. "What should I wear in Abuja today?", "I'm flying to London").
 */
export function extractLocationFromPrompt(message: string): string | null {
  if (!message || !message.trim()) return null;
  const normalizedMsg = message.toLowerCase();

  // 1. Check known city/region aliases mentioned after a location preposition or weather phrase
  const aliasKeys = Object.keys(KNOWN_PLACE_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of aliasKeys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const prepRegex = new RegExp(
      `\\b(?:in|to|at|for|from|visiting|around|near|weather\\s+in|weather\\s+for|forecast\\s+in|forecast\\s+for|temperature\\s+in)\\s+${escaped}\\b`,
      "i",
    );
    if (prepRegex.test(normalizedMsg)) {
      return KNOWN_PLACE_ALIASES[key].canonicalName;
    }
  }

  // 2. Check explicit travel or weather patterns for other capitalized cities (e.g. "weather in Kigali", "flying to Nairobi", "in Manchester today")
  const patterns = [
    /\b(?:weather|temperature|forecast|climate|raining|cold|hot|warm)\s+(?:like\s+)?(?:in|at|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/g,
    /\b(?:travel(?:l)?ing|flying|heading|going|moving|trip|visit(?:ing)?)\s+to\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/g,
    /\b(?:wear|dress|outfit|pack|style\s+me)\s+(?:today\s+|tonight\s+|tomorrow\s+)?(?:in|for)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/g,
    /\b(?:i\s+am|i'm|im|currently|right\s+now)\s+in\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/g,
  ];

  const trailingTimeWords = /\s+(?:today|tonight|tomorrow|right|now|this|next|for|and|with|what|how|please)$/i;

  for (const regex of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(message)) !== null) {
      let candidate = match[1].trim().replace(trailingTimeWords, "").trim();
      candidate = candidate.replace(/[?.!,;:]+$/, "").trim();
      const lower = candidate.toLowerCase();
      if (
        candidate.length >= 3 &&
        !NON_LOCATION_STOPWORDS.has(lower) &&
        !NON_LOCATION_STOPWORDS.has(lower.split(/\s+/)[0])
      ) {
        return KNOWN_PLACE_ALIASES[lower]?.canonicalName ?? candidate;
      }
    }
  }

  return null;
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
      { next: { revalidate: 86400 }, signal: AbortSignal.timeout(2500) },
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
 * 1. Built-in alias table for common cities, states, abbreviations ("FCT") and typos ("Lagod").
 * 2. Open-Meteo geocoder on the full string, then on the first comma segment (using the rest of the
 *    string, e.g. "Nigeria", to pick the right country).
 * 3. OpenStreetMap Nominatim, which also knows universities and campuses ("University of Lagos").
 * 4. Multi-word suffix fallback (e.g. "Oko Irese Kwara" -> resolves via "Kwara").
 */
export async function geocodePlace(query: string): Promise<GeocodedPlace | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const normalized = q.toLowerCase().replace(/\s+/g, " ");
  const builtin = KNOWN_PLACE_ALIASES[normalized];
  if (builtin) return { lat: builtin.lat, lon: builtin.lon, name: builtin.canonicalName };

  const label = (r: { name: string; admin1?: string; country?: string }) =>
    [r.name, r.admin1, r.country].filter(Boolean).join(", ");

  const direct = await openMeteoSearch(q, 1);
  if (direct[0]) return { lat: direct[0].latitude, lon: direct[0].longitude, name: label(direct[0]) };

  const [head, ...rest] = q.split(",").map((s) => s.trim()).filter(Boolean);
  if (head && rest.length > 0) {
    const hint = rest.join(" ").toLowerCase();
    const headAlias = KNOWN_PLACE_ALIASES[head.toLowerCase()];
    if (headAlias) return { lat: headAlias.lat, lon: headAlias.lon, name: headAlias.canonicalName };
    const candidates = await openMeteoSearch(head, 10);
    const match =
      candidates.find((c) => hint.includes((c.country ?? "").toLowerCase()) || hint.includes((c.admin1 ?? "").toLowerCase())) ??
      candidates[0];
    if (match) return { lat: match.latitude, lon: match.longitude, name: label(match) };
  }

  // Multi-word un-comma'd alias suffix fallback (e.g. "Oko Irese Kwara" -> resolves immediately via "Kwara")
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    for (let len = Math.min(2, words.length - 1); len >= 1; len--) {
      const tail = words.slice(-len).join(" ").toLowerCase();
      const tailAlias = KNOWN_PLACE_ALIASES[tail];
      if (tailAlias) {
        const prefix = words.slice(0, -len).join(" ");
        return {
          lat: tailAlias.lat,
          lon: tailAlias.lon,
          name: prefix ? `${prefix}, ${tailAlias.canonicalName}` : tailAlias.canonicalName,
        };
      }
    }
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&accept-language=en`,
      {
        headers: { "User-Agent": "ClosetAI/1.0 (packing planner; https://closet-ai-official.vercel.app)" },
        next: { revalidate: 86400 },
        signal: AbortSignal.timeout(4500),
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

  if (words.length >= 2) {
    const lastWord = words[words.length - 1];
    if (lastWord.length >= 3) {
      const tailSearch = await openMeteoSearch(lastWord, 1);
      if (tailSearch[0]) {
        const prefix = words.slice(0, -1).join(" ");
        return {
          lat: tailSearch[0].latitude,
          lon: tailSearch[0].longitude,
          name: `${prefix}, ${label(tailSearch[0])}`,
        };
      }
    }
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
