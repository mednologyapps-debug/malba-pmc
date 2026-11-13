'use strict';
let eventPage=0,eventQuery='',eventRequest=0,eventDemo=false,invoiceRequest=0;
async function renderEventsEditor(){
 const purchaseView=area==='book-sales';
 $('.actions').hidden=true;$('.status-row').hidden=true;
 $('#page-title').textContent=purchaseView?'Compras del libro':'Participantes';
 $('#page-description').textContent=purchaseView?'Pedidos pagados, estado del correo y archivos de boleta o factura.':'Presentación del libro · 27 de noviembre de 2026 · 7:00 p. m. · Aforo 50';
 const editor=$('#editor');editor.replaceChildren();
 const toolbar=el('div',{class:'event-toolbar event-filters'});
 const viewToggle=el('button',{type:'button',class:'button secondary',text:purchaseView?'← Volver a participantes':'Ver compras del libro'});
 viewToggle.addEventListener('click',()=>{area=purchaseView?'events':'book-sales';selected='overview';renderNavigation();renderEventsEditor();});
 toolbar.append(viewToggle);
 if(purchaseView){
  const refresh=el('button',{type:'button',class:'button secondary',text:'Actualizar lista'});
  refresh.addEventListener('click',drawInvoiceRows);
  toolbar.append(refresh);
  editor.append(toolbar,el('div',{id:'invoice-records','aria-live':'polite'}));
  await drawInvoiceRows();return;
 }
 const search=el('input',{type:'search',placeholder:'Buscar por nombre o correo','aria-label':'Buscar participantes',value:eventQuery});
 let timer;search.addEventListener('input',()=>{eventQuery=search.value;eventPage=0;clearTimeout(timer);timer=setTimeout(drawEventRows,300);});
 const demoCheck=el('input',{type:'checkbox'});demoCheck.checked=eventDemo;demoCheck.addEventListener('change',()=>{eventDemo=demoCheck.checked;eventPage=0;drawEventRows();});const retry=el('button',{type:'button',class:'button secondary',text:'Reintentar correos fallidos'});
 const emailStatus=el('span',{class:'event-mail-status',role:'status'});
 retry.addEventListener('click',async()=>{retry.disabled=true;emailStatus.textContent='Enviando…';
  try{const result=await request('/api/events/admin/mail',{retry:true});emailStatus.textContent='Correos enviados: '+Number(result.sent||0)+'. '+(result.failed?'Algunos envíos siguen fallando; revisa SMTP.':'');}
  catch(e){emailStatus.textContent=e.message;}finally{retry.disabled=false;}
 });
 const cipLink=el('a',{class:'button secondary',text:'Abrir inscripción del CIP ↗'});cipLink.href='https://cipvirtual.cip.org.pe/siceeventosweb/externo/evento/inscripcionWeb/YMqywgANvYscRkIs0W9SxVae9ll4w2';cipLink.target='_blank';cipLink.rel='noopener noreferrer';
  const cipNote=el('div',{class:'event-cip-notice'},[el('strong',{text:'Inscripción oficial gestionada por el CIP'}),el('p',{text:'Los datos del formulario externo no llegan automáticamente a esta lista. Aquí aparecen únicamente registros guardados en MALBA.'}),cipLink]);
  toolbar.append(search,el('label',{},[demoCheck,el('span',{text:'Ver pruebas'})]),retry,emailStatus);editor.append(cipNote,toolbar,el('div',{id:'event-records','aria-live':'polite'}));
 await drawEventRows();
}
async function drawInvoiceRows(){
 const sequence=++invoiceRequest,root=$('#invoice-records');if(!root)return;
 root.replaceChildren(el('p',{class:'catalog-count',text:'Cargando comprobantes…'}));
 try{
  const r=await request('/api/events/admin/payments/invoices');
  if(sequence!==invoiceRequest||area!=='book-sales')return;
  root.replaceChildren(el('p',{class:'catalog-count',text:r.rows.length+' compras pagadas'}));
  if(!r.rows.length){root.append(el('div',{class:'cms-empty'},[el('h3',{text:'Aún no hay compras pagadas'}),el('p',{text:'Las compras confirmadas aparecerán aquí.'})]));return;}
  const scroll=el('div',{class:'event-table-wrap'}),table=el('table',{class:'event-table invoice-admin-table'}),head=el('tr');
  for(const title of ['Comprador','Fecha','Comprobante','Importe','Correo del cliente','Entrega y archivos','Acción'])head.append(el('th',{scope:'col',text:title}));
  table.append(el('thead',{},[head]));const tbody=el('tbody');
  for(const item of r.rows){
   const session=item.session||{},billing=session.billing||{},row=el('tr');
   const buyer=el('td',{},[el('strong',{text:session.customer_name||billing.name||'Comprador'})]);
   const date=el('td',{text:session.created_at?new Date(session.created_at).toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'}):'—'});
   const type=billing.type==='factura'?'Factura':'Boleta',receipt=item.receipt||{},invoiceStatus=item.invoice_status||item.status||'pending',hasReceipt=!!receipt.serie&&Number.isSafeInteger(Number(receipt.numero))&&Number(receipt.numero)>0;
   const voucher=el('td',{},[el('strong',{text:hasReceipt?type+' '+receipt.serie+'-'+receipt.numero:type}),el('small',{text:hasReceipt?(invoiceStatus==='issued'?'Comprobante emitido':invoiceStatus==='review'?'Folio existente · estado por revisar':'Folio existente · validar estado'):invoiceStatus==='review'?'Emisión requiere revisión':'Comprobante pendiente de emisión'})]);
   const amount=el('td',{text:'S/ '+(Number(session.amount_minor||0)/100).toFixed(2)});
   const email=el('td',{text:session.email||'—'});
   const delivery=el('td'),meta=(()=>{try{return JSON.parse(item.delivery_provider_status||'{}')}catch{return {}}})();
   const deliveryState=item.delivery_copy_status==='sent'?(meta.buyerAccepted?'Aceptado por SMTP':'Envío anterior; aceptación no verificable'):item.delivery_copy_status==='sending'?'Envío en proceso':item.delivery_copy_status==='review'?(String(item.delivery_copy_error||'').includes('CLOSE2U')?'No se pudieron obtener PDF/XML de Close2U':'Correo requiere reintento'):hasReceipt?'Pendiente de envío':'A la espera del comprobante';
   delivery.append(el('strong',{text:deliveryState}));
   if(item.delivery_copy_status==='sent'&&Array.isArray(meta.attachments)&&meta.attachments.includes('PDF')&&meta.attachments.includes('XML'))delivery.append(el('small',{text:'Adjuntos confirmados: PDF y XML'}));
   else if(item.delivery_copy_status==='sent')delivery.append(el('small',{text:'PDF/XML de este envío no verificables. Reenvía para confirmar los adjuntos.'}));
   if(item.delivery_copy_status==='sent'&&meta.accountingAccepted===true)delivery.append(el('small',{text:'Copia a contabilidad aceptada por SMTP'}));
   if(item.delivery_copy_status==='sent'&&meta.accountingAccepted===false)delivery.append(el('small',{text:'Copia a contabilidad no confirmada'}));
   if(item.delivery_copy_sent_at)delivery.append(el('small',{text:'Enviado: '+new Date(item.delivery_copy_sent_at).toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'})}));
   const action=el('td'),button=el('button',{type:'button',class:'button secondary',text:item.delivery_copy_status==='sent'?'Reenviar PDF + XML':item.delivery_copy_status==='review'?'Reintentar PDF + XML':'Enviar PDF + XML'});
   button.disabled=!hasReceipt||item.delivery_copy_status==='sending';
   const feedback=el('small',{class:'invoice-mail-feedback',role:'status'});
   if(hasReceipt&&invoiceStatus!=='issued')feedback.textContent='Se usará el folio ya asignado; no se volverá a emitir ni cobrar.';
   else if(!hasReceipt&&invoiceStatus==='review')feedback.textContent=item.last_error||'La emisión requiere revisión en Close2U antes de enviar el correo.';
   else if(!hasReceipt)feedback.textContent='El envío se habilitará cuando Close2U emita el comprobante.';
   if(item.delivery_copy_status==='sending'){button.disabled=true;feedback.textContent='Envío en proceso.';}
   if(item.delivery_copy_error)feedback.textContent=item.delivery_copy_error;
   button.addEventListener('click',async()=>{
    if(!hasReceipt)return;
    const prompt='Enviar el comprobante '+type+' '+(receipt.serie||'')+'-'+(receipt.numero||'')+' en PDF y XML a '+(session.email||'el comprador')+' con copia a contabilidad@malba-pmc.com. No se realizará otro cobro ni se emitirá otro comprobante.';
    if(!window.confirm(prompt))return;
    button.disabled=true;feedback.textContent='Preparando PDF y XML…';
    try{
     await request('/api/events/admin/payments/resend-invoice-email',{jobId:item.id});
     feedback.textContent='SMTP aceptó el correo y los adjuntos PDF y XML. La recepción en la bandeja no se puede confirmar desde el servidor.';
     await drawInvoiceRows();
    }catch(error){feedback.textContent=error.message;button.disabled=false;await drawInvoiceRows();}
   });
   action.append(button,feedback);row.append(buyer,date,voucher,amount,email,delivery,action);tbody.append(row);
  }
  table.append(tbody);scroll.append(table);root.append(scroll);
 }catch(e){if(sequence===invoiceRequest&&area==='book-sales')root.replaceChildren(el('p',{class:'notice',role:'alert',text:e.message}));}
}
async function drawEventRows(){
 const sequence=++eventRequest,root=$('#event-records');if(!root)return;
 try{
  const params=new URLSearchParams({page:eventPage,q:eventQuery});
  const r=await request((eventDemo?'/api/events/admin/demo/registrations?':'/api/events/admin/registrations?')+params);
  if(sequence!==eventRequest||area!=='events')return;
  root.replaceChildren(el('p',{class:'catalog-count',text:r.total+' participantes'+(r.temporary?' · Pruebas temporales: se conservan hasta 2 horas o hasta reiniciar el servidor.':'')}));
  if(!r.rows.length){root.append(el('div',{class:'cms-empty'},[el('h3',{text:eventQuery?'No encontramos participantes':'Aún no hay participantes'}),el('p',{text:eventQuery?'Prueba con otro nombre o correo.':'Las inscripciones aparecerán aquí.'})]));return;}
  const scroll=el('div',{class:'event-table-wrap'}),table=el('table',{class:'event-table'}),head=el('tr');
  for(const title of ['Participante','Contacto','Inscripción','Estado del libro'])head.append(el('th',{scope:'col',text:title}));
  table.append(el('thead',{},[head]));const tbody=el('tbody');
  for(const reg of r.rows){
   const p=reg.book_participants,o=reg.book_orders?.[0],row=el('tr');
   const person=el('td',{},[el('strong',{text:p.full_name})]);if(reg.is_test)person.append(el('small',{text:'Registro de prueba'}));
   const contact=el('td',{},[el('span',{text:p.email}),el('span',{text:p.phone})]);
   const status=el('td',{},[el('span',{text:{registered:'Inscrito',waitlist:'Lista de espera',cancelled:'Cancelado'}[reg.status]||reg.status})]);
   const book=el('td'),label=o?.status==='paid'?'Compró el libro':o?.status==='simulated_paid'?'Compra simulada':o?.status==='pending'?'Pago pendiente':o?.status==='failed'?'Pago fallido':o?.status==='cancelled'?'Pedido cancelado':'Sin compra';
   book.append(el('span',{class:'event-book-badge '+(o?.status==='paid'?'purchased':o?'pending':'none'),text:label}));
   if(o)book.append(el('small',{text:'S/ '+Number(o.amount).toFixed(2)}));
   row.append(person,contact,status,book);tbody.append(row);
  }
  table.append(tbody);scroll.append(table);root.append(scroll);
  if(r.total>50){const pager=el('div',{class:'event-toolbar'});
   for(const [delta,label]of [[-1,'Anterior'],[1,'Siguiente']]){const b=el('button',{type:'button',class:'button secondary',text:label});b.disabled=delta<0?eventPage===0:(eventPage+1)*50>=r.total;b.addEventListener('click',()=>{eventPage+=delta;drawEventRows();});pager.append(b);}
   pager.append(el('span',{text:'Página '+(eventPage+1)}));root.append(pager);
  }
 }catch(e){if(sequence===eventRequest&&area==='events')root.replaceChildren(el('p',{class:'notice',role:'alert',text:e.message}));}
}
