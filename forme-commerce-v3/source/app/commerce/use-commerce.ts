'use client';
import { useEffect,useState,useCallback } from 'react';
import { CommerceClient } from './client';
import type { CommerceCatalog,CommerceSession } from './types';
import { commerceDefaults } from './defaults';
export function useCommerce(){
  const [client,setClient]=useState<CommerceClient|null>(null);const [catalog,setCatalog]=useState<CommerceCatalog>({products:[],settings:commerceDefaults,payments:{provider:'stripe',ready:false,test_mode:true,message:''}});const [session,setSession]=useState<CommerceSession>({authenticated:false,admin:false,user_id:'',name:'',email:''});const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{let alive=true;const c=new CommerceClient();setClient(c);(async()=>{try{const s=await c.session();if(alive)setSession(s);}catch(e){if(alive)setError(e instanceof Error?e.message:'Sign-in could not be checked.');}try{const data=await c.catalog();if(alive)setCatalog(data);}catch(e){if(alive)setError(e instanceof Error?e.message:'The collection is unavailable.');}finally{if(alive)setLoading(false);}})();return()=>{alive=false;};},[]);
  const refresh=useCallback(async()=>{if(!client)return;try{setCatalog(await client.catalog());setError('');}catch(e){setError(e instanceof Error?e.message:'The collection is unavailable.');}},[client]);
  return {client,catalog,setCatalog,session,setSession,loading,error,setError,refresh};
}
