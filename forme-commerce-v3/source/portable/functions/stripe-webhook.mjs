import {handle} from './lib/handler.mjs';
export default (request,context)=>handle('stripe-webhook',request,context);
