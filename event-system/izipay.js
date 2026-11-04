'use strict';
const crypto=require('node:crypto');
const API='https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment';
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
 const response=await fetcher(API,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(c.shopId+':'+c.password).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({amount:session.amount_minor,currency:'PEN',orderId:session.provider_order_id,ipnTargetUrl:origin+'/api/events/payments/ipn',customer:{email,billingDetails:{firstName:name,country:'PE'}},transactionOptions:{cardOptions:{captureDelay:0,manualValidation:'NO'}}}),signal:AbortSignal.timeout(25000)});
 const data=await response.json();if(!response.ok||data.status!=='SUCCESS'||!data.answer?.formToken)throw Error('Izipay no pudo iniciar el pago. Reintenta en unos minutos.');
 return {formToken:data.answer.formToken,publicKey:c.publicKey,mode:c.mode};
}
module.exports={credentials,ready,verifyHash,verifyAnswer,createPayment};
