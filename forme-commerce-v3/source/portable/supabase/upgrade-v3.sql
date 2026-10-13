-- Apply once to an existing FORME v2 Supabase project. Back up first.
BEGIN;
ALTER TABLE public.commerce_orders ADD COLUMN tracking_status text NOT NULL DEFAULT 'processing' CHECK(tracking_status IN ('processing','shipped','out_for_delivery','delivered'));
ALTER TABLE public.commerce_orders ADD COLUMN carrier text;
ALTER TABLE public.commerce_orders ADD COLUMN tracking_number text;
ALTER TABLE public.commerce_orders ADD COLUMN tracking_url text;
ALTER TABLE public.commerce_orders ADD COLUMN shipped_at timestamptz;
ALTER TABLE public.commerce_orders ADD COLUMN delivered_at timestamptz;

-- Admin shipping milestones remain separate from provider-verified payment status.
CREATE OR REPLACE FUNCTION public.set_order_tracking(p_order_id uuid,p_status text,p_carrier text,p_number text,p_url text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.commerce_orders;
BEGIN
 IF NOT private.is_store_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
 IF p_status NOT IN ('processing','shipped','out_for_delivery','delivered') OR length(coalesce(p_carrier,''))>80 OR length(coalesce(p_number,''))>120 OR length(coalesce(p_url,''))>500 THEN RAISE EXCEPTION 'Invalid tracking details.'; END IF;
 IF p_status<>'processing' AND (coalesce(p_carrier,'')='' OR coalesce(p_number,'')='') THEN RAISE EXCEPTION 'Carrier and tracking number required.'; END IF;
 IF coalesce(p_url,'')<>'' AND p_url !~ '^https://[^[:space:]<>]+$' THEN RAISE EXCEPTION 'Use an HTTPS tracking link.'; END IF;
 SELECT * INTO o FROM public.commerce_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR o.status NOT IN ('paid','fulfilled') THEN RAISE EXCEPTION 'Only verified paid orders can be tracked.'; END IF;
 UPDATE public.commerce_orders SET tracking_status=p_status,carrier=p_carrier,tracking_number=p_number,tracking_url=p_url,
 shipped_at=CASE WHEN p_status<>'processing' THEN coalesce(shipped_at,now()) ELSE NULL END,
 delivered_at=CASE WHEN p_status='delivered' THEN coalesce(delivered_at,now()) ELSE NULL END,updated_at=now() WHERE id=p_order_id;
 RETURN jsonb_build_object('id',o.id,'email',o.email,'tracking_status',p_status,'carrier',p_carrier,'tracking_number',p_number,'tracking_url',p_url);
END; $$;
REVOKE ALL ON FUNCTION public.set_order_tracking(uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_order_tracking(uuid,text,text,text,text) TO authenticated;
COMMIT;
