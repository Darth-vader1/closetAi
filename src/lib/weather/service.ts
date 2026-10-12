/**
 * Weather Service using Open-Meteo (100% Free, No API Key Required)
 * Geocodes city names and fetches live forecast data for clothing recommendations.
 */

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
  const targetCity = city?.trim() || "Lagos";
  const coords = await geocodeCity(targetCity);
  if (!coords) return null;

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
