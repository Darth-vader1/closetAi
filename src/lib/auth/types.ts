/** Result returned by auth Server Actions. Successful sign-in/up redirects instead of returning. */
export type AuthActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
