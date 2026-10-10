/** Translate Supabase Auth errors into safe, human messages. Never echo raw provider errors. */
export function friendlyAuthError(error: { code?: string; status?: number; message?: string }): string {
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match. Check them and try again.";
    case "email_not_confirmed":
      return "Please confirm your email first. Check your inbox for the verification link.";
    case "weak_password":
      return "That password is too easy to guess. Try a longer one with a mix of characters.";
    case "same_password":
      return "Choose a password different from your current one.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "user_already_exists":
    case "email_exists":
      return "We couldn't create that account. Try signing in instead.";
    case "session_not_found":
    case "refresh_token_not_found":
      return "Your session has expired. Please sign in again.";
    default:
      return error.status && error.status >= 500
        ? "Our sign-in service is having trouble. Please try again shortly."
        : "Something went wrong. Please try again.";
  }
}
