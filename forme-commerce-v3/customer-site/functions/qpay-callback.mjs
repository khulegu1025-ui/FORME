import {handle} from './lib/handler.mjs';
export default (request,context)=>handle('qpay-callback',request,context);
