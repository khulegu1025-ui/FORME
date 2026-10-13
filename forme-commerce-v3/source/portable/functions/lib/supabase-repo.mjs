export class SupabaseCommerce {
 constructor(env){this.env=env;if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw new Error('The checkout database is not configured.');this.url=env.SUPABASE_URL.replace(/\/+$/,'');}
 async request(path,options={}){const r=await fetch(`${this.url}/rest/v1${path}`,{...options,headers:{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${this.env.SUPABASE_SERVICE_ROLE_KEY}`,'Content-Type':'application/json',...options.headers}});const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null;}catch{throw new Error('The checkout database returned an unexpected response.');}if(!r.ok){const safe=data?.message;if(typeof safe==='string'&&!/SQL|column|table|syntax|constraint|permission|relation|function/i.test(safe))throw new Error(safe);throw new Error('The checkout could not be saved. Refresh your bag and try again.');}return data;}
 async rpc(name,body){return this.request(`/rpc/${name}`,{method:'POST',body:JSON.stringify(body)});}
 async settings(){const rows=await this.request('/store_settings?id=eq.1&select=data');if(!rows[0])throw new Error('Store settings are missing.');return rows[0].data;}
 async byId(id){return (await this.request(`/commerce_orders?id=eq.${encodeURIComponent(id)}&select=*`))[0]??null;}
 async byPayment(id){return (await this.request(`/commerce_orders?provider=eq.stripe&payment_id=eq.${encodeURIComponent(id)}&select=*`))[0]??null;}
 async byRequest(id){return (await this.request(`/commerce_orders?request_id=eq.${encodeURIComponent(id)}&select=*`))[0]??null;}
 async reserve(payload,userId,provider,isTest){return this.rpc('reserve_checkout',{payload,p_user_id:userId,p_provider:provider,p_is_test:isTest});}
 async attachProvider(id,providerId,data){await this.rpc('attach_checkout',{p_order_id:id,p_provider_id:providerId,p_data:data});}
 async claimInvoice(id){return this.rpc('claim_qpay_invoice',{p_order_id:id});}
 async applyEvent(event){return this.rpc('apply_payment_event',{event});}
 async release(id){await this.rpc('release_checkout',{p_order_id:id});}
 async user(request){const auth=request.headers.get('authorization');if(!auth)return null;if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))throw new Error('Sign in again before checking out.');const r=await fetch(`${this.url}/auth/v1/user`,{headers:{apikey:this.env.SUPABASE_SERVICE_ROLE_KEY,Authorization:auth}});if(!r.ok)throw new Error('Sign in again before checking out.');const u=await r.json();return u.id??null;}
}
