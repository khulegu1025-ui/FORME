/** Transactional notices. No user-controlled HTML and no sensitive account details. */
export async function sendCommerceMail(env,to,subject,message){
  if(!env.RESEND_API_KEY||!env.MAIL_FROM)return {sent:false,reason:'Email delivery is not configured.'};
  const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({from:env.MAIL_FROM,to:[to],subject,text:message})});
  if(!r.ok)return {sent:false,reason:'Email provider rejected the notification.'};
  return {sent:true};
}
export function accountNotice(kind){return ({profile:'Your FORME profile details were updated. If this was not you, contact the store immediately.',password:'Your FORME account password was changed. If this was not you, reset your password and contact the store immediately.',email:'A change to your FORME account email was requested. If this was not you, secure your account and contact the store immediately.'})[kind];}
