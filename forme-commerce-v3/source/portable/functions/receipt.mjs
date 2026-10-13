import {handle} from './lib/handler.mjs';
export default (request,context)=>handle('receipt',request,context);
export const config={rateLimit:{windowLimit:60,windowSize:60,aggregateBy:['ip','domain']}};
