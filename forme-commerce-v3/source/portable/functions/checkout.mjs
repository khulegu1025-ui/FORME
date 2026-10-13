import {handle} from './lib/handler.mjs';
export default (request,context)=>handle('checkout',request,context);
export const config={rateLimit:{windowLimit:20,windowSize:60,aggregateBy:['ip','domain']}};
