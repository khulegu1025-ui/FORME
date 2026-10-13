import { z } from "zod";
import type { Product, OrderPayload, OrderItem } from "./types";
const text = (max = 200) => z.string().trim().max(max);
export const imageUrl = z.string().trim().max(2000).refine(v => /^\/(?!\/)[^\s<>]*$/.test(v) || (() => { try { const u = new URL(v); return u.protocol === "https:" && !u.username && !u.password; } catch { return false; } })(), "Use an HTTPS image URL.");
export const productInputSchema = z.object({
  name: text(160).min(1, "Give this product a name."), description: text(12000),
  product_type: z.enum(["clothing", "physical", "course", "digital"]), category: text(80).min(1), sku: text(80),
  price_cents: z.number().int().min(0).max(1000000000), compare_at_cents: z.number().int().min(0).max(1000000000).nullable(),
  stock: z.number().int().min(0).max(999999), status: z.enum(["active", "draft", "archived"]),
  images: z.array(imageUrl).min(1, "Add at least one product image.").max(8),
  sizes: z.array(text(40).min(1)).max(30), colors: z.array(text(40).min(1)).max(30),
  details: text(8000), badge: text(30), instructor: text(160), level: text(80), duration: text(80), outline: z.array(text(300).min(1)).max(80)
}).superRefine((p, ctx) => {
  if (p.compare_at_cents !== null && p.compare_at_cents <= p.price_cents) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["compare_at_cents"], message: "Original price must be higher than the selling price." });
  if (new Set(p.sizes).size !== p.sizes.length || new Set(p.colors).size !== p.colors.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Remove duplicate sizes or colors." });
});
export const settingsSchema = z.object({
  name: text(60).min(1), tagline: text(160), announcement: text(250), accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  currency: z.enum(["USD", "MNT", "TWD", "EUR", "GBP", "JPY", "KRW", "CNY"]), catalog_mode: z.enum(["fashion", "shop", "academy", "mixed"]),
  hero_title: text(120).min(1), hero_description: text(500), hero_image: imageUrl,
  story_title: text(200), story_description: text(2000), story_image: imageUrl, contact_email: z.union([z.literal(""), z.string().trim().email().max(254)]),
  contact_phone: text(50).refine(v => !v || /^[+\d ()-]+$/.test(v), "Use a phone number."),
  delivery_policy: text(5000), returns_policy: text(5000), demo: z.boolean()
});
export const orderPayloadSchema = z.object({
  request_id: z.string().uuid(), customer_name: text(160).min(2), email: z.string().trim().email().max(254),
  phone: text(50), address: text(1000), notes: text(2000), website: z.literal(""),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(99), size: text(40), color: text(40) })).min(1).max(30)
});
export function buildOrderItems(payload: OrderPayload, products: Product[]): OrderItem[] {
  const amounts = new Map<string, number>();
  for (const line of payload.items) amounts.set(line.product_id, (amounts.get(line.product_id) ?? 0) + line.quantity);
  return payload.items.map(line => {
    const p = products.find(p => p.id === line.product_id && p.status === "active");
    if (!p) throw new Error("A product is no longer available. Refresh your bag.");
    if ((p.product_type === "physical" || p.product_type === "clothing") && (amounts.get(p.id) ?? 0) > p.stock) throw new Error(`Only ${p.stock} of ${p.name} remain. Adjust your bag.`);
    if ((p.sizes.length && !p.sizes.includes(line.size)) || (!p.sizes.length && line.size)) throw new Error(`Choose a valid size for ${p.name}.`);
    if ((p.colors.length && !p.colors.includes(line.color)) || (!p.colors.length && line.color)) throw new Error(`Choose a valid color for ${p.name}.`);
    if ((p.product_type === "physical" || p.product_type === "clothing") && !payload.address.trim()) throw new Error("Enter a delivery address for physical items.");
    return { ...line, name: p.name, image: p.images[0] ?? "", price_cents: p.price_cents, product_type: p.product_type };
  });
}
