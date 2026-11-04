'use strict';
let eventPage=0,eventQuery='',eventRequest=0,eventDemo=false;
async function renderBookEventSettings(editor){
 const section=el('section',{class:'event-settings'});
 section.append(el('h2',{text:'Configuración del evento'}),el('p',{class:'event-settings-description',text:'Publica la inscripción gratuita y configura el libro desde aquí. El aforo y la política de privacidad son obligatorios para abrir el registro.'}));
 editor.append(section);
 try{
  const [response,health]=await Promise.all([request('/api/events/admin/config'),request('/api/events/admin/payments/health')]);
  const c=response.config||{},form=el('form',{class:'event-settings-form'});
  const inputs={};
  function field(name,label,type,value,extra={}){
   const wrap=el('label',{class:'event-settings-field'}),input=el('input',{type,value:value??'',...extra});
   input.name=name;inputs[name]=input;wrap.append(el('span',{text:label}),input);form.append(wrap);return input;
  }
  function toggle(name,label,value){
   const wrap=el('label',{class:'event-settings-toggle'}),input=el('input',{type:'checkbox'});
   input.name=name;input.checked=!!value;inputs[name]=input;wrap.append(input,el('span',{text:label}));form.append(wrap);return input;
  }
  function choice(name,label,value,values){
   const wrap=el('label',{class:'event-settings-field'}),select=el('select');
   select.name=name;inputs[name]=select;for(const [v,text]of values){const opt=el('option',{value:v,text});select.append(opt);}
   select.value=value||values[0][0];wrap.append(el('span',{text:label}),select);form.append(wrap);return select;
  }
  const peruDate=iso=>{if(!iso)return '';const d=new Date(iso);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(' ','T');};
  const toUtc=value=>value?new Date(value+':00-05:00').toISOString():null;
  field('title','Nombre del evento','text',c.title,{required:true,maxLength:180});
  field('date','Fecha y hora · Perú','datetime-local',peruDate(c.date),{required:true});
  field('location','Lugar','text',c.location,{required:true,maxLength:300});
  field('capacity','Aforo máximo','number',c.capacity,{required:true,min:1,max:100000});
  field('adminEmail','Correo que recibe inscripciones','email',c.adminEmail,{required:true,maxLength:180});
  field('privacyUrl','URL HTTPS de política de privacidad','url',c.privacyUrl,{required:true});
  choice('status','Estado de publicación',c.status,[['draft','Borrador'],['published','Publicado'],['closed','Cerrado'],['cancelled','Cancelado']]);
  toggle('registrationOpen','Habilitar inscripciones al evento',c.registrationOpen);
  toggle('waitlist','Habilitar lista de espera al completar aforo',c.waitlist);
  field('price','Precio del libro (S/)','number',c.price,{step:'0.01',min:'0.01'});
  field('regularPrice','Precio regular (S/)','number',c.regularPrice,{step:'0.01',min:'0.01'});
  toggle('priceConfirmed','Precio confirmado',c.priceConfirmed);
  toggle('bookAvailable','Habilitar compra del libro físico',c.bookAvailable);
  const payment=choice('paymentMode','Modalidad de pago',c.paymentMode,[['disabled','Deshabilitado'],['sandbox','Izipay TEST'],['production','Izipay LIVE']]);
  if(!health.izipayProduction)payment.querySelector('[value=production]').disabled=true;
  const healthLine=el('p',{class:'event-settings-health',text:'Izipay LIVE: '+(health.izipayProduction?'configurado':'no configurado')+' · Facturador: '+(health.close2uConfigured?'configurado':'no configurado')+' · Emisión fiscal LIVE: '+(health.realInvoices?'habilitada':'deshabilitada')});
  const result=el('p',{class:'event-settings-result',role:'status'});
  const submit=el('button',{type:'submit',class:'button button-purple',text:'Guardar configuración'});form.append(submit);section.append(healthLine,form,result);
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(!form.reportValidity())return;submit.disabled=true;result.textContent='Guardando…';
   try{
    const next={...c};for(const [name,input]of Object.entries(inputs)){next[name]=input.type==='checkbox'?input.checked:input.value;}
    next.date=toUtc(next.date);next.capacity=next.capacity?Number(next.capacity):null;
    next.price=next.price?Number(next.price):null;next.regularPrice=next.regularPrice?Number(next.regularPrice):null;
    const saved=await request('/api/events/admin/config',{revision:response.revision,config:next});
    response.revision=saved.revision;c.title=saved.config.title;Object.assign(c,saved.config);
    result.textContent='Configuración guardada. Los cambios ya se reflejan en la landing del evento.';
   }catch(err){result.textContent=err.message;}
   finally{submit.disabled=false;}
  });
 }catch(err){section.append(el('p',{class:'notice',role:'alert',text:'No se pudo cargar la configuración: '+err.message}));}
}
async function renderEventsEditor(){
 $('.actions').hidden=true;$('.status-row').hidden=true;
 $('#page-title').textContent='Participantes';
 $('#page-description').textContent='Presentación del libro';
 const editor=$('#editor');editor.replaceChildren();
 await renderBookEventSettings(editor);
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
  for(const title of ['Participante','Contacto','Empresa y cargo','Inscripción','Libro'])head.append(el('th',{scope:'col',text:title}));
  table.append(el('thead',{},[head]));const tbody=el('tbody');
  for(const reg of r.rows){
   const p=reg.book_participants,o=reg.book_orders?.[0],row=el('tr');
   const person=el('td',{},[el('strong',{text:p.full_name})]);if(reg.is_test)person.append(el('small',{text:'Registro de prueba'}));
   const contact=el('td',{},[el('span',{text:p.email}),el('span',{text:p.phone})]);
   const company=el('td',{},[el('span',{text:p.company||'—'}),el('small',{text:p.position||''})]);
   const status=el('td',{},[el('span',{text:{registered:'Inscrito',waitlist:'Lista de espera',cancelled:'Cancelado'}[reg.status]||reg.status})]);
   const book=el('td'),label=o?.status==='paid'?'Compró el libro':o?.status==='simulated_paid'?'Compra simulada':o?.status==='pending'?'Pago pendiente':o?.status==='failed'?'Pago fallido':o?.status==='cancelled'?'Pedido cancelado':'Sin compra';
   book.append(el('span',{class:'event-book-badge '+(o?.status==='paid'?'purchased':o?'pending':'none'),text:label}));
   if(o)book.append(el('small',{text:'S/ '+Number(o.amount).toFixed(2)}));
   row.append(person,contact,company,status,book);tbody.append(row);
  }
  table.append(tbody);scroll.append(table);root.append(scroll);
  if(r.total>50){const pager=el('div',{class:'event-toolbar'});
   for(const [delta,label]of [[-1,'Anterior'],[1,'Siguiente']]){const b=el('button',{type:'button',class:'button secondary',text:label});b.disabled=delta<0?eventPage===0:(eventPage+1)*50>=r.total;b.addEventListener('click',()=>{eventPage+=delta;drawEventRows();});pager.append(b);}
   pager.append(el('span',{text:'Página '+(eventPage+1)}));root.append(pager);
  }
 }catch(e){if(sequence===eventRequest&&area==='events')root.replaceChildren(el('p',{class:'notice',role:'alert',text:e.message}));}
}
