-- FORME store database. Run in a fresh Supabase project's SQL Editor.
-- This creates tables, RLS, storage policies, and validated order functions.
-- Run sample-data.sql separately if you want the illustrative catalog.
BEGIN;
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE TABLE public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9._-]{2,50}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_self_read ON public.admin_users FOR SELECT TO authenticated
  USING (user_id=(SELECT auth.uid()));
REVOKE ALL ON public.admin_users FROM anon,authenticated;
GRANT SELECT ON public.admin_users TO authenticated;
GRANT ALL ON public.admin_users TO service_role;

CREATE FUNCTION private.is_store_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$ SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id=(SELECT auth.uid())); $$;
REVOKE ALL ON FUNCTION private.is_store_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_store_admin() TO authenticated;

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  description text NOT NULL DEFAULT '' CHECK (length(description)<=12000),
  product_type text NOT NULL CHECK (product_type IN ('clothing','physical','course','digital')),
  category text NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
  sku text NOT NULL DEFAULT '' CHECK (length(sku)<=80),
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 0 AND 1000000000),
  compare_at_cents integer CHECK (compare_at_cents>price_cents AND compare_at_cents<=1000000000),
  stock integer NOT NULL DEFAULT 0 CHECK (stock BETWEEN 0 AND 999999),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('active','draft','archived')),
  images jsonb NOT NULL CHECK (jsonb_typeof(images)='array' AND jsonb_array_length(images) BETWEEN 1 AND 8),
  sizes text[] NOT NULL DEFAULT '{}' CHECK (cardinality(sizes)<=30),
  colors text[] NOT NULL DEFAULT '{}' CHECK (cardinality(colors)<=30),
  details text NOT NULL DEFAULT '' CHECK (length(details)<=8000),
  badge text NOT NULL DEFAULT '' CHECK (length(badge)<=30),
  instructor text NOT NULL DEFAULT '' CHECK (length(instructor)<=160),
  level text NOT NULL DEFAULT '' CHECK (length(level)<=80),
  duration text NOT NULL DEFAULT '' CHECK (length(duration)<=80),
  outline text[] NOT NULL DEFAULT '{}' CHECK (cardinality(outline)<=80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_status_created ON public.products(status,created_at DESC);
CREATE FUNCTION private.touch_product() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE TRIGGER touch_product BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION private.touch_product();
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY published_products ON public.products FOR SELECT TO anon,authenticated USING (status='active');
CREATE POLICY admin_products_read ON public.products FOR SELECT TO authenticated USING ((SELECT private.is_store_admin()));
CREATE POLICY admin_products_insert ON public.products FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_store_admin()));
CREATE POLICY admin_products_update ON public.products FOR UPDATE TO authenticated USING ((SELECT private.is_store_admin())) WITH CHECK ((SELECT private.is_store_admin()));
CREATE POLICY admin_products_delete ON public.products FOR DELETE TO authenticated USING ((SELECT private.is_store_admin()));
REVOKE ALL ON public.products FROM anon,authenticated;
GRANT SELECT ON public.products TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

CREATE TABLE public.store_settings (
  id integer PRIMARY KEY CHECK (id=1),
  data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'
    AND data->>'currency' IN ('USD','MNT','TWD','EUR','GBP','JPY','KRW','CNY')
    AND data->>'accent' ~ '^#[0-9a-fA-F]{6}$'
    AND length(data->>'name') BETWEEN 1 AND 60)
);
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_settings_read ON public.store_settings FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY admin_settings_insert ON public.store_settings FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_store_admin()));
CREATE POLICY admin_settings_update ON public.store_settings FOR UPDATE TO authenticated USING ((SELECT private.is_store_admin())) WITH CHECK ((SELECT private.is_store_admin()));
REVOKE ALL ON public.store_settings FROM anon,authenticated;
GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT,INSERT,UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

-- Public product photography. Only administrators can upload or remove files.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('store-images','store-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp','image/gif']);
CREATE POLICY store_image_read ON storage.objects FOR SELECT TO anon,authenticated USING (bucket_id='store-images');
CREATE POLICY admin_image_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='store-images' AND (SELECT private.is_store_admin()));
CREATE POLICY admin_image_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='store-images' AND (SELECT private.is_store_admin())) WITH CHECK (bucket_id='store-images' AND (SELECT private.is_store_admin()));
CREATE POLICY admin_image_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='store-images' AND (SELECT private.is_store_admin()));
COMMIT;

