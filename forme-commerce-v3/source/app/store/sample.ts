import type { Product, Settings } from "./types";
export const defaultSettings: Settings = {
  name: "FORME", tagline: "The everyday edit.", announcement: "A sample storefront. Made to become yours.",
  accent: "#603b3e", currency: "USD", catalog_mode: "fashion", hero_title: "Good things.\nOn repeat.",
  hero_description: "The pieces you reach for. The details that make a difference. Discover a new kind of everyday.",
  hero_image: "/images/editorial.jpg", story_image: "/images/studio.jpg", story_title: "A little less.\nA lot more you.",
  story_description: "Style is personal. Your wardrobe should be, too. Explore a thoughtful edit of easy layers, useful essentials, and the pieces that bring it all together.",
  contact_email: "", contact_phone: "", delivery_policy: "Delivery options and payment are confirmed by the store after you submit an order request. This sample store does not process real purchases.",
  returns_policy: "The store will share its return and exchange terms before confirming your order. Replace this sample policy with your own in Store Studio.", demo: true
};
const base = { description: "An easy addition to your everyday rotation. This is an illustrative product in the sample collection; replace its photos and details with your own in Store Studio.", product_type: "clothing" as const, sku: "", price_cents: 0, compare_at_cents: null, stock: 24, status: "active" as const, images: [] as string[], sizes: ["XS", "S", "M", "L", "XL"], colors: ["As pictured"], details: "Sample product. Photos are illustrative. Confirm specifications, sizing, and availability with the store before purchasing.", badge: "", instructor: "", level: "", duration: "", outline: [] as string[], created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" };
export const sampleProducts: Product[] = [
  { ...base, id: "f0000001-0000-4000-8000-000000000001", name: "The Everyday Shirt", category: "Tops", sku: "FE-001", price_cents: 4800, images: ["/images/shirt.jpg"], badge: "The essentials edit" },
  { ...base, id: "f0000002-0000-4000-8000-000000000002", name: "The Classic Tee", category: "Tops", sku: "FE-002", price_cents: 2800, images: ["/images/tee.jpg"], badge: "Everyday" },
  { ...base, id: "f0000003-0000-4000-8000-000000000003", name: "The Utility Jacket", category: "Outerwear", sku: "FE-003", price_cents: 9200, images: ["/images/jacket.jpg"], badge: "Layer up" },
  { ...base, id: "f0000004-0000-4000-8000-000000000004", name: "The Straight Jean", category: "Bottoms", sku: "FE-004", price_cents: 6800, images: ["/images/denim.jpg"], sizes: ["26", "28", "30", "32", "34", "36"] },
  { ...base, id: "f0000005-0000-4000-8000-000000000005", name: "The Graphic Tee", category: "Tops", sku: "FE-005", price_cents: 3400, images: ["/images/knit.jpg"] },
  { ...base, id: "f0000006-0000-4000-8000-000000000006", name: "The Everyday Bag", category: "Accessories", sku: "FE-006", price_cents: 7600, product_type: "physical", images: ["/images/bag.jpg"], sizes: [], stock: 12 },
  { ...base, id: "f0000007-0000-4000-8000-000000000007", name: "The Everyday Sneaker", category: "Accessories", sku: "FE-007", price_cents: 8800, product_type: "physical", images: ["/images/sneakers.jpg"], sizes: ["EU 38", "EU 39", "EU 40", "EU 41", "EU 42", "EU 43"], stock: 16 },
  { ...base, id: "f0000008-0000-4000-8000-000000000008", name: "Build Your Personal Style", category: "Courses", sku: "FE-C01", price_cents: 3900, product_type: "course", images: ["/images/studio.jpg"], sizes: [], colors: [], status: "draft", stock: 0, instructor: "Your instructor", level: "Beginner", duration: "4 weeks", outline: ["Find your style direction", "Build a versatile wardrobe", "Work with color and proportion", "Create your everyday edit"], description: "A sample course listing. Add your own course, instructor, curriculum, and enrollment details. Course access is delivered separately after the store confirms your enrollment." }
];
