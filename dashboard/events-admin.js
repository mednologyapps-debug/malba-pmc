'use strict';
let eventPage=0,eventQuery='',eventRequest=0,eventDemo=false;
async function renderEventsEditor(){
 $('.actions').hidden=true;$('.status-row').hidden=true;
 $('#page-title').textContent='Participantes';
 $('#page-description').textContent='Presentación del libro · 27 de noviembre de 2026 · 7:00 p. m. · Aforo 50';
 const editor=$('#editor');editor.replaceChildren();
 const toolbar=el('div',{class:'event-toolbar event-filters'});
 const search=el('input',{type:'search',placeholder:'Buscar por nombre o correo','aria-label':'Buscar participantes',value:eventQuery});
 let timer;search.addEventListener('input',()=>{eventQuery=search.value;eventPage=0;clearTimeout(timer);timer=setTimeout(drawEventRows,300);});
 const demoCheck=el('input',{type:'checkbox'});demoCheck.checked=eventDemo;demoCheck.addEventListener('change',()=>{eventDemo=demoCheck.checked;eventPage=0;drawEventRows();});toolbar.append(search,el('label',{},[demoCheck,el('span',{text:'Ver pruebas'})]));editor.append(toolbar,el('div',{id:'event-records','aria-live':'polite'}));
 await drawEventRows();
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
