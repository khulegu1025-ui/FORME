import {SupabaseCommerce} from './supabase-repo.mjs';
import {beginCheckout,paymentReadiness,sha256,same,stripeWebhook,qpayCallback,cancelCheckout} from './payments.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function handle(operation,request,context={},env=process.env){
 const url=new URL(request.url);const origin=request.headers.get('origin');const allowed=[env.STORE_ORIGIN,env.MANAGEMENT_ORIGIN].filter(Boolean).map(v=>v.replace(/\/+$/,''));
 const callback=['stripe-webhook','qpay-callback'].includes(operation);const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
 if(!callback&&origin){if(!allowed.includes(origin))return Response.json({error:'Request origin is not allowed.'},{status:403,headers});headers['Access-Control-Allow-Origin']=origin;headers.Vary='Origin';}
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}});
 const reply=(data,status=200)=>Response.json(data,{status,headers});
 async function body(){const raw=await request.text();if(raw.length>100000)throw new Error('This request is too large.');try{return JSON.parse(raw);}catch{throw new Error('Send a valid request.');}}
 try{
  const repo=new SupabaseCommerce(env);const paymentEnv={...env,PAYMENT_CALLBACK_PATH:'/.netlify/functions/qpay-callback'};
  if(operation==='payment-config'&&request.method==='GET')return reply(paymentReadiness(paymentEnv,await repo.settings()));
  if(operation==='checkout'&&request.method==='POST')return reply(await beginCheckout({repo,env:paymentEnv,settings:await repo.settings(),payload:await body(),user_id:await repo.user(request),ip:context.ip??''}));
  if(operation==='receipt'&&request.method==='GET'){
   const id=url.searchParams.get('id')??'',token=url.searchParams.get('token')??'';
   if(!uuid.test(id)||!/^[a-f0-9]{64}$/.test(token))return reply({error:'Checkout not found.'},404);
   const o=await repo.byId(id);if(!o||!same(await sha256(token),o.receipt_hash))return reply({error:'Checkout not found.'},404);
   return reply({id:o.id,items:o.items,status:o.status,provider:o.provider,is_test:o.is_test,total_cents:o.total_cents,subtotal_cents:o.subtotal_cents,shipping_cents:o.shipping_cents,currency:o.currency,expires_at:o.expires_at,checkout_data:o.checkout_data,tracking_status:o.tracking_status,carrier:o.carrier,tracking_number:o.tracking_number,tracking_url:o.tracking_url,shipped_at:o.shipped_at,delivered_at:o.delivered_at});
  }
  if(operation==='cancel'&&request.method==='POST'){
   const p=await body();if(!uuid.test(p.id)||!/^[a-f0-9]{64}$/.test(p.receipt_token))return reply({error:'Checkout not found.'},404);
   const o=await repo.byId(p.id);if(!o)return reply({error:'Checkout not found.'},404);
   return reply(await cancelCheckout({repo,env:paymentEnv,order:o,receipt_token:p.receipt_token}));
  }
  if(operation==='stripe-webhook'&&request.method==='POST'){const raw=await request.text();if(raw.length>300000)return reply({error:'Payload too large.'},413);return reply(await stripeWebhook({repo,env:paymentEnv,raw,signature:request.headers.get('stripe-signature')}));}
  if(operation==='qpay-callback'&&['POST','GET'].includes(request.method)){const id=url.searchParams.get('order')??'';if(!uuid.test(id))throw new Error('Invalid invoice callback.');return reply(await qpayCallback({repo,env:paymentEnv,order_id:id,key:url.searchParams.get('key')??''}));}
  return reply({error:'Page not found.'},404);
 }catch(e){const message=e instanceof Error?e.message:'Checkout is temporarily unavailable.';return reply({error:message},callback?400:400);}
}
