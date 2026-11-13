'use strict';
const {inflateRawSync}=require('node:zlib');
const BASE='https://tefacturo.pe';
const ACCOUNTING_EMAIL='contabilidad@malba-pmc.com';
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
 return {close2u:{tipoIntegracion:preview?'OFFLINE':'ERP',tipoPlantilla:'01',tipoRegistro:'PRECIOS_CON_IGV'},datosDocumento:{serie:series,numero:0,moneda:'PEN',fechaEmision:local.slice(0,10),horaEmision:local.slice(11,19),formaPago:'CONTADO',medioPago:env.C2U_PAYMENT_METHOD||'TARJETA_DEBITO',condicionPago:'CONTADO',ordencompra:session.provider_order_id,glosa:'Gestión de Proyectos de Transmisión. Factores Clave.'},detalleDocumento:[{codigoProducto:'MALBA-LIBRO-FISICO',descripcion:'Gestión de Proyectos de Transmisión. Factores Clave.',tipoAfectacion:'GRAVADO_OPERACION_ONEROSA',unidadMedida:'UNIDAD_BIENES',cantidad:1,precioVentaUnitarioItem:session.amount_minor/100}],emisor:{correo:env.C2U_ISSUER_EMAIL,nombreComercial:env.C2U_TRADE_NAME,nombreLegal:env.C2U_LEGAL_NAME,numeroDocumentoIdentidad:env.C2U_RUC,tipoDocumentoIdentidad:'RUC'},informacionAdicional:{tipoOperacion:'VENTA_INTERNA'},receptor:{correo:preview?session.email:ACCOUNTING_EMAIL,nombreComercial:b.name||session.customer_name,nombreLegal:b.name||session.customer_name,numeroDocumentoIdentidad:b.document||null,tipoDocumentoIdentidad:b.document?(type==='factura'?'RUC':'DOC_NACIONAL_DE_IDENTIDAD'):null,domicilioFiscal:b.address?{direccion:b.address}:null}};
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
 async function documentQuery(path,receipt,type,base=BASE){
  const ruc=env.C2U_RUC,numero=Number(receipt?.numero),serie=receipt?.serie;
  if(!/^\d{11}$/.test(ruc||'')||!Number.isSafeInteger(numero)||numero<1||!/^\w{1,8}$/.test(serie||'')||!['boleta','factura'].includes(type))throw Error('Comprobante emitido inválido.');
  const response=await fetcher(base+path+'/'+ruc,{method:'PUT',headers:{Authorization:'Bearer '+await token(),'Content-Type':'application/json'},body:JSON.stringify({emisor:Number(ruc),numero,serie,tipoComprobante:type==='factura'?'01':'03'}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('CLOSE2U no devolvió el comprobante solicitado.');
  const raw=await response.text();
  try{return JSON.parse(raw);}catch{return raw;}
 }
 async function issuedPdf(receipt,type){
  const value=await documentQuery('/pdfapi/pdfapi/consultarPdf',receipt,type,'https://jarvis.tefacturo.pe');
  const encoded=typeof value==='string'?value:value?.pdf||value?.base64||value?.archivo;
  if(typeof encoded!=='string'||encoded.length>7000000)throw Error('Respuesta PDF inválida.');
  const pdf=Buffer.from(encoded.trim().replace(/^data:application\/pdf;base64,/,''),'base64');
  if(pdf.subarray(0,5).toString('ascii')!=='%PDF-')throw Error('Respuesta PDF inválida.');
  return pdf;
 }
 function xmlFile(bytes){
  if(bytes.subarray(0,5).toString('ascii').trimStart().startsWith('<?xml')||bytes.subarray(0,1).toString('ascii')==='<')return bytes;
  // CLOSE2U returns xmlFirma as a base64 ZIP containing the signed XML.
  let end=-1;
  for(let i=Math.max(0,bytes.length-65557);i<=bytes.length-22;i++){if(bytes.readUInt32LE(i)===0x06054b50)end=i;}
  if(end<0)throw Error('CLOSE2U devolvió un XML inválido.');
  let offset=bytes.readUInt32LE(end+16),entries=bytes.readUInt16LE(end+10);
  for(let i=0;i<entries;i++){
   if(offset+46>bytes.length||bytes.readUInt32LE(offset)!==0x02014b50)throw Error('CLOSE2U devolvió un XML inválido.');
   const method=bytes.readUInt16LE(offset+10),compressed=bytes.readUInt32LE(offset+20),uncompressed=bytes.readUInt32LE(offset+24),nameLength=bytes.readUInt16LE(offset+28),extraLength=bytes.readUInt16LE(offset+30),commentLength=bytes.readUInt16LE(offset+32),local=bytes.readUInt32LE(offset+42),name=bytes.subarray(offset+46,offset+46+nameLength).toString('utf8');
   if(name.toLowerCase().endsWith('.xml')){
    if(uncompressed>5000000||local+30>bytes.length||bytes.readUInt32LE(local)!==0x04034b50)throw Error('CLOSE2U devolvió un XML inválido.');
    const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28),data=bytes.subarray(start,start+compressed);
    const result=method===0?Buffer.from(data):method===8?inflateRawSync(data,{maxOutputLength:5000000}):null;
    if(!result||result.length>5000000||!result.toString('utf8').trimStart().startsWith('<?xml'))throw Error('CLOSE2U devolvió un XML inválido.');
    return result;
   }
   offset+=46+nameLength+extraLength+commentLength;
  }
  throw Error('CLOSE2U no incluyó el XML firmado.');
 }
 async function issuedXml(receipt,type){
  const value=await documentQuery('/consulta-api/invoice2u/integracion/consultarXml',receipt,type,'https://jarvis.tefacturo.pe');
  const encoded=typeof value==='object'&&value?value.xmlFirma:null;
  if(typeof encoded!=='string'||encoded.length>9000000)throw Error('Respuesta XML inválida.');
  const raw=Buffer.from(encoded,'base64');
  if(!raw.length||raw.length>7000000)throw Error('Respuesta XML inválida.');
  return xmlFile(raw);
 }
 async function deliveryStatus(receipt,type){
  const result=await documentQuery('/consulta-api/invoice2u/integracion/consultarEstado',receipt,type);
  const state=result?.estadoEntrega??result?.estadoEntregaCorreo;
  const code=String(state?.codigo??state??'');
  return ['0','1','2','3'].includes(code)?code:null;
 }
 return {token,send,issuedPdf,issuedXml,deliveryStatus};
}
module.exports={billing,buildPayload,createClient,ACCOUNTING_EMAIL};