-- Upgrade the original FORME schema. Run schema.sql instead for a fresh project.
-- Transactional inventory and payment RPCs. Payment RPCs are server-only.
BEGIN;
ALTER TABLE public.products ADD COLUMN brand text NOT NULL DEFAULT 'FORME' CHECK(length(brand) BETWEEN 1 AND 80);
ALTER TABLE public.products ADD COLUMN audience text NOT NULL DEFAULT 'unisex' CHECK(audience IN ('women','men','unisex'));
ALTER TABLE public.products ADD COLUMN fit text NOT NULL DEFAULT 'Regular' CHECK(length(fit)<=80);
ALTER TABLE public.products ADD COLUMN revision integer NOT NULL DEFAULT 0;
REVOKE INSERT,UPDATE,DELETE ON public.products FROM authenticated;
DROP FUNCTION IF EXISTS public.place_order(jsonb);
DROP FUNCTION IF EXISTS public.transition_order(uuid,text);

CREATE TABLE public.product_variants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES public.products(id),
 size text NOT NULL DEFAULT '' CHECK(length(size)<=40),color text NOT NULL DEFAULT '' CHECK(length(color)<=40),
 sku text NOT NULL DEFAULT '' CHECK(length(sku)<=80),stock integer NOT NULL DEFAULT 0 CHECK(stock BETWEEN 0 AND 999999),
 active boolean NOT NULL DEFAULT true,UNIQUE(product_id,size,color)
);
CREATE INDEX variants_product ON public.product_variants(product_id);
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY published_variants ON public.product_variants FOR SELECT TO anon,authenticated
 USING(active AND EXISTS(SELECT 1 FROM public.products p WHERE p.id=product_id AND p.status='active'));
CREATE POLICY admin_variants_read ON public.product_variants FOR SELECT TO authenticated USING((SELECT private.is_store_admin()));
REVOKE ALL ON public.product_variants FROM anon,authenticated;
GRANT SELECT ON public.product_variants TO anon,authenticated;
GRANT ALL ON public.product_variants TO service_role;

-- Preserve legacy aggregate stock, distributing it across the size/color options.
INSERT INTO public.product_variants(product_id,size,color,sku,stock)
SELECT p.id,s.size,c.color,p.sku,
 (p.stock / (greatest(cardinality(p.sizes),1)*greatest(cardinality(p.colors),1)))
 + CASE WHEN row_number() OVER(PARTITION BY p.id ORDER BY s.size,c.color)<=
 p.stock % (greatest(cardinality(p.sizes),1)*greatest(cardinality(p.colors),1)) THEN 1 ELSE 0 END
FROM public.products p
CROSS JOIN LATERAL unnest(CASE WHEN cardinality(p.sizes)>0 THEN p.sizes ELSE ARRAY['']::text[] END) s(size)
CROSS JOIN LATERAL unnest(CASE WHEN cardinality(p.colors)>0 THEN p.colors ELSE ARRAY['']::text[] END) c(color);

