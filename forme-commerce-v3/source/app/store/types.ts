export type ProductType = "clothing" | "physical" | "course" | "digital";
export type ProductStatus = "active" | "draft" | "archived";
export type OrderStatus = "pending" | "confirmed" | "fulfilled" | "cancelled";
export type ProductInput = {
  name: string; description: string; product_type: ProductType; category: string; sku: string;
  price_cents: number; compare_at_cents: number | null; stock: number; status: ProductStatus;
  images: string[]; sizes: string[]; colors: string[]; details: string; badge: string;
  instructor: string; level: string; duration: string; outline: string[];
};
export type Product = ProductInput & { id: string; created_at: string; updated_at: string };
export type Settings = {
  name: string; tagline: string; announcement: string; accent: string; currency: string;
  catalog_mode: "fashion" | "shop" | "academy" | "mixed";
  hero_title: string; hero_description: string; hero_image: string;
  story_title: string; story_description: string; story_image: string; contact_email: string; contact_phone: string;
  delivery_policy: string; returns_policy: string; demo: boolean;
};
export type CartLine = { product_id: string; quantity: number; size: string; color: string };
export type OrderItem = CartLine & { name: string; image: string; price_cents: number; product_type: ProductType };
export type Order = {
  id: string; request_id: string; customer_name: string; email: string; phone: string;
  address: string; notes: string; items: OrderItem[]; total_cents: number; currency: string;
  status: OrderStatus; created_at: string;
};
export type OrderPayload = {
  request_id: string; customer_name: string; email: string; phone: string; address: string;
  notes: string; website: string; items: CartLine[];
};
export type Session = { admin: boolean; name: string; email: string };
export type Catalog = { products: Product[]; settings: Settings };
export type AdminData = Catalog & { orders: Order[] };
export type StoreConfig = { provider: "sites" | "supabase"; supabaseUrl: string; supabasePublishableKey: string; adminEmailDomain: string };
declare global { interface Window { STORE_CONFIG?: StoreConfig } }
export function money(cents: number, currency: string) {
  try { return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: currency === "MNT" || currency === "TWD" ? 0 : 2 }).format(cents / 100); }
  catch { return `${(cents / 100).toFixed(2)} ${currency}`; }
}
export function isPhysical(p: Pick<ProductInput, "product_type">) { return p.product_type === "clothing" || p.product_type === "physical"; }
export function lineKey(line: CartLine) { return `${line.product_id}|${line.size}|${line.color}`; }
