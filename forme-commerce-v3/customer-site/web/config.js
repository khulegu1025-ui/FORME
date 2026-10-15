// Edit these public connection settings before deploying the web folder.
// NEVER put a Supabase service_role / secret key or an admin password here.
window.COMMERCE_CONFIG = {
  provider: "supabase",
  supabaseUrl: "", // e.g. https://your-project.supabase.co
  supabasePublishableKey: "", // the publishable key, or legacy anon key
  adminEmailDomain: "admin.example.com",
  app: "store",
  storeUrl: "https://YOUR-SHOP.netlify.app",
  managementUrl: "https://YOUR-MANAGEMENT.netlify.app",
  apiBase: "/.netlify/functions"
  supabaseUrl: "YOUR_SUPABASE_PROJECT_URL",
  supabasePublishableKey: "YOUR_PUBLISHABLE_KEY",
  storeUrl: "https://lustrous-arithmetic-d47f15.netlify.app",
  managementUrl: "https://bespoke-zabaione-9a20f8.netlify.app",
};
