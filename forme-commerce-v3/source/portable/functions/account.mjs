import {sendCommerceMail,accountNotice} from './lib/mail.mjs';
const h={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200,headers=h)=>Response.json(data,{status,headers});
export default async function account(request){
  const env=process.env,origin=request.headers.get('origin');
  if(origin!==env.STORE_ORIGIN)return reply({error:'Request origin is not allowed.'},403);
  const headers={...h,'Access-Control-Allow-Origin':origin,Vary:'Origin'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization'}});
  if(request.method!=='POST')return reply({error:'Method not allowed.'},405,headers);
  const bearer=request.headers.get('authorization')||'';
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))return reply({error:'Sign in first.'},401,headers);
  if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)return reply({error:'Account service is not configured.'},503,headers);
  const base=env.SUPABASE_URL.replace(/\/+$/,'');const authHeaders={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:bearer,'Content-Type':'application/json'};
  try{
    const raw=await request.text();if(raw.length>5000)throw new Error('Request is too large.');const input=JSON.parse(raw);
    const current=await fetch(`${base}/auth/v1/user`,{headers:authHeaders});if(!current.ok)return reply({error:'Sign in again to update your account.'},401,headers);
    const user=await current.json();if(!user.id||!user.email)throw new Error('Account unavailable.');
    let update,subject;
    if(input.action==='profile'){
      const display_name=String(input.display_name||'').trim(),phone=String(input.phone||'').trim(),address=String(input.address||'').trim();
      if(display_name.length<2||display_name.length>100||phone.length>50||address.length>1000)throw new Error('Check your profile details.');
      update={data:{...(user.user_metadata||{}),display_name,phone,address}};subject='Your FORME profile changed';
    }else if(input.action==='password'){
      if(typeof input.password!=='string'||input.password.length<10||input.password.length>128)throw new Error('Use a password with at least 10 characters.');
      update={password:input.password};subject='Your FORME password changed';
    }else if(input.action==='email'){
      const email=String(input.email||'').trim().toLowerCase();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email)||email===user.email)throw new Error('Enter a new valid email address.');
      update={email};subject='Your FORME email change was requested';
    }else throw new Error('Unknown account action.');
    const r=await fetch(`${base}/auth/v1/user`,{method:'PUT',headers:authHeaders,body:JSON.stringify(update)});const data=await r.json();
    if(!r.ok)return reply({error:data.msg||data.error_description||data.message||'Account change was rejected.'},r.status<500?400:502,headers);
    const notice=await sendCommerceMail(env,user.email,subject,accountNotice(input.action));
    return reply({ok:true,email_confirmation_pending:input.action==='email',notification_sent:notice.sent,notification_message:notice.sent?'':notice.reason,profile:{display_name:data.user_metadata?.display_name||'',email:data.email||user.email,phone:data.user_metadata?.phone||'',address:data.user_metadata?.address||''}},200,headers);
  }catch(e){return reply({error:e instanceof Error?e.message:'Account change failed.'},400,headers);}
}
export const config={rateLimit:{windowLimit:12,windowSize:60,aggregateBy:['ip','domain']}};
