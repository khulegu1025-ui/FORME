import { z } from "zod";
import { productInputSchema, settingsSchema, imageUrl } from "../store/validation";
const t=(n:number)=>z.string().trim().max(n);
export const draftSchema=z.object({
  id:z.string().uuid().optional(),expected_revision:z.number().int().min(0).optional(),
  product:productInputSchema.and(z.object({brand:t(80).min(1),audience:z.enum(["women","men","unisex"]),fit:t(80)})),
  variants:z.array(z.object({id:z.string().uuid().optional(),size:t(40),color:t(40),sku:t(80),stock:z.number().int().min(0).max(999999)})).min(1).max(120)
}).superRefine((p,c)=>{const keys=p.variants.map(v=>`${v.size}\u0000${v.color}`);if(new Set(keys).size!==keys.length)c.addIssue({code:"custom",message:"Each size/color combination must be unique."});});
export const commerceSettingsSchema=settingsSchema.and(z.object({shipping_cents:z.number().int().min(0).max(10000000),free_shipping_threshold_cents:z.number().int().min(0).max(1000000000),payment_provider:z.enum(["stripe","qpay"]),hero_men_image:imageUrl,collection_heading:t(120).optional(),story_heading:t(120).optional(),campaign_label:t(80).optional(),localized_copy:z.record(z.string().max(8),z.object({announcement:t(250).optional(),hero_title:t(120).optional(),hero_description:t(500).optional(),story_description:t(2000).optional(),collection_heading:t(120).optional(),story_heading:t(120).optional()})).optional()}));
export const customerProfileSchema=z.object({display_name:t(100).min(2),phone:t(50),address:t(1000)});
export const trackingSchema=z.object({tracking_status:z.enum(['processing','shipped','out_for_delivery','delivered']),carrier:t(80),tracking_number:t(120),tracking_url:z.union([z.literal(''),z.string().url().max(500).refine(v=>v.startsWith('https://'),'Use a secure HTTPS tracking link.')])}).superRefine((v,c)=>{if(v.tracking_status!=='processing'&&(!v.carrier||!v.tracking_number))c.addIssue({code:'custom',message:'Add the carrier and tracking number before marking the parcel shipped.'});});
export const checkoutSchema=z.object({request_id:z.string().uuid(),receipt_token:z.string().regex(/^[a-f0-9]{64}$/),customer_name:t(160).min(2),email:z.string().trim().email().max(254),phone:t(50),address:t(1000).min(5),notes:t(2000),website:z.literal(""),items:z.array(z.object({variant_id:z.string().uuid(),quantity:z.number().int().min(1).max(99)})).min(1).max(30),preview:z.boolean().optional()});