CREATE TABLE public.commerce_orders(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL UNIQUE,
 customer_name text NOT NULL,email text NOT NULL,phone text NOT NULL,address text NOT NULL,notes text NOT NULL,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,items jsonb NOT NULL,
 subtotal_cents bigint NOT NULL,shipping_cents bigint NOT NULL,total_cents bigint NOT NULL CHECK(total_cents BETWEEN 50 AND 10000000000),currency text NOT NULL,
 status text NOT NULL DEFAULT 'awaiting_payment' CHECK(status IN ('awaiting_payment','paid','fulfilled','cancelled','expired','refunded','payment_review')),
 provider text NOT NULL CHECK(provider IN ('stripe','qpay','preview')),provider_id text,payment_id text,checkout_data jsonb,
 is_test boolean NOT NULL DEFAULT true,reserved boolean NOT NULL DEFAULT true,
 receipt_hash text NOT NULL CHECK(receipt_hash ~ '^[a-f0-9]{64}$'),expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 tracking_status text NOT NULL DEFAULT 'processing' CHECK(tracking_status IN ('processing','shipped','out_for_delivery','delivered')),
 carrier text,tracking_number text,tracking_url text,shipped_at timestamptz,delivered_at timestamptz
);
CREATE INDEX commerce_owner_created ON public.commerce_orders(user_id,created_at DESC);
CREATE INDEX commerce_email_created ON public.commerce_orders(lower(email),created_at DESC);
ALTER TABLE public.commerce_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_orders ON public.commerce_orders FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
CREATE POLICY admin_commerce_orders ON public.commerce_orders FOR SELECT TO authenticated USING((SELECT private.is_store_admin()));
REVOKE ALL ON public.commerce_orders FROM anon,authenticated;
GRANT SELECT ON public.commerce_orders TO authenticated;
GRANT ALL ON public.commerce_orders TO service_role;
CREATE TABLE public.payment_events(id text PRIMARY KEY,provider text NOT NULL,order_id uuid NOT NULL REFERENCES public.commerce_orders(id),created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_events FROM anon,authenticated;
GRANT ALL ON public.payment_events TO service_role;

CREATE FUNCTION private.refresh_stock(ids uuid[]) RETURNS void LANGUAGE sql SET search_path='' AS $$
 UPDATE public.products p SET stock=coalesce((SELECT sum(v.stock) FROM public.product_variants v WHERE v.product_id=p.id AND v.active),0),revision=revision+1
 WHERE id=ANY(ids);
$$;
REVOKE ALL ON FUNCTION private.refresh_stock(uuid[]) FROM PUBLIC;

CREATE FUNCTION public.save_catalog_product(payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb=payload->'product';vs jsonb=payload->'variants';v jsonb;pid uuid;vid uuid;rev integer;ids uuid[]='{}';
BEGIN
 IF NOT private.is_store_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
 IF jsonb_typeof(p)<>'object' OR jsonb_typeof(vs)<>'array' OR jsonb_array_length(vs) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Check the product and variants.'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(vs))<>(SELECT count(DISTINCT (value->>'size',value->>'color')) FROM jsonb_array_elements(vs)) THEN RAISE EXCEPTION 'Each size/color combination must be unique.'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'images') x WHERE x#>>'{}' !~ '^(https://[^[:space:]<>]+|/[^/][^[:space:]<>]*)$') THEN RAISE EXCEPTION 'Use HTTPS image URLs.'; END IF;
 pid=coalesce((payload->>'id')::uuid,gen_random_uuid());
 IF payload->>'id' IS NOT NULL THEN
  SELECT revision INTO rev FROM public.products WHERE id=pid FOR UPDATE;
  IF NOT FOUND OR rev IS DISTINCT FROM (payload->>'expected_revision')::integer THEN RAISE EXCEPTION 'This product or its stock changed while you were editing. Refresh and try again.'; END IF;
 ELSE
  INSERT INTO public.products(id,name,product_type,category,price_cents,images) VALUES(pid,p->>'name',p->>'product_type',p->>'category',(p->>'price_cents')::integer,p->'images');
 END IF;
 PERFORM id FROM public.product_variants WHERE product_id=pid ORDER BY id FOR UPDATE;
 UPDATE public.product_variants SET active=false WHERE product_id=pid;
 FOR v IN SELECT value FROM jsonb_array_elements(vs) LOOP
  vid=(v->>'id')::uuid;
  IF vid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.product_variants WHERE id=vid AND product_id=pid) THEN RAISE EXCEPTION 'A variant does not belong to this product.'; END IF;
  IF vid IS NULL THEN SELECT id INTO vid FROM public.product_variants WHERE product_id=pid AND size=v->>'size' AND color=v->>'color'; END IF;
  vid=coalesce(vid,gen_random_uuid());
  INSERT INTO public.product_variants(id,product_id,size,color,sku,stock,active) VALUES(vid,pid,v->>'size',v->>'color',coalesce(v->>'sku',''),(v->>'stock')::integer,true)
  ON CONFLICT(id) DO UPDATE SET size=excluded.size,color=excluded.color,sku=excluded.sku,stock=excluded.stock,active=true;
  ids=array_append(ids,vid);
 END LOOP;
 UPDATE public.products SET name=p->>'name',description=coalesce(p->>'description',''),product_type=p->>'product_type',category=p->>'category',sku=coalesce(p->>'sku',''),
 price_cents=(p->>'price_cents')::integer,compare_at_cents=(p->>'compare_at_cents')::integer,status=p->>'status',images=p->'images',
 sizes=ARRAY(SELECT DISTINCT size FROM public.product_variants WHERE id=ANY(ids) AND size<>'' ORDER BY size),
 colors=ARRAY(SELECT DISTINCT color FROM public.product_variants WHERE id=ANY(ids) AND color<>'' ORDER BY color),
 stock=(SELECT coalesce(sum(stock),0) FROM public.product_variants WHERE id=ANY(ids)),
 details=coalesce(p->>'details',''),badge=coalesce(p->>'badge',''),brand=p->>'brand',audience=p->>'audience',fit=coalesce(p->>'fit',''),
 instructor=coalesce(p->>'instructor',''),level=coalesce(p->>'level',''),duration=coalesce(p->>'duration',''),
 outline=ARRAY(SELECT jsonb_array_elements_text(coalesce(p->'outline','[]'::jsonb))),revision=revision+1 WHERE id=pid;
 RETURN jsonb_build_object('id',pid);
END; $$;
REVOKE ALL ON FUNCTION public.save_catalog_product(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_catalog_product(jsonb) TO authenticated;
CREATE FUNCTION public.archive_catalog_product(product_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.is_store_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
 UPDATE public.products SET status='archived',revision=revision+1 WHERE id=product_id;
 RETURN jsonb_build_object('ok',true);
END; $$;
REVOKE ALL ON FUNCTION public.archive_catalog_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_catalog_product(uuid) TO authenticated;

CREATE FUNCTION public.reserve_checkout(payload jsonb,p_user_id uuid,p_provider text,p_is_test boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.commerce_orders;v public.product_variants;p public.products;line jsonb;lines jsonb=payload->'items';snapshot jsonb='[]';
 s jsonb;subtotal bigint=0;shipping bigint;total bigint;q integer;groupq integer;pid uuid;request uuid=(payload->>'request_id')::uuid;affected uuid[];
BEGIN
 IF jsonb_typeof(lines)<>'array' OR jsonb_array_length(lines) NOT BETWEEN 1 AND 30 OR length(payload->>'customer_name') NOT BETWEEN 2 AND 160
 OR length(payload->>'email')>254 OR payload->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(payload->>'address') NOT BETWEEN 5 AND 1000
 OR coalesce(payload->>'website','')<>'' THEN RAISE EXCEPTION 'Check your contact details.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(request::text,0));
 SELECT * INTO o FROM public.commerce_orders WHERE request_id=request;
 IF FOUND THEN
  IF o.receipt_hash IS DISTINCT FROM payload->>'receipt_hash' THEN RAISE EXCEPTION 'This checkout cannot be resumed.'; END IF;
  RETURN to_jsonb(o);
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(lower(payload->>'email'),1));
 IF (SELECT count(*) FROM public.commerce_orders WHERE lower(email)=lower(payload->>'email') AND created_at>now()-interval '10 minutes')>=5 THEN RAISE EXCEPTION 'Too many checkouts. Try again in 10 minutes.'; END IF;
 SELECT data INTO s FROM public.store_settings WHERE id=1 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Store settings are missing.'; END IF;
 IF p_provider<>'preview' AND p_provider IS DISTINCT FROM coalesce(s->>'payment_provider','stripe') THEN RAISE EXCEPTION 'Checkout settings changed. Try again.'; END IF;
 affected=ARRAY(SELECT DISTINCT product_id FROM public.product_variants WHERE id IN (SELECT (value->>'variant_id')::uuid FROM jsonb_array_elements(lines)));
 PERFORM id FROM public.products WHERE id=ANY(affected) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.product_variants WHERE product_id=ANY(affected) ORDER BY id FOR UPDATE;
 FOR line IN SELECT value FROM jsonb_array_elements(lines) LOOP
  IF coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' THEN RAISE EXCEPTION 'Choose valid quantities.'; END IF;
  q=(line->>'quantity')::integer;
  SELECT * INTO v FROM public.product_variants WHERE id=(line->>'variant_id')::uuid AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'A product option is unavailable.'; END IF;
  SELECT * INTO p FROM public.products WHERE id=v.product_id AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'A product is unavailable.'; END IF;
  SELECT sum((value->>'quantity')::integer) INTO groupq FROM jsonb_array_elements(lines) WHERE value->>'variant_id'=v.id::text;
  IF p.product_type IN ('clothing','physical') AND v.stock<groupq THEN RAISE EXCEPTION 'Not enough stock for this size and color.'; END IF;
  IF s->>'currency' IN ('JPY','KRW') AND p.price_cents % 100 <> 0 THEN RAISE EXCEPTION 'This currency requires whole-unit prices.'; END IF;
  snapshot=snapshot||jsonb_build_array(jsonb_build_object('variant_id',v.id,'product_id',p.id,'product_type',p.product_type,'name',p.name,'image',p.images->>0,'brand',p.brand,'size',v.size,'color',v.color,'quantity',q,'price_cents',p.price_cents));
  subtotal=subtotal+p.price_cents::bigint*q;
 END LOOP;
 shipping=coalesce((s->>'shipping_cents')::bigint,0);
 IF coalesce((s->>'free_shipping_threshold_cents')::bigint,0)>0 AND subtotal>=(s->>'free_shipping_threshold_cents')::bigint THEN shipping=0; END IF;
 IF shipping<0 OR (s->>'currency' IN ('JPY','KRW') AND shipping % 100 <> 0) THEN RAISE EXCEPTION 'Check the store delivery fee.'; END IF;
 total=subtotal+shipping;
 INSERT INTO public.commerce_orders(request_id,customer_name,email,phone,address,notes,user_id,items,subtotal_cents,shipping_cents,total_cents,currency,provider,is_test,receipt_hash,expires_at)
 VALUES(request,payload->>'customer_name',lower(payload->>'email'),coalesce(payload->>'phone',''),payload->>'address',coalesce(payload->>'notes',''),p_user_id,snapshot,subtotal,shipping,total,s->>'currency',p_provider,p_is_test,payload->>'receipt_hash',now()+interval '35 minutes') RETURNING * INTO o;
 UPDATE public.product_variants target SET stock=target.stock-x.qty FROM (
 SELECT (value->>'variant_id')::uuid AS id,sum((value->>'quantity')::integer)::integer AS qty FROM jsonb_array_elements(snapshot)
 WHERE value->>'product_type' IN ('clothing','physical') GROUP BY (value->>'variant_id')::uuid) x WHERE target.id=x.id;
 PERFORM private.refresh_stock(affected);
 RETURN to_jsonb(o);
END; $$;
REVOKE ALL ON FUNCTION public.reserve_checkout(jsonb,uuid,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_checkout(jsonb,uuid,text,boolean) TO service_role;

CREATE FUNCTION public.attach_checkout(p_order_id uuid,p_provider_id text,p_data jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE public.commerce_orders SET provider_id=p_provider_id,checkout_data=p_data WHERE id=p_order_id AND (provider_id IS NULL OR provider_id=p_provider_id);
$$;
CREATE FUNCTION public.claim_qpay_invoice(p_order_id uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN UPDATE public.commerce_orders SET checkout_data='{}'::jsonb WHERE id=p_order_id AND checkout_data IS NULL AND provider_id IS NULL; RETURN FOUND; END; $$;

CREATE FUNCTION public.apply_payment_event(event jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.commerce_orders;affected uuid[];kind text=event->>'kind';
BEGIN
 SELECT * INTO o FROM public.commerce_orders WHERE id=(event->>'order_id')::uuid FOR UPDATE;
 IF NOT FOUND OR o.total_cents IS DISTINCT FROM (event->>'amount')::bigint OR o.currency IS DISTINCT FROM event->>'currency'
 OR o.provider IS DISTINCT FROM event->>'provider' OR o.is_test IS DISTINCT FROM (event->>'is_test')::boolean
 OR (o.provider_id IS NOT NULL AND o.provider_id IS DISTINCT FROM event->>'provider_id') THEN RAISE EXCEPTION 'Payment verification did not match the order.'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_events WHERE id=event->>'event_id') THEN RETURN jsonb_build_object('ok',true); END IF;
 IF (kind='paid' AND o.status IN ('awaiting_payment','expired','cancelled')) OR (kind='expired' AND o.status='awaiting_payment') OR (kind='refunded' AND o.status<>'refunded') THEN
  IF kind='expired' AND o.reserved THEN
   affected=ARRAY(SELECT DISTINCT (value->>'product_id')::uuid FROM jsonb_array_elements(o.items));
   PERFORM id FROM public.products WHERE id=ANY(affected) ORDER BY id FOR UPDATE;
   PERFORM id FROM public.product_variants WHERE product_id=ANY(affected) ORDER BY id FOR UPDATE;
   UPDATE public.product_variants v SET stock=stock+x.q FROM (SELECT (value->>'variant_id')::uuid id,sum((value->>'quantity')::integer)::integer q FROM jsonb_array_elements(o.items) WHERE value->>'product_type' IN ('clothing','physical') GROUP BY (value->>'variant_id')::uuid) x WHERE v.id=x.id;
   PERFORM private.refresh_stock(affected);
  END IF;
  UPDATE public.commerce_orders SET status=CASE WHEN kind='paid' THEN CASE WHEN o.reserved THEN 'paid' ELSE 'payment_review' END WHEN kind='refunded' THEN 'refunded' ELSE 'expired' END,
   reserved=CASE WHEN kind IN ('expired','refunded') THEN false ELSE reserved END,provider_id=coalesce(provider_id,event->>'provider_id'),payment_id=coalesce(event->>'payment_id',payment_id),updated_at=now() WHERE id=o.id;
 END IF;
 INSERT INTO public.payment_events(id,provider,order_id) VALUES(event->>'event_id',o.provider,o.id);
 RETURN jsonb_build_object('ok',true);
END; $$;

CREATE FUNCTION private.release_order(p_order_id uuid,p_preview_paid boolean DEFAULT false) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE o public.commerce_orders;affected uuid[];
BEGIN
 SELECT * INTO o FROM public.commerce_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND OR NOT o.reserved OR NOT(o.status='awaiting_payment' OR (p_preview_paid AND o.provider='preview' AND o.status='paid')) THEN RETURN; END IF;
 affected=ARRAY(SELECT DISTINCT (value->>'product_id')::uuid FROM jsonb_array_elements(o.items));
 PERFORM id FROM public.products WHERE id=ANY(affected) ORDER BY id FOR UPDATE;
 PERFORM id FROM public.product_variants WHERE product_id=ANY(affected) ORDER BY id FOR UPDATE;
 UPDATE public.product_variants v SET stock=stock+x.q FROM (SELECT (value->>'variant_id')::uuid id,sum((value->>'quantity')::integer)::integer q FROM jsonb_array_elements(o.items) WHERE value->>'product_type' IN ('clothing','physical') GROUP BY (value->>'variant_id')::uuid) x WHERE v.id=x.id;
 PERFORM private.refresh_stock(affected);
 UPDATE public.commerce_orders SET status='cancelled',reserved=false,updated_at=now() WHERE id=o.id;
END; $$;
REVOKE ALL ON FUNCTION private.release_order(uuid,boolean) FROM PUBLIC;
CREATE FUNCTION public.release_checkout(p_order_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT private.release_order(p_order_id,false); $$;
CREATE FUNCTION public.manage_commerce_order(p_order_id uuid,p_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o public.commerce_orders;
BEGIN
 IF NOT private.is_store_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF;
 SELECT * INTO o FROM public.commerce_orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
 IF p_action='fulfill' AND o.status='paid' THEN UPDATE public.commerce_orders SET status='fulfilled',updated_at=now() WHERE id=o.id;
 ELSIF p_action='cancel_preview' AND o.provider='preview' THEN PERFORM private.release_order(o.id,true);
 ELSE RAISE EXCEPTION 'This order action is not allowed.'; END IF;
 RETURN jsonb_build_object('ok',true);
END; $$;
REVOKE ALL ON FUNCTION public.manage_commerce_order(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manage_commerce_order(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.attach_checkout(uuid,text,jsonb),public.claim_qpay_invoice(uuid),public.apply_payment_event(jsonb),public.release_checkout(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.attach_checkout(uuid,text,jsonb),public.claim_qpay_invoice(uuid),public.apply_payment_event(jsonb),public.release_checkout(uuid) TO service_role;

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
