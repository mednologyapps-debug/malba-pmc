// Plan selection is a request for access; payment and activation remain separate.
const saasDialog=document.querySelector('#saas-plan-dialog');
if(saasDialog){
 const names={individual:'Individual',universitario:'Universitario',empresarial:'Empresarial'};
 const form=saasDialog.querySelector('form'),quantity=form.elements.quantity;let selected='individual',trigger;
 const update=()=>{saasDialog.querySelector('[data-plan-name]').textContent='Plan '+names[selected];saasDialog.querySelector('[data-plan-quantity]').textContent=quantity.value+' '+(quantity.value==='1'?'licencia personal':'licencias personales');};
 document.querySelectorAll('[data-saas-plan]').forEach(button=>button.addEventListener('click',()=>{trigger=button;selected=button.dataset.saasPlan;quantity.value=selected==='individual'?'1':'10';quantity.readOnly=selected==='individual';update();saasDialog.showModal();}));
 quantity.addEventListener('input',update);
 saasDialog.querySelector('.saas-dialog-close').addEventListener('click',()=>saasDialog.close());
 saasDialog.addEventListener('close',()=>trigger?.focus());
 saasDialog.addEventListener('click',e=>{if(e.target===saasDialog){const r=saasDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)saasDialog.close();}});
 form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const count=Number(quantity.value);if(!Number.isInteger(count)||count<1||count>1000)return;const message=`Hola, deseo información de MALBA Simulator. Plan ${names[selected]}, ${count} licencia(s). Quisiera confirmar la tarifa y disponibilidad. Entiendo que cada licencia está asociada a un correo.`;window.open('https://wa.me/51932563293?text='+encodeURIComponent(message),'_blank','noopener,noreferrer');});
}
