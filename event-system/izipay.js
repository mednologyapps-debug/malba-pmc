'use strict';
const crypto=require('node:crypto');
const API='https://api.micuentaweb.pe/api-payment/V4/';
function credentials(env=process.env,mode='TEST'){
 if(!['TEST','PRODUCTION'].includes(mode)||mode==='PRODUCTION'&&env.IZIPAY_LIVE_ENABLED!=='true')throw Error('Los pagos reales no están habilitados.');
 const prefix='IZIPAY_'+(mode==='TEST'?'TEST':'PROD')+'_';
 const c={shopId:env.IZIPAY_SHOP_ID,password:env[prefix+'PASSWORD'],publicKey:env[prefix+'PUBLIC_KEY'],hmac:env[prefix+'HMAC'],mode};
 if(Object.values(c).some(x=>!x))throw Error('Izipay todavía no está configurado.');
 return c;
}
function ready(env=process.env,mode='TEST'){try{credentials(env,mode);return true;}catch{return false;}}
function verifyHash(fields,key){
 if(fields['kr-hash-algorithm']&&fields['kr-hash-algorithm']!=='sha256_hmac')throw Error('Algoritmo de firma no permitido.');
 const raw=String(fields['kr-answer']||'').replace(/\\\//g,'/'),hash=String(fields['kr-hash']||'').toLowerCase();
 const expected=crypto.createHmac('sha256',key).update(raw).digest('hex');
 if(!/^[a-f0-9]{64}$/.test(hash)||!crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(expected)))throw Error('Firma de pago inválida.');
 return JSON.parse(raw);
}
function verifyAnswer(answer,session){
 if(String(answer.shopId)!==String(session.shop_id)||answer.orderDetails?.mode!==session.mode||answer.orderDetails?.orderId!==session.provider_order_id)throw Error('El pago no corresponde al pedido.');
 if(Number(answer.orderDetails.orderTotalAmount)!==session.amount_minor||answer.orderDetails.orderCurrency!==session.currency)throw Error('Importe o moneda de pago incorrectos.');
 const paid=(answer.transactions||[]).filter(t=>t.status==='PAID');
 if(answer.orderStatus!=='PAID')return {paid:false};
 if(paid.length!==1)throw Error('Transacción de pago ambigua.');
 const t=paid[0];if(t.amount!==session.amount_minor||t.currency!==session.currency||!(/^[a-f0-9]{32}$/i.test(t.uuid)||/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(t.uuid)))throw Error('Transacción de pago incorrecta.');
 return {paid:true,transactionId:t.uuid};
}
async function createPayment(session,{email,name},origin,{env=process.env,fetcher=fetch}={}){
 const c=credentials(env,session.mode);
 const response=await fetcher(API+'Charge/CreatePayment',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(c.shopId+':'+c.password).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({amount:session.amount_minor,currency:'PEN',orderId:session.provider_order_id,ipnTargetUrl:origin+'/api/events/payments/ipn',customer:{email,billingDetails:{firstName:name,country:'PE'}},transactionOptions:{cardOptions:{captureDelay:0,manualValidation:'NO'}}}),signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok||data.status!=='SUCCESS'||!data.answer?.formToken)throw Error('Izipay no pudo iniciar el pago. Reintenta en unos minutos.');
 return {formToken:data.answer.formToken,publicKey:c.publicKey,mode:c.mode};
}
async function lookup(resource,payload,session,{env=process.env,fetcher=fetch}={}){
 const c=credentials(env,session.mode);
 if(String(c.shopId)!==String(session.shop_id))throw Error('La tienda del pedido no coincide.');
 const response=await fetcher(API+resource,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(c.shopId+':'+c.password).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(4000)});
 const result=await response.json();
 if(!response.ok||result.status!=='SUCCESS'){
  const code=String(result.answer?.errorCode||'');
  const error=Error('Izipay no confirmó la consulta.');
  error.lookupCode=/^[A-Z0-9_]{1,32}$/i.test(code)?'provider_'+code:'provider_http_'+response.status;
  throw error;
 }
 return result.answer;
}
const normalizedId=value=>String(value||'').replace(/-/g,'').toLowerCase();
function matchingDebit(transaction,session){
 return transaction?.status==='PAID'&&transaction.operationType==='DEBIT'&&
  String(transaction.shopId)===String(session.shop_id)&&Number(transaction.amount)===session.amount_minor&&
  transaction.currency===session.currency&&/^[a-f0-9]{32}$/i.test(normalizedId(transaction.uuid));
}
async function lookupPaid(session,transactionId,options){
 if(transactionId){
  const transaction=await lookup('Transaction/Get',{uuid:transactionId},session,options);
  if(!matchingDebit(transaction,session)||normalizedId(transaction.uuid)!==normalizedId(transactionId))return null;
  const details=transaction.orderDetails;
  if(details&&(details.orderId&&details.orderId!==session.provider_order_id||details.mode&&details.mode!==session.mode))return null;
  // The browser callback supplies a signed binding. A recovery hint must independently match the provider's order.
  if(!options?.recovery||details?.orderId===session.provider_order_id&&details?.mode===session.mode)return transaction.uuid;
 }
 const order=await lookup('Order/Get',{orderId:session.provider_order_id,operationType:'DEBIT'},session,options);
 const details=order?.orderDetails;
 if(order?.orderStatus&&order.orderStatus!=='PAID'||details?.orderId&&details.orderId!==session.provider_order_id||
  details?.mode&&details.mode!==session.mode||details?.orderCurrency&&details.orderCurrency!==session.currency||
  details?.orderTotalAmount!=null&&Number(details.orderTotalAmount)!==session.amount_minor||
  order?.shopId&&String(order.shopId)!==String(session.shop_id))return null;
 const paid=(Array.isArray(order?.transactions)?order.transactions:[]).filter(t=>t.status==='PAID'&&t.operationType==='DEBIT');
 if(paid.length!==1)return null;
 const transaction={...paid[0],shopId:paid[0].shopId??order.shopId};
 if(!matchingDebit(transaction,session)||transactionId&&normalizedId(transaction.uuid)!==normalizedId(transactionId))return null;
 return transaction.uuid;
}
module.exports={credentials,ready,verifyHash,verifyAnswer,createPayment,lookupPaid};
