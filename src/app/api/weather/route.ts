import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { getLiveWeatherByCoords } from "@/lib/weather/service";

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Live weather for browser-provided coordinates (used by the stylist's "Use my location" button). */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return json({ error: "Please sign in again." }, 401);

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return json({ error: "Invalid coordinates." }, 400);

  // Round to ~1km so cache keys are stable and precise location isn't passed around.
  const lat = Math.round(parsed.data.lat * 100) / 100;
  const lon = Math.round(parsed.data.lon * 100) / 100;

  const weather = await getLiveWeatherByCoords(lat, lon);
  if (!weather) return json({ error: "Couldn't load weather for your location." }, 502);
  return json({ weather });
}
