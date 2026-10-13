const enc=new TextEncoder();
export async function sha256(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function hmac(secret,value){const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
export function validPayload(p){
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(!p||!uuid.test(p.request_id)||!/^[a-f0-9]{64}$/.test(p.receipt_token)||typeof p.customer_name!=='string'||p.customer_name.trim().length<2||p.customer_name.length>160||typeof p.email!=='string'||p.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(p.email)||typeof p.address!=='string'||p.address.trim().length<5||p.address.length>1000||typeof p.phone!=='string'||p.phone.length>50||typeof p.notes!=='string'||p.notes.length>2000||p.website!==''||!Array.isArray(p.items)||p.items.length<1||p.items.length>30||p.items.some(i=>!i||!uuid.test(i.variant_id)||!Number.isInteger(i.quantity)||i.quantity<1||i.quantity>99))throw new Error('Check your contact details and product selections.');
  return {...p,customer_name:p.customer_name.trim(),email:p.email.trim().toLowerCase(),address:p.address.trim()};
}
export function paymentReadiness(env,settings){
  const provider=settings.payment_provider??'stripe';
  const test_mode=provider==='stripe'?!String(env.STRIPE_SECRET_KEY??'').startsWith('sk_live_'):env.QPAY_BASE_URL!=='https://merchant.qpay.mn';
  const base=Boolean(env.STORE_ORIGIN&&String(env.STORE_ORIGIN).startsWith('https://'));
  const ready=provider==='stripe'?base&&Boolean(env.STRIPE_SECRET_KEY&&env.STRIPE_WEBHOOK_SECRET):base&&settings.currency==='MNT'&&Boolean(env.QPAY_CLIENT_ID&&env.QPAY_CLIENT_SECRET&&env.QPAY_INVOICE_CODE&&env.QPAY_CALLBACK_SECRET);
  return {provider,ready:ready&&(!settings.demo||test_mode),test_mode,message:!ready?'Online checkout is not enabled yet. Contact the store for help.':settings.demo&&!test_mode?'Live payments require the sample-store setting to be switched off.':test_mode?'Test checkout. No real money will be charged.':'Secure checkout is available.'};
}
async function stripe(env,path,options={}){
  const r=await fetch(`https://api.stripe.com/v1${path}`,{...options,headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,...options.headers}});
  const data=await r.json();if(!r.ok)throw new Error('The payment provider could not complete that request. Please try again.');return data;
}
const qpayTokens=new Map();
async function qpayToken(env){
  const base=env.QPAY_BASE_URL||'https://merchant-sandbox.qpay.mn';if(!['https://merchant.qpay.mn','https://merchant-sandbox.qpay.mn'].includes(base))throw new Error('Invalid QPay environment.');
  const key=`${base}:${env.QPAY_CLIENT_ID}:${env.QPAY_CLIENT_SECRET}`;const saved=qpayTokens.get(key);if(saved&&saved.expires>Date.now()+60000)return saved.token;
  const r=await fetch(`${base}/v2/auth/token`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${env.QPAY_CLIENT_ID}:${env.QPAY_CLIENT_SECRET}`)}`}});const result=await r.json();if(!r.ok||!result.access_token)throw new Error('QPay could not be connected.');
  qpayTokens.set(key,{token:result.access_token,expires:Date.now()+Math.min(Number(result.expires_in)||3600,3600)*1000});return result.access_token;
}
async function qpay(env,path,body,method='POST'){
  const base=env.QPAY_BASE_URL||'https://merchant-sandbox.qpay.mn';
  const r=await fetch(`${base}${path}`,{method,headers:{Authorization:`Bearer ${await qpayToken(env)}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const raw=await r.text();let data={};try{data=raw?JSON.parse(raw):{};}catch{throw new Error('QPay returned an unexpected response.');}if(!r.ok)throw new Error('QPay could not finish that request.');return data;
}
function minorUnits(cents,currency){return ['JPY','KRW'].includes(currency)?Math.round(cents/100):cents;}
/** @param {{repo:any,env:any,settings:any,payload:any,user_id?:string|null,allowPreview?:boolean,ip?:string}} args */
export async function beginCheckout({repo,env,settings,payload,user_id=null,allowPreview=false,ip=''}){
  const p=validPayload(payload);const receiptHash=await sha256(p.receipt_token);let order=await repo.byRequest(p.request_id);
  if(order&&!same(order.receipt_hash,receiptHash))throw new Error('This checkout request cannot be resumed. Start a new checkout.');
  const readiness=paymentReadiness(env,settings);const preview=p.preview===true;
  if(preview&&(!allowPreview||!settings.demo))throw new Error('Preview checkout is available only to the store owner in sample mode.');
  if(!preview&&!readiness.ready)throw new Error(readiness.message);
  if(!order){
    if(env.TURNSTILE_SECRET_KEY){
      const form=new URLSearchParams({secret:env.TURNSTILE_SECRET_KEY,response:p.turnstile_token??''});if(ip)form.set('remoteip',ip);
      const v=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form});const checked=await v.json();if(!checked.success)throw new Error('Complete the checkout verification and try again.');
    }
    order=await repo.reserve({...p,receipt_hash:receiptHash},user_id,preview?'preview':readiness.provider,preview||readiness.test_mode,settings);
  }
  if(!same(order.receipt_hash,receiptHash))throw new Error('This checkout request cannot be resumed.');
  if(!['awaiting_payment','paid','fulfilled'].includes(order.status))throw new Error('This checkout has ended. Start a new checkout.');
  if(order.provider==='preview'){
    if(order.status==='awaiting_payment')await repo.applyEvent({event_id:`preview:${order.id}`,provider:'preview',order_id:order.id,provider_id:order.id,payment_id:null,kind:'paid',amount:order.total_cents,currency:order.currency,is_test:true});
    return {id:order.id,provider:'preview',preview:true,expires_at:order.expires_at};
  }
  if(order.provider_id&&order.checkout_data)return {id:order.id,provider:order.provider,...order.checkout_data,expires_at:order.expires_at};
  if(order.provider==='stripe'){
    const form=new URLSearchParams({mode:'payment',customer_email:order.email,client_reference_id:order.id,'metadata[order_id]':order.id,'payment_intent_data[metadata][order_id]':order.id,success_url:`${env.STORE_ORIGIN}/#receipt/${order.id}/${p.receipt_token}`,cancel_url:`${env.STORE_ORIGIN}/#receipt/${order.id}/${p.receipt_token}`,expires_at:String(Math.floor(new Date(order.expires_at).getTime()/1000)),'payment_method_types[0]':'card'});
    order.items.forEach((item,i)=>{form.set(`line_items[${i}][price_data][currency]`,order.currency.toLowerCase());form.set(`line_items[${i}][price_data][unit_amount]`,String(minorUnits(item.price_cents,order.currency)));form.set(`line_items[${i}][price_data][product_data][name]`,`${item.name}${item.size||item.color?' — ':''}${[item.size,item.color].filter(Boolean).join(' / ')}`);form.set(`line_items[${i}][quantity]`,String(item.quantity));});
    if(order.shipping_cents){const i=order.items.length;form.set(`line_items[${i}][price_data][currency]`,order.currency.toLowerCase());form.set(`line_items[${i}][price_data][unit_amount]`,String(minorUnits(order.shipping_cents,order.currency)));form.set(`line_items[${i}][price_data][product_data][name]`,'Standard delivery');form.set(`line_items[${i}][quantity]`,'1');}
    const session=await stripe(env,'/checkout/sessions',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':`forme-checkout-${order.id}`},body:form});
    if(!session.id||!session.url?.startsWith('https://checkout.stripe.com/'))throw new Error('The payment page could not be created.');
    const data={url:session.url};await repo.attachProvider(order.id,session.id,data);return {id:order.id,provider:'stripe',...data,expires_at:order.expires_at};
  }
  // QPay forbids creating multiple invoices with the same sender_invoice_no.
  // Claim creation once; a network failure leaves the order for reconciliation.
  if(!await repo.claimInvoice(order.id))throw new Error('Your invoice is being prepared. If it does not appear, contact the store with your order reference.');
  const callbackKey=await hmac(env.QPAY_CALLBACK_SECRET,order.id);
  const invoice=await qpay(env,'/v2/invoice',{invoice_code:env.QPAY_INVOICE_CODE,sender_invoice_no:order.id,invoice_receiver_code:'terminal',invoice_description:`${settings.name} order ${order.id.slice(0,8)}`,amount:order.total_cents/100,callback_url:`${env.STORE_ORIGIN}${env.PAYMENT_CALLBACK_PATH||'/api/commerce/qpay-callback'}?order=${order.id}&key=${callbackKey}`});
  if(!invoice.invoice_id||typeof invoice.qr_image!=='string'||!/^[A-Za-z0-9+/=]+$/.test(invoice.qr_image))throw new Error('QPay could not prepare the invoice.');
  const data={qr_image:invoice.qr_image,urls:Array.isArray(invoice.urls)?invoice.urls.filter(u=>typeof u.name==='string'&&typeof u.link==='string'&&/^(https:\/\/|[a-z][a-z0-9+.-]*:\/\/)/i.test(u.link)&&!/^javascript:|^data:/i.test(u.link)).map(u=>({name:u.name,link:u.link})):[]};
  await repo.attachProvider(order.id,invoice.invoice_id,data);return {id:order.id,provider:'qpay',...data,expires_at:order.expires_at};
}
export async function verifyStripeEvent(raw,header,secret,now=Math.floor(Date.now()/1000)){
  if(!secret||typeof header!=='string')throw new Error('Missing payment signature.');
  const parts=header.split(',').map(p=>p.split('='));const time=Number(parts.find(p=>p[0]==='t')?.[1]);
  if(!Number.isInteger(time)||Math.abs(now-time)>300)throw new Error('Invalid payment signature timestamp.');
  const expected=await hmac(secret,`${time}.${raw}`);if(!parts.some(p=>p[0]==='v1'&&same(p[1],expected)))throw new Error('Invalid payment signature.');return JSON.parse(raw);
}
export async function stripeWebhook({repo,env,raw,signature}){
  const event=await verifyStripeEvent(raw,signature,env.STRIPE_WEBHOOK_SECRET);const session=event.data?.object;
  if(Boolean(event.livemode)!==String(env.STRIPE_SECRET_KEY??'').startsWith('sk_live_'))throw new Error('Payment event environment does not match.');
  if(event.type==='charge.refunded'){
    if(!session?.refunded||session.amount_refunded!==session.amount)return {received:true};
    let order=await repo.byPayment(session.payment_intent);
    if(!order){const pi=await stripe(env,`/payment_intents/${encodeURIComponent(session.payment_intent)}`);if(pi.metadata?.order_id)order=await repo.byId(pi.metadata.order_id);}
    if(!order||order.provider!=='stripe'||(order.payment_id&&order.payment_id!==session.payment_intent)||session.currency?.toUpperCase()!==order.currency||session.amount!==minorUnits(order.total_cents,order.currency))throw new Error('Refund verification did not match the order.');
    await repo.applyEvent({event_id:event.id,provider:'stripe',order_id:order.id,provider_id:order.provider_id??null,payment_id:session.payment_intent,kind:'refunded',amount:order.total_cents,currency:order.currency,is_test:!event.livemode});return {received:true};
  }
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type))return {received:true};
  const id=session?.metadata?.order_id;if(!id)return {received:true};const order=await repo.byId(id);if(!order||order.provider!=='stripe')throw new Error('Payment order not found.');
  if(order.provider_id&&order.provider_id!==session.id)throw new Error('Payment session does not match this order.');
  const paid=event.type!=='checkout.session.expired'&&session.payment_status==='paid';
  if(!paid&&event.type!=='checkout.session.expired')return {received:true};
  if(paid&&(session.currency?.toUpperCase()!==order.currency||session.amount_total!==minorUnits(order.total_cents,order.currency)))throw new Error('Payment amount does not match this order.');
  await repo.applyEvent({event_id:event.id,provider:'stripe',order_id:id,provider_id:session.id,payment_id:session.payment_intent??null,kind:paid?'paid':'expired',amount:order.total_cents,currency:order.currency,is_test:!event.livemode});return {received:true};
}
export async function qpayCallback({repo,env,order_id,key}){
  if(!env.QPAY_CALLBACK_SECRET||!same(await hmac(env.QPAY_CALLBACK_SECRET,order_id),key))throw new Error('Invalid invoice callback.');
  const order=await repo.byId(order_id);if(!order||order.provider!=='qpay'||!order.provider_id)throw new Error('Invoice is not ready.');
  // Only callback-triggered checks. Never poll the QPay payment API on a timer.
  const result=await qpay(env,'/v2/payment/check',{object_type:'INVOICE',object_id:order.provider_id,offset:{page_number:1,page_limit:100}});
  const paid=(result.rows??[]).filter(p=>p.payment_status==='PAID'&&p.payment_currency==='MNT');
  const sum=paid.reduce((n,p)=>n+Math.round(Number(p.payment_amount)*100),0);
  if(!paid.length)return {received:true};if(order.currency!=='MNT'||sum!==order.total_cents)throw new Error('Invoice payment amount does not match.');
  await repo.applyEvent({event_id:`qpay:${order.provider_id}:${paid.map(p=>p.payment_id).sort().join(':')}`,provider:'qpay',order_id:order.id,provider_id:order.provider_id,payment_id:paid[0].payment_id,kind:'paid',amount:sum,currency:'MNT',is_test:env.QPAY_BASE_URL!=='https://merchant.qpay.mn'});return {received:true};
}
export async function cancelCheckout({repo,env,order,receipt_token}){
  if(!same(await sha256(receipt_token),order.receipt_hash))throw new Error('Checkout not found.');
  if(order.status!=='awaiting_payment')return {status:order.status};
  if(order.provider==='stripe'&&order.provider_id){const session=await stripe(env,`/checkout/sessions/${encodeURIComponent(order.provider_id)}/expire`,{method:'POST'});if(session.status!=='expired')throw new Error('The payment session cannot be cancelled.');}
  if(order.provider==='qpay'){if(!order.provider_id)throw new Error('The invoice must be reconciled by the store.');await qpay(env,`/v2/invoice/${encodeURIComponent(order.provider_id)}`,null,'DELETE');}
  // Do not release unknown provider sessions after a network timeout.
  if(order.provider!=='preview'&&!order.provider_id)throw new Error('The store must verify this checkout before releasing its stock.');
  await repo.release(order.id,'cancelled');return {status:'cancelled'};
}
