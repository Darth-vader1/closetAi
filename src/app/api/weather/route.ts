import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getLiveWeather, getLiveWeatherByCoords, type WeatherForecast } from "@/lib/weather/service";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Live weather endpoint.
 * 1. If `lat` & `lon` are provided by browser geolocation, resolves weather for those coordinates.
 * 2. Otherwise checks Vercel / Cloudflare edge geo headers (`x-vercel-ip-city`, `x-vercel-ip-latitude`, etc.).
 * 3. Otherwise falls back to a server-side IP geolocation lookup (`ipapi.co` / `ipwho.is`) so local dev and
 *    non-edge deployments also detect the user's current city in the background without any clicks.
 * Also persists the detected city back to `profiles.location` so future SSR renders already know the user's city.
 */
async function detectWeatherFromHeadersOrIp(request: NextRequest): Promise<WeatherForecast | null> {
  const edgeLat = Number(request.headers.get("x-vercel-ip-latitude"));
  const edgeLon = Number(request.headers.get("x-vercel-ip-longitude"));
  const edgeCity = request.headers.get("x-vercel-ip-city") || request.headers.get("cf-ipcity");
  const edgeRegion = request.headers.get("x-vercel-ip-country-region") || request.headers.get("cf-region");

  if (Number.isFinite(edgeLat) && Number.isFinite(edgeLon) && (edgeLat !== 0 || edgeLon !== 0)) {
    const label = edgeCity ? decodeURIComponent(edgeCity) : null;
    const weather = await getLiveWeatherByCoords(edgeLat, edgeLon, label);
    if (weather) return weather;
  }

  if (edgeCity) {
    const cityLabel = [decodeURIComponent(edgeCity), edgeRegion].filter(Boolean).join(", ");
    const weather = await getLiveWeather(cityLabel);
    if (weather) return weather;
  }

  // Fallback IP geolocation for local dev or standard Node servers (uses outgoing public IP when client IP is loopback)
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const isPublicClientIp =
    forwarded &&
    forwarded !== "127.0.0.1" &&
    forwarded !== "::1" &&
    !forwarded.startsWith("192.168.") &&
    !forwarded.startsWith("10.");

  try {
    const url = isPublicClientIp ? `https://ipwho.is/${encodeURIComponent(forwarded)}` : "https://ipwho.is/";
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (res.ok) {
      const data = (await res.json()) as {
        success?: boolean;
        city?: string;
        region?: string;
        latitude?: number;
        longitude?: number;
      };
      if (data.success !== false && typeof data.latitude === "number" && typeof data.longitude === "number") {
        const label = [data.city, data.region].filter(Boolean).join(", ") || null;
        return await getLiveWeatherByCoords(data.latitude, data.longitude, label);
      }
    }
  } catch {
    // ignore network failure
  }

  return null;
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return json({ error: "Please sign in again." }, 401);

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return json({ error: "Invalid coordinates." }, 400);

  let weather: WeatherForecast | null = null;

  if (typeof parsed.data.lat === "number" && typeof parsed.data.lon === "number") {
    const lat = Math.round(parsed.data.lat * 100) / 100;
    const lon = Math.round(parsed.data.lon * 100) / 100;
    weather = await getLiveWeatherByCoords(lat, lon);
  } else {
    weather = await detectWeatherFromHeadersOrIp(request);
  }

  if (!weather) return json({ error: "Couldn't load weather for your location." }, 502);

  // Persist the detected location to the user's profile in the background so SSR has it next time
  if (weather.city && weather.city !== "Your location") {
    try {
      const supabase = await createClient();
      await supabase.from("profiles").update({ location: weather.city }).eq("id", user.id);
    } catch {
      // non-fatal
    }
  }

  return json({ weather });
}
