import type { Product, ProductInput, Settings } from "../store/types";
export type Variant = { id: string; product_id: string; size: string; color: string; sku: string; stock: number; active: boolean };
export type StockInput = { id?: string; size: string; color: string; sku: string; stock: number };
export type FashionProduct = Product & { brand: string; audience: "women"|"men"|"unisex"; fit: string; variants: Variant[]; revision:number };
export type ProductDraft = { id?: string; expected_revision?:number; product: ProductInput & { brand: string; audience: "women"|"men"|"unisex"; fit: string }; variants: StockInput[] };
export type LocalizedCopy = {announcement?:string;hero_title?:string;hero_description?:string;story_description?:string;collection_heading?:string;story_heading?:string};
export type CommerceSettings = Settings & { shipping_cents: number; free_shipping_threshold_cents: number; payment_provider: "stripe"|"qpay"; hero_men_image: string; newsletter_enabled?: boolean; collection_heading?:string;story_heading?:string;campaign_label?:string;localized_copy?:Record<string,LocalizedCopy> };
export type CommerceSession = { authenticated: boolean; admin: boolean; user_id: string; name: string; email: string };
export type CustomerProfile = {display_name:string;email:string;phone:string;address:string};
export type TrackingUpdate = {tracking_status:"processing"|"shipped"|"out_for_delivery"|"delivered";carrier:string;tracking_number:string;tracking_url:string};
export type BagLine = { variant_id: string; quantity: number };
export type SaleItem = { variant_id: string; product_id: string; product_type:string; name: string; image: string; brand: string; size: string; color: string; quantity: number; price_cents: number };
export type CommerceOrder = {
  id: string; request_id: string; customer_name: string; email: string; phone: string; address: string; notes: string;
  user_id: string|null; items: SaleItem[]; subtotal_cents: number; shipping_cents: number; total_cents: number; currency: string;
  status: "awaiting_payment"|"paid"|"fulfilled"|"cancelled"|"expired"|"refunded"|"payment_review"; provider: "stripe"|"qpay"|"preview"; is_test:boolean;
  provider_id: string|null; payment_id: string|null; checkout_data?: { url?:string; qr_image?:string; urls?:{name:string;link:string}[] };
  reserved: boolean; receipt_hash: string; expires_at: string; created_at: string; updated_at: string;
  tracking_status?:TrackingUpdate['tracking_status'];carrier?:string|null;tracking_number?:string|null;tracking_url?:string|null;shipped_at?:string|null;delivered_at?:string|null;
};
export type CheckoutPayload = { request_id: string; receipt_token: string; customer_name:string; email:string; phone:string; address:string; notes:string; website:string; items:BagLine[]; preview?:boolean };
export type CheckoutResult = { id:string; provider: string; url?:string; qr_image?:string; urls?:{name:string;link:string}[]; expires_at:string; preview?:boolean };
export type PaymentStatus = { provider:string; ready:boolean; test_mode:boolean; message:string };
export type CommerceCatalog = { products:FashionProduct[]; settings:CommerceSettings; payments:PaymentStatus };
export type CommerceAdminData = CommerceCatalog & { orders:CommerceOrder[] };
export type CommerceConfig = { provider:"sites"|"supabase"; supabaseUrl:string; supabasePublishableKey:string; adminEmailDomain:string; storeUrl:string; managementUrl:string; apiBase:string; app:"store"|"management" };
declare global { interface Window { COMMERCE_CONFIG?:CommerceConfig } }
