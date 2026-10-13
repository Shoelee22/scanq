/* Stationery Queue — site configuration.
   Copy your values from Supabase Dashboard > Project Settings > API. */
window.SQ = {
  SUPABASE_URL: "https://hgaxsuzldvdwvhebsedz.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnYXhzdXpsZHZkd3ZoZWJzZWR6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MjcyMjIsImV4cCI6MjEwNzQwMzIyMn0.Mylwdm12-pkzJXpVa6xn7ZUy5KfcMCulny5QUBIbwS4",

  SHOP_NAME: "Sharma Stationery",

  /* SHA-256 of the admin passcode. Default passcode is 1234.
     Generate your own:  echo -n "your-code" | sha256sum
     (This is a speed bump, not real security — see README.) */
  ADMIN_PASSCODE_SHA256:
    "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4",

  MAX_FILE_MB: 20,
};
