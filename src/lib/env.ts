import "server-only";

/**
 * Reads a required environment variable, failing loudly at the point of use.
 * Setup mistakes should name the missing variable instead of surfacing as an
 * opaque Supabase error three layers down.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in — see README.md.`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get sessionSecret() {
    return required("APP_SESSION_SECRET");
  },
};
