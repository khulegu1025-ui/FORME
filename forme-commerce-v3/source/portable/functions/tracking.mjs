import {sendCommerceMail} from './lib/mail.mjs';
const h={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export default async function tracking(request){
  const env=process.env,origin=request.headers.get('origin');const allowed=[env.STORE_ORIGIN,env.MANAGEMENT_ORIGIN].filter(Boolean);
  if(!origin||!allowed.includes(origin))return Response.json({error:'Origin not allowed.'},{status:403,headers:h});
  const headers={...h,'Access-Control-Allow-Origin':origin,Vary:'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}});
  if(request.method!=='POST')return Response.json({error:'Method not allowed.'},{status:405,headers});
  const bearer=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))return Response.json({error:'Administrator sign-in required.'},{status:401,headers});
  try{
    const raw=await request.text();if(raw.length>3000)throw new Error('Request is too large.');const p=JSON.parse(raw);
    if(!/^[a-f0-9-]{36}$/i.test(p.id)||!['processing','shipped','out_for_delivery','delivered'].includes(p.tracking_status)||String(p.carrier||'').length>80||String(p.tracking_number||'').length>120||String(p.tracking_url||'').length>500)throw new Error('Check tracking details.');
    const base=env.SUPABASE_URL?.replace(/\/+$/,'');if(!base||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('Tracking service is not configured.');
    const authHeaders={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:bearer};const userResponse=await fetch(`${base}/auth/v1/user`,{headers:authHeaders});if(!userResponse.ok)return Response.json({error:'Administrator sign-in required.'},{status:401,headers});const user=await userResponse.json();if(!user.id)return Response.json({error:'Administrator sign-in required.'},{status:401,headers});
    const adminResponse=await fetch(`${base}/rest/v1/admin_users?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`,{headers:authHeaders});if(!adminResponse.ok||(await adminResponse.json()).length!==1)return Response.json({error:'Administrator access required.'},{status:403,headers});
    const r=await fetch(`${base}/rest/v1/rpc/set_order_tracking`,{method:'POST',headers:{...authHeaders,'Content-Type':'application/json'},body:JSON.stringify({p_order_id:p.id,p_status:p.tracking_status,p_carrier:p.carrier||'',p_number:p.tracking_number||'',p_url:p.tracking_url||''})});const data=await r.json();
    if(!r.ok)return Response.json({error:data.message||'Tracking change rejected.'},{status:403,headers});
    const notice=await sendCommerceMail(env,data.email,`FORME order #${p.id.slice(0,8).toUpperCase()} update`,`Your order status is now ${p.tracking_status.replaceAll('_',' ')}.${p.carrier?` Carrier: ${p.carrier}. Tracking number: ${p.tracking_number}.`:''}${p.tracking_url?` Track your parcel: ${p.tracking_url}`:''}`);
    return Response.json({ok:true,notification_sent:notice.sent,notification_message:notice.sent?'':notice.reason},{headers});
  }catch(e){return Response.json({error:e instanceof Error?e.message:'Tracking change failed.'},{status:400,headers});}
}
export const config={rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
