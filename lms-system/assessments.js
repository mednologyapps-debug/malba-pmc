'use strict';
const path=require('node:path');
const MAX_BYTES=20*1024*1024;
const pendingMessage='El total de la nota se dará luego de la evaluación del profesor.';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const open=q=>q.type==='open';
async function result(operation){
 const response=await operation;
 if(response.error)throw response.error;
 return response.data;
}
function config(lesson){
 if(lesson.type==='assignment'){
  const value=String(lesson.assignment?.dueAt||'');
  const local=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value);
  const utc=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
  const dueAt=new Date(local?value+'-05:00':value);
  if(!lesson.body?.trim()||!local&&!utc||!Number.isFinite(+dueAt))throw Error('Completa las instrucciones y la fecha límite de la tarea (hora de Perú).');
  return {dueAt:dueAt.toISOString()};
 }
 return lesson.type==='quiz'?lesson.quiz||{}:{};
}
function evaluate(lesson,answers){
 const qs=lesson.quiz?.questions||[];
 if(!Array.isArray(answers)||!qs.length||answers.length!==qs.length)throw Error('Responde todas las preguntas.');
 const responses=qs.map((q,i)=>{
  const answer=answers[i];
  if(open(q)){
   if(typeof answer!=='string'||!answer.trim()||answer.length>6000)throw Error('Completa cada respuesta abierta (máximo 6000 caracteres).');
   return {question:q.question,answer:answer.trim(),manual:true};
  }
  if(!Number.isInteger(answer)||answer<0||answer>=q.options.length)throw Error('Selecciona una opción en cada pregunta.');
  return {question:q.question,answer:q.options[answer],manual:false,correct:answer===Number(q.correct)};
 });
 const objective=responses.filter(q=>!q.manual);
 return {responses,objectiveCorrect:objective.filter(q=>q.correct).length,objectiveTotal:objective.length,manualTotal:qs.length-objective.length};
}
function fileType(raw,name){
 const ext=path.extname(name).toLowerCase();
 if(!raw.length||raw.length>MAX_BYTES)throw Error('El archivo debe pesar entre 1 byte y 20 MB.');
 if(ext==='.pdf'&&raw.subarray(0,5).toString()==='%PDF-')return;
 if(['.docx','.pptx','.xlsx'].includes(ext)&&raw.subarray(0,4).equals(Buffer.from([80,75,3,4])))return;
 throw Error('Sube un archivo válido en PDF, Word (.docx), PowerPoint (.pptx) o Excel (.xlsx).');
}
function create({db,json,text,getCourse,lessonsFrom,rawBody,storeLmsFile,downloadLmsFile,safeUploadName}){
 const table=()=>db.from('lms_assessment_submissions');
 const safe='id,kind,objective_correct,objective_total,manual_total,score,feedback,graded_at,pass_percent,file_name,submitted_at';
 async function lessonFor(studentId,courseId,lessonId){
  if(!uuid.test(courseId||'')||!uuid.test(lessonId||''))throw Error('Actividad inválida.');
  const enrollment=await result(db.from('lms_enrollments').select('expires_at').eq('student_id',studentId).eq('course_id',courseId).in('status',['active','completed']).maybeSingle());
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  if(!enrollment||enrollment.expires_at&&enrollment.expires_at<today)throw Error('Tu matrícula no está activa para este curso.');
  const course=await getCourse(courseId,true),lesson=lessonsFrom(course?.modules).find(item=>item.id===lessonId);
  if(!lesson)throw Error('Lección no encontrada.');
  return {course,lesson};
 }
 async function quiz(studentId,courseId,lesson,data){
  const pass=Number(lesson.quiz.passPercent||70);
  const row={student_id:studentId,course_id:courseId,lesson_id:lesson.id,kind:'quiz',responses:data.responses,
   objective_correct:data.objectiveCorrect,objective_total:data.objectiveTotal,manual_total:data.manualTotal,pass_percent:pass};
  const saved=await table().insert(row).select(safe).single();
  if(saved.error?.code==='23505')return result(table().select(safe).eq('student_id',studentId).eq('lesson_id',lesson.id).single());
  if(saved.error)throw saved.error;
  return saved.data;
 }
 async function student(req,res,url,studentId){
  const courseId=url.searchParams.get('courseId'),lessonId=url.searchParams.get('lessonId');
  const {lesson}=await lessonFor(studentId,courseId,lessonId);
  const previous=await result(table().select(safe).eq('student_id',studentId).eq('lesson_id',lessonId).maybeSingle());
  if(req.method==='GET')return json(res,200,{submission:previous});
  if(req.method!=='POST'||lesson.type!=='assignment')return json(res,405,{error:'Operación no disponible.'});
  if(previous)return json(res,200,{submission:previous});
  if(!(Date.parse(lesson.assignment?.dueAt)>Date.now()))throw Error('El plazo de entrega terminó.');
  const name=decodeURIComponent(String(req.headers['x-file-name']||''));
  const raw=await rawBody(req,MAX_BYTES);
  fileType(raw,name);
  const file=await storeLmsFile(raw,courseId,name);
  const saved=await table().insert({student_id:studentId,course_id:courseId,lesson_id:lessonId,kind:'assignment',file_id:file.fileId,file_name:file.name}).select(safe).single();
  if(saved.error){
   if(saved.error.code)await db.storage.from('malba-lms').remove([file.fileId]);
   if(saved.error.code==='23505')return json(res,200,{submission:await result(table().select(safe).eq('student_id',studentId).eq('lesson_id',lessonId).single())});
   throw saved.error;
  }
  return json(res,201,{submission:saved.data});
 }
 async function admin(req,res,url,body){
  if(req.method==='GET'&&url.pathname.endsWith('/assessments')){
   const course=url.searchParams.get('courseId');
   if(!uuid.test(course||''))throw Error('Curso inválido.');
   const page=Math.min(100000,Math.max(0,Math.floor(Number(url.searchParams.get('page'))||0)));
   const response=await table().select('*,lms_students(full_name),lms_lessons(title)',{count:'exact'}).eq('course_id',course).order('submitted_at',{ascending:false}).order('id').range(page*30,page*30+29);
   if(response.error)throw response.error;
   return json(res,200,{items:response.data,total:response.count});
  }
  const id=body?.id||url.searchParams.get('id');
  if(!uuid.test(id||''))throw Error('Entrega inválida.');
  if(req.method==='GET'&&url.pathname.endsWith('/file')){
   const row=await result(table().select('file_id,file_name').eq('id',id).eq('kind','assignment').maybeSingle());
   if(!row?.file_id)return json(res,404,{error:'Archivo no encontrado.'});
   return text(res,200,await downloadLmsFile(row.file_id),'application/octet-stream',{'Content-Disposition':'attachment; filename="'+safeUploadName(row.file_name)+'"'});
  }
  if(req.method==='POST'&&url.pathname.endsWith('/grade')){
   if(typeof body.points!=='number'||!Number.isFinite(body.points))throw Error('Indica la puntuación manual.');
   const score=await result(db.rpc('lms_grade_assessment',{p_id:id,p_manual:body.points,p_feedback:String(body.feedback||'').slice(0,4000)}));
   return json(res,200,{score});
  }
  return json(res,404,{error:'Ruta no encontrada.'});
 }
 return {student,admin,lessonFor,quiz};
}
module.exports={create,config,evaluate,pendingMessage};
