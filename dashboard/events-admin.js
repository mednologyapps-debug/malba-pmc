'use strict';
let eventPage=0,eventQuery='',eventRequest=0,eventDemo=false,eventInvoiceView=false,invoiceRequest=0;
async function renderEventsEditor(){
 $('.actions').hidden=true;$('.status-row').hidden=true;
 $('#page-title').textContent=eventInvoiceView?'Comprobantes':'Participantes';
 $('#page-description').textContent=eventInvoiceView?'Compras pagadas y entrega de boleta o factura por correo.':'Presentación del libro · 27 de noviembre de 2026 · 7:00 p. m. · Aforo 50';
 const editor=$('#editor');editor.replaceChildren();
 const toolbar=el('div',{class:'event-toolbar event-filters'});
 const viewToggle=el('button',{type:'button',class:'button secondary',text:eventInvoiceView?'Volver a participantes':'Comprobantes y reenvíos'});
 viewToggle.addEventListener('click',()=>{eventInvoiceView=!eventInvoiceView;renderEventsEditor();});
 toolbar.append(viewToggle);
 if(eventInvoiceView){
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
  if(sequence!==invoiceRequest||area!=='events'||!eventInvoiceView)return;
  root.replaceChildren(el('p',{class:'catalog-count',text:r.rows.length+' comprobantes emitidos'}));
  if(!r.rows.length){root.append(el('div',{class:'cms-empty'},[el('h3',{text:'Aún no hay comprobantes emitidos'}),el('p',{text:'Las compras pagadas aparecerán aquí.'})]));return;}
  const scroll=el('div',{class:'event-table-wrap'}),table=el('table',{class:'event-table invoice-admin-table'}),head=el('tr');
  for(const title of ['Comprador','Fecha','Comprobante','Importe','Correo','Acción'])head.append(el('th',{scope:'col',text:title}));
  table.append(el('thead',{},[head]));const tbody=el('tbody');
  for(const item of r.rows){
   const session=item.session||{},billing=session.billing||{},row=el('tr');
   const buyer=el('td',{},[el('strong',{text:session.customer_name||billing.name||'Comprador'})]);
   const date=el('td',{text:session.created_at?new Date(session.created_at).toLocaleString('es-PE',{dateStyle:'short',timeStyle:'short'}):'—'});
   const type=billing.type==='factura'?'Factura':'Boleta',receipt=item.receipt||{};
   const voucher=el('td',{},[el('strong',{text:type+' '+(receipt.serie||'')+'-'+(receipt.numero||'')}),el('small',{text:{sent:'Correo aceptado',pending:'Pendiente de entrega',review:'Requiere reenvío',sending:'Enviando'}[item.delivery_copy_status||'pending']||'Pendiente de entrega'})]);
   const amount=el('td',{text:'S/ '+(Number(session.amount_minor||0)/100).toFixed(2)});
   const email=el('td',{text:session.email||'—'});
   const action=el('td'),button=el('button',{type:'button',class:'button secondary',text:item.delivery_copy_status==='sent'?'Reenviar correo':'Enviar correo'});
   const feedback=el('small',{class:'invoice-mail-feedback',role:'status'});
   if(item.delivery_copy_status==='sending'){button.disabled=true;feedback.textContent='Envío en proceso.';}
   if(item.delivery_copy_error)feedback.textContent=item.delivery_copy_error;
   button.addEventListener('click',async()=>{
    const prompt='Enviar el comprobante '+type+' '+(receipt.serie||'')+'-'+(receipt.numero||'')+' en PDF y XML a '+(session.email||'el comprador')+' con copia a contabilidad@malba-pmc.com. No se realizará otro cobro ni se emitirá otro comprobante.';
    if(!window.confirm(prompt))return;
    button.disabled=true;feedback.textContent='Preparando PDF y XML…';
    try{
     await request('/api/events/admin/payments/resend-invoice-email',{jobId:item.id});
     feedback.textContent='SMTP aceptó el correo para el comprador y Contabilidad.';
     await drawInvoiceRows();
    }catch(error){feedback.textContent=error.message;button.disabled=false;await drawInvoiceRows();}
   });
   action.append(button,feedback);row.append(buyer,date,voucher,amount,email,action);tbody.append(row);
  }
  table.append(tbody);scroll.append(table);root.append(scroll);
 }catch(e){if(sequence===invoiceRequest&&area==='events')root.replaceChildren(el('p',{class:'notice',role:'alert',text:e.message}));}
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
   if(o?.status==='paid'&&!reg.is_test){
    const send=el('button',{type:'button',class:'button secondary',text:'Enviar comprobante'});
    const feedback=el('small',{role:'status'});
    send.addEventListener('click',async()=>{
     if(!window.confirm('Enviar el PDF del comprobante a '+p.email+' y a contabilidad@malba-pmc.com.'))return;
     send.disabled=true;
     feedback.textContent='Enviando…';
     try{
      await request('/api/events/admin/payments/send-issued-invoice',{orderId:o.id});
      feedback.textContent='Correo con PDF aceptado para el cliente y contabilidad.';
     }catch(error){feedback.textContent=error.message;send.disabled=false;}
    });
    book.append(send,feedback);
   }
   row.append(person,contact,status,book);tbody.append(row);
  }
  table.append(tbody);scroll.append(table);root.append(scroll);
  if(r.total>50){const pager=el('div',{class:'event-toolbar'});
   for(const [delta,label]of [[-1,'Anterior'],[1,'Siguiente']]){const b=el('button',{type:'button',class:'button secondary',text:label});b.disabled=delta<0?eventPage===0:(eventPage+1)*50>=r.total;b.addEventListener('click',()=>{eventPage+=delta;drawEventRows();});pager.append(b);}
   pager.append(el('span',{text:'Página '+(eventPage+1)}));root.append(pager);
  }
 }catch(e){if(sequence===eventRequest&&area==='events')root.replaceChildren(el('p',{class:'notice',role:'alert',text:e.message}));}
}
