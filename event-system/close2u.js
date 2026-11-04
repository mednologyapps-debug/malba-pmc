'use strict';
const BASE='https://tefacturo.pe';
function billing(value={}){
 const type=value.type==='factura'?'factura':'boleta',document=String(value.document||'').trim(),name=String(value.name||'').trim().slice(0,150),address=String(value.address||'').trim().slice(0,250);
 if(type==='factura'&&(!/^\d{11}$/.test(document)||name.length<3||address.length<5))throw Error('Completa RUC, razón social y dirección fiscal.');
 if(type==='boleta'&&document&&!/^\d{8}$/.test(document))throw Error('El DNI debe tener 8 dígitos.');
 return {type,document,name,address};
}
function buildPayload(session,env=process.env,{preview=false}={}){
 const b=billing(session.billing),type=b.type,series=env[type==='factura'?'C2U_SERIE_FACTURA':'C2U_SERIE_BOLETA'];
 if(!/^\d{11}$/.test(env.C2U_RUC||'')||!series)throw Error('Falta configurar el emisor o las series de facturación.');
 const local=new Date(Date.now()-5*3600000).toISOString();
 return {close2u:{tipoIntegracion:preview?'OFFLINE':'ERP',tipoPlantilla:'01',tipoRegistro:'PRECIOS_CON_IGV'},datosDocumento:{serie:series,numero:0,moneda:'PEN',fechaEmision:local.slice(0,10),horaEmision:local.slice(11,19),formaPago:'CONTADO',medioPago:env.C2U_PAYMENT_METHOD||'TARJETA_DEBITO',condicionPago:'CONTADO',ordencompra:session.provider_order_id,glosa:'Gestión de Proyectos de Transmisión. Factores Clave.'},detalleDocumento:[{codigoProducto:'MALBA-LIBRO-FISICO',descripcion:'Gestión de Proyectos de Transmisión. Factores Clave.',tipoAfectacion:'GRAVADO_OPERACION_ONEROSA',unidadMedida:'UNIDAD_BIENES',cantidad:1,precioVentaUnitarioItem:session.amount_minor/100}],emisor:{correo:env.C2U_ISSUER_EMAIL,nombreComercial:env.C2U_TRADE_NAME,nombreLegal:env.C2U_LEGAL_NAME,numeroDocumentoIdentidad:env.C2U_RUC,tipoDocumentoIdentidad:'RUC'},informacionAdicional:{tipoOperacion:'VENTA_INTERNA'},receptor:{correo:session.email,nombreComercial:b.name||session.customer_name,nombreLegal:b.name||session.customer_name,numeroDocumentoIdentidad:b.document||null,tipoDocumentoIdentidad:b.document?(type==='factura'?'RUC':'DOC_NACIONAL_DE_IDENTIDAD'):null,domicilioFiscal:b.address?{direccion:b.address}:null}};
}
function createClient({env=process.env,fetcher=fetch}={}){
 let cached=null,until=0,pending=null;
 async function token(){
  if(cached&&Date.now()<until)return cached;if(pending)return pending;
  pending=(async()=>{if(!env.C2U_RUC||!env.C2U_USER||!env.C2U_PASSWORD)throw Error('CLOSE2U todavía no está configurado.');
   const r=await fetcher(BASE+'/tokenapi/secure/v2/login/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aplicacion:{codigo:'1'},ruc:Number(env.C2U_RUC),mail:env.C2U_USER,clave:env.C2U_PASSWORD}),signal:AbortSignal.timeout(25000)}),data=await r.json();
   if(!r.ok||!data.c2uToken)throw Error('No se pudo autenticar con CLOSE2U.');cached=data.c2uToken;until=Math.min(Date.parse(data.fechaExpiracion)||Date.now()+3600000,Date.now()+7*3600000)-900000;return cached;
  })();try{return await pending;}finally{pending=null;}
 }
 async function send(session,{preview=false}={}){
  if(!preview&&(session.mode!=='PRODUCTION'||session.status!=='paid'||env.C2U_LIVE_ENABLED!=='true'))throw Error('La emisión fiscal real está deshabilitada.');
  if(preview&&session.mode!=='TEST')throw Error('La vista previa requiere una sesión de prueba.');
  const payload=buildPayload(session,env,{preview}),type=session.billing.type;
  const path=preview?'/preview-api/'+type:'/'.concat(type==='factura'?'factura-api':'boleta-api','/invoice2u/integracion/',type);
  const r=await fetcher(BASE+path+'/'+env.C2U_RUC,{method:'PUT',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(!r.ok)throw Error('CLOSE2U no confirmó el comprobante. Requiere revisión antes de reintentar.');
  const raw=await r.text();try{return JSON.parse(raw);}catch{return raw;}
 }
 return {token,send};
}
module.exports={billing,buildPayload,createClient};
