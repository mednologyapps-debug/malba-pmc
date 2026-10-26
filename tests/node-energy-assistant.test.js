const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'site-widgets.js'),'utf8');

function mountAssistant(settings){
  const listeners={};
  class Element {
    constructor(tag){
      this.tagName=tag.toUpperCase();this.children=[];this.attributes={};
      this.listeners={};this.dataset={};this.hidden=false;this.className='';this.textContent='';
      this.style={};
      this.classList={
        toggle:(name,enabled)=>{
          const set=new Set(this.className.split(/\s+/).filter(Boolean));
          if(enabled)set.add(name);else set.delete(name);
          this.className=[...set].join(' ');
        }
      };
    }
    append(...children){this.children.push(...children);}
    setAttribute(name,value){this.attributes[name]=String(value);}
    addEventListener(name,callback){this.listeners[name]=callback;}
    get lastElementChild(){return this.children[this.children.length-1]||null;}
    focus(){this.focused=true;}
    contains(other){return this===other||this.children.some(c=>c.contains(other));}
    click(){this.listeners.click?.({target:this});}
  }
  const body=new Element('body');
  const document={
    body,
    querySelector:()=>null,
    createElement:tag=>new Element(tag),
    addEventListener:(name,fn)=>{listeners[name]=fn;}
  };
  const window={};
  const fetch=(url,opts)=>{
    assert.equal(url,'/api/public-settings');
    assert.equal(opts.cache,'no-store');
    return Promise.resolve({
      ok:true,headers:{get:()=> 'application/json; charset=utf-8'},
      json:()=>Promise.resolve(settings)
    });
  };
  vm.runInNewContext(script,{document,window,fetch});
  const find=(node,cls)=>{
    if(node.className.split(/\s+/).includes(cls))return node;
    for(const c of node.children){const found=find(c,cls);if(found)return found;}
    return null;
  };
  return {body,window,listeners,find:cls=>find(body,cls)};
}

test('approved energy mascot WebP exists and is optimized',()=>{
  const bytes=fs.readFileSync(path.join(root,'assets/assistant-malba-energy.webp'));
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');
  assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  assert.ok(bytes.length<15000,'mascot must remain lightweight');
});

test('bubble opens accessible FAQ panel and links to real MALBA sections',async()=>{
  const widget=mountAssistant({whatsappEnabled:true,whatsappNumber:'51932563293',whatsappMessage:'Hola MALBA'});
  const {find}=widget;
  const bubble=find('malba-assistant-bubble'),launcher=find('malba-assistant-trigger');
  const panel=find('malba-assistant-panel');
  assert.equal(bubble.textContent,'¿Cómo puedo ayudarte?');
  assert.equal(panel.hidden,true);
  assert.equal(launcher.attributes['aria-controls'],'malba-assistant-panel');
  const quick=find('malba-assistant-quicklinks');
  assert.deepEqual(Array.from(quick.children,x=>x.href),[
    '/academia/','/soluciones-digitales/','/publicaciones/','/consultoria/'
  ]);
  bubble.click();
  assert.equal(panel.hidden,false);
  assert.equal(launcher.attributes['aria-expanded'],'true');
  assert.equal(find('malba-assistant-bubble').className,'malba-assistant-bubble');
  widget.listeners.keydown({key:'Escape'});
  assert.equal(panel.hidden,true);
  launcher.click();
  find('malba-assistant-close').click();
  assert.equal(panel.hidden,true);
  await new Promise(resolve=>setImmediate(resolve));
  const contact=find('malba-assistant-link');
  assert.equal(contact.hidden,false);
  assert.ok(contact.href.startsWith('https://wa.me/51932563293?text='));
  assert.equal(contact.rel,'noopener noreferrer');
});

test('FAQs stay available if CMS disables WhatsApp',async()=>{
  const widget=mountAssistant({whatsappEnabled:false,whatsappNumber:'51932563293'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(widget.find('malba-assistant-link').hidden,true);
  assert.equal(widget.find('malba-assistant-quicklinks').children.length,4);
  widget.find('malba-assistant-trigger').click();
  assert.equal(widget.find('malba-assistant-panel').hidden,false);
});

test('public pages load shared widget without modifying admin or student aula',()=>{
  const loader=fs.readFileSync(path.join(root,'app.js'),'utf8');
  assert.match(loader,/site-widgets\.js/);
  for(const page of ['index.html','academia/index.html','publicaciones/index.html','consultoria/index.html','soluciones-digitales/index.html']){
    const html=fs.readFileSync(path.join(root,page),'utf8');
    assert.match(html,/app\.js/);
    assert.match(html,/home-sections\.css/);
  }
  const css=fs.readFileSync(path.join(root,'home-sections.css'),'utf8');
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/malba-assistant-quicklinks/);
  assert.match(css,/100dvh/);
});
