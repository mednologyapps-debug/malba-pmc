const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const net=require('node:net');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {once}=require('node:events');

// Integration tests use the real supabase-js SDK against local Auth/REST and
// SMTP fixtures. No production credentials, records, or email recipients.
test('Node enrollment, email and student authentication never alter admin authority',async(t)=>{
  const key='local-service-role-fixture',profiles=new Map(),users=new Map(),enrollments=[];
  const courseId='10000000-0000-4000-8000-000000000001';
  let polluted=0,failProfile=false,failStudentWrite=false,mail='';
  const backend=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost'),chunks=[];
    for await(const chunk of req)chunks.push(chunk);
    const raw=Buffer.concat(chunks).toString(),body=raw?JSON.parse(raw):{};
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
    if(url.pathname==='/auth/v1/token'){
      const user=[...users.values()].find(u=>u.email===body.email);
      if(!user||user.password!==body.password)return send(400,{error_code:'invalid_credentials',msg:'Invalid login credentials'});
      const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'fixture'].join('.');
      return send(200,{access_token:token,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user});
    }
    if(req.headers.authorization!==`Bearer ${key}`){polluted++;return send(403,{code:'42501',message:'permission denied: user token replaced service role'});}
    if(url.pathname==='/auth/v1/admin/users'){
      if(req.method==='GET')return send(200,{users:[...users.values()],aud:'authenticated'});
      const user={id:require('node:crypto').randomUUID(),email:body.email,password:body.password,app_metadata:body.app_metadata||{},user_metadata:body.user_metadata||{}};
      users.set(user.id,user);return send(200,user);
    }
    if(url.pathname.startsWith('/auth/v1/admin/users/')){
      const user=users.get(url.pathname.split('/').pop());if(req.method==='DELETE'){users.delete(user?.id);return send(200,{})}Object.assign(user,body);return send(200,user);
    }
    const table=url.pathname.split('/').pop();
    const single=String(req.headers.accept||'').includes('object+json');
    let rows=[];
    if(table==='lms_students'){
      if(failProfile)return send(500,{code:'fixture_error',message:'temporary profile lookup failure'});
      if(failStudentWrite&&['POST','PATCH'].includes(req.method))return send(500,{code:'fixture_error',message:'simulated profile write failure'});
      if(['POST','PATCH'].includes(req.method)){
        const filter=url.searchParams.get('id')||'',ids=body.id?[body.id]:filter.startsWith('eq.')?[filter.slice(3)]:filter.startsWith('in.(')?filter.slice(4,-1).split(','):[];
        for(const id of ids){const previous=profiles.get(id)||{};profiles.set(id,{...previous,...body,id});rows.push(profiles.get(id));}
      }else rows=[...profiles.values()];
    }else if(table==='lms_enrollments'){
      if(req.method==='POST')enrollments.push(body);
      rows=enrollments;
    }else if(table==='lms_courses')rows=[{id:courseId,title:'Curso local de prueba',status:'published'}];
    else if(table==='cms_documents')rows=[{id:'site',draft:{programs:[]},published:{programs:[]},revision:1}];
    for(const [field,value] of url.searchParams){if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[field])===value.slice(3));}
    return send(200,single?(rows[0]||null):rows);
  });
  backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const smtp=net.createServer(socket=>{
    socket.write('220 local fixture SMTP\r\n');let buffer='',data=false;
    socket.on('data',chunk=>{buffer+=chunk;let pos;
      while((pos=buffer.indexOf('\r\n'))!==-1){const line=buffer.slice(0,pos);buffer=buffer.slice(pos+2);
        if(data){if(line==='.'){data=false;socket.write('250 accepted\r\n');}else mail+=line+'\n';continue;}
        if(/^EHLO/.test(line))socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
        else if(/^DATA/.test(line)){data=true;socket.write('354 send data\r\n');}
        else if(/^AUTH/.test(line))socket.write('235 authenticated\r\n');
        else if(/^QUIT/.test(line)){socket.end('221 bye\r\n');}
        else socket.write('250 ok\r\n');
      }
    });
  });smtp.listen(0,'127.0.0.1');await once(smtp,'listening');
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const origin=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,[process.env.MALBA_TEST_SERVER||'server.js'],{
    cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:String(port),NODE_ENV:'test',SUPABASE_URL:`http://127.0.0.1:${backend.address().port}`,SUPABASE_SERVICE_ROLE_KEY:key,SUPABASE_ANON_KEY:'',CMS_ADMIN_USER:'fixture-admin',CMS_ADMIN_PASSWORD:'fixture-admin-password',CMS_COOKIE_SECRET:'fixture-cookie-secret',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.address().port),SMTP_SECURE:'false',SMTP_USER:'fixture@invalid.test',SMTP_PASSWORD:'local-only',PUBLIC_ORIGIN:origin,AULA_URL:origin+'/aula-virtual/'},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',x=>logs+=x);child.stderr.on('data',x=>logs+=x);
  t.after(async()=>{child.kill();await once(child,'exit');backend.closeAllConnections();await new Promise(r=>backend.close(r));await new Promise(r=>smtp.close(r));});
  for(let i=0;i<100&&!logs.includes('listening on');i++){if(child.exitCode!==null)throw new Error(logs);await new Promise(r=>setTimeout(r,20));}
  async function request(route,body,cookie='',csrf=''){
    const response=await fetch(origin+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',cookie,'X-CSRF-Token':csrf},body:body===undefined?undefined:JSON.stringify(body)});
    return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  let admin=await request('/api/login',{username:'fixture-admin',password:'fixture-admin-password'});
  assert.equal(admin.status,200);const csrf=admin.data.csrf;
  const saved=await request('/api/lms/admin/student',{name:'Alumno Fixture',email:'student@invalid.test',password:'Local-password-123',active:true,courseId,sendEmail:true},admin.cookie,csrf);
  assert.equal(saved.status,200);assert.equal(saved.data.email.sent,true);
  assert.equal(profiles.get(saved.data.id).active,true);assert.equal(enrollments.length,1);
  for(const route of ['/api/lms/admin/students/template','/api/lms/admin/students/export']){
    const excel=await fetch(origin+route,{headers:{cookie:admin.cookie}}),bytes=Buffer.from(await excel.arrayBuffer());
    assert.equal(excel.status,200);assert.match(excel.headers.get('content-type'),/spreadsheetml/);assert.equal(bytes.subarray(0,2).toString(),'PK');
    const workbook=new (require('exceljs').Workbook)();await workbook.xlsx.load(bytes);assert.equal(workbook.worksheets[0].name,'Alumnos');
  }
  const bulk=await request('/api/lms/admin/students/bulk',{ids:[saved.data.id],action:'disable'},admin.cookie,csrf);
  assert.equal(bulk.status,200);assert.equal(profiles.get(saved.data.id).active,false);
  await request('/api/lms/admin/students/bulk',{ids:[saved.data.id],action:'enable'},admin.cookie,csrf);
  assert.equal(profiles.get(saved.data.id).active,true);
  const importWorkbook=new (require('exceljs').Workbook)(),sheet=importWorkbook.addWorksheet('Alumnos');
  sheet.addRow(['Nombre','Correo','Contraseña','Estado']);sheet.addRow(['Importado Fixture','importado@invalid.test','Imported-password-123','Activo']);
  const imported=await request('/api/lms/admin/students/import',{filename:'alumnos.xlsx',content:Buffer.from(await importWorkbook.xlsx.writeBuffer()).toString('base64'),courseId,sendEmail:false},admin.cookie,csrf);
  assert.equal(imported.status,200);assert.equal(imported.data.created,1);assert.equal(imported.data.enrolled,1);assert.equal(imported.data.errors.length,0);
  const decodedMail=mail.replace(/=\n/g,'').replace(/=([0-9A-F]{2})/g,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
  assert.match(decodedMail,/Ingresar al aula virtual/);
  assert.ok(!decodedMail.includes('AULA VIRTUAL · MALBA PMC'),'email should not show redundant overline');
  assert.ok(!decodedMail.includes('background:#f1eff8'),'email access box must not use purple background');
  assert.ok(!decodedMail.includes('border-left:4px solid #5d4594'),'email access box must not use purple left accent');
  assert.match(decodedMail,/Correo de acceso/,'email should keep access details');assert.ok(!decodedMail.includes('/aula-virtual/aula-virtual/'));
  assert.ok(decodedMail.includes(`href="${origin}/aula-virtual/"`));
  assert.equal((await fetch(origin+'/aula-virtual/')).status,200);
  // A course assignment or notification must not rotate an existing password.
  const separate=await request('/api/lms/admin/enroll',{studentId:saved.data.id,courseId,active:true,sendEmail:true},admin.cookie,csrf);
  assert.equal(separate.status,200,JSON.stringify(separate.data));
  assert.equal(users.get(saved.data.id).password,'Local-password-123','single enrollment must preserve credentials');
  const grouped=await request('/api/lms/admin/students/bulk-enroll',{ids:[saved.data.id],courseIds:[courseId],sendEmail:true},admin.cookie,csrf);
  assert.equal(grouped.status,200,JSON.stringify(grouped.data));
  assert.equal(users.get(saved.data.id).password,'Local-password-123','bulk enrollment must preserve credentials');
  const edited=await request('/api/lms/admin/student',{id:saved.data.id,name:'Alumno Fixture',email:'student@invalid.test',active:true,courseIds:[courseId],sendEmail:true},admin.cookie,csrf);
  assert.equal(edited.status,200,JSON.stringify(edited.data));
  assert.equal(users.get(saved.data.id).password,'Local-password-123','course update and email must preserve credentials');
  const repeatWorkbook=new (require('exceljs').Workbook)(),repeatSheet=repeatWorkbook.addWorksheet('Alumnos');
  repeatSheet.addRow(['Nombre','Correo','Contraseña','Estado']);
  repeatSheet.addRow(['Alumno Fixture','student@invalid.test','Accidentally-reset-pass-123','Activo']);
  const repeat=await request('/api/lms/admin/students/import',{filename:'import.xlsx',content:Buffer.from(await repeatWorkbook.xlsx.writeBuffer()).toString('base64'),courseId,sendEmail:true},admin.cookie,csrf);
  assert.equal(repeat.status,200,JSON.stringify(repeat.data));
  assert.equal(users.get(saved.data.id).password,'Local-password-123','import should not unexpectedly reset existing credentials');
  const student=await request('/api/lms/login',{email:'student@invalid.test',password:'Local-password-123'});
  assert.equal(student.status,200,JSON.stringify(student.data));
  const session=await request('/api/lms/session',undefined,student.cookie);
  assert.equal(session.data.authenticated,true);assert.equal(session.data.student.student_id,saved.data.id);
  assert.equal((await request('/api/content',undefined,admin.cookie)).status,200);
  admin=await request('/api/login',{username:'fixture-admin',password:'fixture-admin-password'});
  assert.equal((await request('/api/content',undefined,admin.cookie)).status,200);
  assert.equal((await request('/api/lms/admin',undefined,admin.cookie)).status,200);
  assert.equal((await request('/api/lms/password',{currentPassword:'Local-password-123',password:'Changed-password-123'},student.cookie,session.data.csrf)).status,200);
  assert.equal((await request('/api/content',undefined,admin.cookie)).status,200);
  const second=await request('/api/lms/admin/student',{name:'Segundo',email:'second@invalid.test',password:'Second-password-123',active:true},admin.cookie,admin.data.csrf);
  assert.equal(second.status,200);
  const concurrent=await Promise.all([request('/api/lms/login',{email:'student@invalid.test',password:'Changed-password-123'}),request('/api/lms/login',{email:'second@invalid.test',password:'Second-password-123'}),request('/api/content',undefined,admin.cookie)]);
  assert.deepEqual(concurrent.map(x=>x.status),[200,200,200]);
  profiles.get(saved.data.id).active=false;
  assert.equal((await request('/api/lms/login',{email:'student@invalid.test',password:'Changed-password-123'})).status,403);
  assert.equal((await request('/api/content',undefined,admin.cookie)).status,200);
  failProfile=true;
  const failed=await request('/api/lms/login',{email:'second@invalid.test',password:'Second-password-123'});
  assert.equal(failed.status,500);assert.ok(!failed.data.error.includes('deshabilitado'));failProfile=false;
  const swapped=student.cookie.replace('malba_student_session','malba_cms_session');
  assert.equal((await request('/api/content',undefined,swapped)).status,401);
  // Deleted students remain in Auth while in the CMS trash. Creating them again
  // with the same email must intentionally rotate the password and reuse the profile.
  const original=await request('/api/lms/admin/student',{name:'Recreate Fixture',email:'recreate@invalid.test',password:'First-Password-123',courseIds:[courseId],active:true},admin.cookie,admin.data.csrf);
  assert.equal(original.status,200,JSON.stringify(original.data));
  const duplicate=await request('/api/lms/admin/student',{name:'Duplicate Fixture',email:'recreate@invalid.test',password:'Other-Password-123',active:true},admin.cookie,admin.data.csrf);
  assert.equal(duplicate.status,409,'active students cannot be silently replaced by a create operation');
  assert.equal(users.get(original.data.id).password,'First-Password-123');
  const deleted=await request('/api/lms/admin/student',{id:original.data.id,action:'delete'},admin.cookie,admin.data.csrf);
  assert.equal(deleted.status,200);
  assert.equal(profiles.get(original.data.id).active,false);
  assert.ok(profiles.get(original.data.id).deleted_at);
  const remade=await request('/api/lms/admin/student',{name:'Recreate Fixture',email:'recreate@invalid.test',password:'Second-Password-123',courseIds:[courseId],active:true,sendEmail:true},admin.cookie,admin.data.csrf);
  assert.equal(remade.status,200,JSON.stringify(remade.data));
  assert.equal(remade.data.reactivated,true);
  assert.equal(remade.data.id,original.data.id);
  assert.equal(profiles.get(original.data.id).deleted_at,null);
  assert.equal(profiles.get(original.data.id).active,true);
  assert.equal(users.get(original.data.id).password,'Second-Password-123');
  assert.equal((await request('/api/lms/login',{email:'recreate@invalid.test',password:'First-Password-123'})).status,401);
  assert.equal((await request('/api/lms/login',{email:'recreate@invalid.test',password:'Second-Password-123'})).status,200);
  // A failed profile write rolls back newly created Auth accounts, allowing a fresh retry.
  failStudentWrite=true;
  const failedRegistration=await request('/api/lms/admin/student',{name:'Write Failure',email:'failwrite@invalid.test',password:'Safe-password-321'},admin.cookie,admin.data.csrf);
  assert.equal(failedRegistration.status,500);
  assert.equal([...users.values()].some(u=>u.email==='failwrite@invalid.test'),false,'failed profile save must remove Auth-only account');
  failStudentWrite=false;
  const successfulRetry=await request('/api/lms/admin/student',{name:'Write Failure',email:'failwrite@invalid.test',password:'Safe-password-321'},admin.cookie,admin.data.csrf);
  assert.equal(successfulRetry.status,200,JSON.stringify(successfulRetry.data));
  assert.equal(profiles.get(successfulRetry.data.id).email,'failwrite@invalid.test');
  // A previous interrupted request may leave a tagged Auth-only account. Reclaim it.
  const orphanId=require('node:crypto').randomUUID();
  users.set(orphanId,{id:orphanId,email:'orphan@invalid.test',password:'Prior-password-123',app_metadata:{malba_lms_student:true},user_metadata:{full_name:'Orphan Fixture'}});
  const recovered=await request('/api/lms/admin/student',{name:'Orphan Fixture',email:'orphan@invalid.test',password:'New-password-123'},admin.cookie,admin.data.csrf);
  assert.equal(recovered.status,200,JSON.stringify(recovered.data));
  assert.equal(recovered.data.id,orphanId);
  assert.equal(recovered.data.reactivated,true);
  assert.equal(profiles.get(orphanId).email,'orphan@invalid.test');
  assert.equal(users.get(orphanId).password,'New-password-123');
  assert.equal((await request('/api/lms/login',{email:'orphan@invalid.test',password:'New-password-123'})).status,200);
  assert.equal(polluted,0,'a user session reached an administrative Supabase operation');
});
