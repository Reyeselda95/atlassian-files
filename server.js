const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const DURATION_MS = Number(process.env.GAME_DURATION_MINUTES || 15) * 60 * 1000;

const profiles = [
  { id:'daniel', name:'Daniel', role:'Developer', icon:'〈/〉', color:'#6d8cff', bio:'Desarrollador de funcionalidades y commits en Bitbucket.', motive:'Quería introducir un cambio antes del cierre de versión.' },
  { id:'laura', name:'Laura', role:'Product Owner', icon:'🎯', color:'#c084fc', bio:'Responsable del backlog, prioridades y releases en Jira.', motive:'Necesitaba cumplir una fecha comprometida con el cliente.' },
  { id:'marcos', name:'Marcos', role:'DevOps Engineer', icon:'⚙️', color:'#34c7a1', bio:'Gestiona automatizaciones, pipelines y despliegues.', motive:'Quería demostrar que podía automatizar el proceso de release.' },
  { id:'sara', name:'Sara', role:'QA Engineer', icon:'🧪', color:'#f3a64a', bio:'Valida los cambios y las pruebas funcionales.', motive:'Quería evitar una publicación con errores conocidos.' },
  { id:'javier', name:'Javier', role:'Jira Owner', icon:'🔷', color:'#2684ff', bio:'Administra Jira, permisos y configuraciones de proyectos.', motive:'Quería acelerar una intervención urgente sin seguir el proceso habitual.' },
  { id:'elena', name:'Elena', role:'Confluence Administrator', icon:'📘', color:'#1868a8', bio:'Gestiona espacios, documentación y permisos de Confluence.', motive:'Quería ocultar una modificación documental.' },
  { id:'pablo', name:'Pablo', role:'Bitbucket Administrator', icon:'🪣', color:'#0052cc', bio:'Administra repositorios, ramas y políticas de merge.', motive:'Quería facilitar cambios directos en una rama protegida.' },
  { id:'andrea', name:'Andrea', role:'IT Service Manager', icon:'🎧', color:'#d49a57', bio:'Coordina servicios, solicitudes e incidencias en JSM.', motive:'Quería evitar que un incidente afectase a los SLA.' }
];
const clues = [
  { id:1, title:'Jira · El ticket desaparecido', tag:'JIRA AUDIT LOG', body:'El registro de auditoría muestra que Laura actualizó RELEASE-480 a las 17:30; Javier modificó los permisos del proyecto a las 17:42; Sara comentó QA-482 a las 17:46 y Daniel actualizó DEV-891 a las 17:51. Posteriormente, RELEASE-480 aparece eliminado.', question:'¿Qué sospechoso tenía capacidad para alterar los permisos y por qué importa?' },
  { id:2, title:'Confluence · La documentación alterada', tag:'PAGE HISTORY', body:'En «Release Management / Version 4.8.0», Sara añadió resultados de QA a las 17:35; Javier modificó el procedimiento a las 17:44; Laura actualizó la fecha a las 17:49. Javier sustituyó «Release requires QA approval and Product Owner authorization» por «Release can proceed following technical validation».', question:'¿Qué efecto tiene el cambio de procedimiento?' },
  { id:3, title:'Bitbucket · El commit sospechoso', tag:'COMMIT a84f91c', body:'En acme-platform aparece el commit a84f91c, autor Daniel, a las 17:55, en release/4.8.0. Mensaje: «hotfix: bypass release validation». No existe Pull Request. El cambio permite continuar sin comprobar la aprobación de QA.', question:'¿Quién realizó el cambio de código y qué demuestra realmente?' },
  { id:4, title:'CI/CD · El despliegue', tag:'PIPELINE LOG', body:'A las 18:00 comienza el pipeline; a las 18:02 se omite la validación; a las 18:04 termina el build y a las 18:07 se despliega a producción. Se utilizó la credencial técnica release-automation, gestionada por el equipo de plataforma.', question:'¿Qué permitió que el despliegue llegase a producción?' },
  { id:5, title:'Jira Service Management · La prueba definitiva', tag:'SECURITY AUDIT', body:'A las 17:40 Javier solicita una excepción de release. A las 17:43 se genera un token de acceso personal. A las 17:44 ese token modifica la documentación. A las 17:55 se registra el commit y a las 18:00 se ejecuta el pipeline. La auditoría confirma que el token fue utilizado por Javier para cambiar la configuración del proceso.', question:'¿Quién coordinó la operación y qué papel tuvo cada persona?' }
];
function initialState(){ return { game:{status:'lobby', startedAt:null, durationMs:DURATION_MS, nextClueAt:null}, players:[], releasedClues:[], submissions:[], updatedAt:Date.now() }; }
fs.mkdirSync(DATA_DIR,{recursive:true});
let state;
try { state = JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); } catch { state = initialState(); }
let writeQueue = Promise.resolve();
function persist(){ state.updatedAt=Date.now(); const snapshot=JSON.stringify(state,null,2); writeQueue=writeQueue.then(()=>fs.promises.writeFile(STATE_FILE+'.tmp',snapshot).then(()=>fs.promises.rename(STATE_FILE+'.tmp',STATE_FILE))); return writeQueue; }
function publicState(){
  const now=Date.now();
  const lobby=state.game.status==='lobby';
  // Antes del inicio se ocultan los nombres de las personas, pero los roles elegibles son visibles.
  const players=state.players.map(p=>({id:p.id,name:lobby?null:p.name,profileId:p.profileId,joinedAt:p.joinedAt}));
  const submissions=state.game.status==='finished'?state.submissions.map(s=>({playerId:s.playerId,submittedAt:s.submittedAt,elapsedMs:s.elapsedMs,score:s.score})):[];
  const visibleProfiles=profiles.map(p=>({...p,name:p.role}));
  const roleNames=Object.fromEntries(state.players.map(p=>[p.profileId,p.name]));
  const aliases={Daniel:roleNames.daniel||'Developer',Laura:roleNames.laura||'Product Owner',Marcos:roleNames.marcos||'DevOps Engineer',Sara:roleNames.sara||'QA Engineer',Javier:roleNames.javier||'Jira Owner',Elena:roleNames.elena||'Confluence Administrator',Pablo:roleNames.pablo||'Bitbucket Administrator',Andrea:roleNames.andrea||'IT Service Manager'};
  const personalize=value=>{if(lobby||!value)return value;return value.replace(/\b(Daniel|Laura|Marcos|Sara|Javier|Elena|Pablo|Andrea)\b/g,match=>aliases[match]);};
  return {game:state.game,players,releasedClues:state.releasedClues,submissions,profiles:visibleProfiles,clues:clues.map(c=>({...c,body:state.releasedClues.includes(c.id)?personalize(c.body):null,question:state.releasedClues.includes(c.id)?personalize(c.question):null})),serverNow:now};
}
function scoreAnswers(a, elapsedMs){
  const checks=[a.culprit==='javier',a.tool==='confluence',a.commitAuthor==='daniel',a.mechanism==='bypass',a.motive==='accelerate',a.sequence==='javier-daniel-pipeline'];
  const weights=[20,10,10,10,10,10];
  const accuracy=checks.reduce((n,ok,i)=>n+(ok?weights[i]:0),0);
  const evidence=(a.evidence==='token-audit'?5:0)+(a.evidence2==='procedure-change'?5:0);
  let speed=0;
  if(accuracy>=35){ const m=elapsedMs/60000; speed=m<=3?20:m<=6?17:m<=9?14:m<=12?10:5; }
  return {accuracy,evidence,speed,total:accuracy+evidence+speed};
}
function admin(req,res,next){ if(req.get('x-admin-pin')!==ADMIN_PIN) return res.status(401).json({error:'PIN de administrador incorrecto'}); next(); }
app.use(express.json({limit:'100kb'}));
app.use(express.static(path.join(__dirname,'public')));
app.get('/api/state',(req,res)=>res.json({...publicState(),ownPlayerId:state.players.find(p=>p.clientId===req.query.clientId)?.id||null}));
app.post('/api/players/claim',async(req,res)=>{
  const {clientId,name,profileId}=req.body||{};
  if(!clientId||!name||!profileId) return res.status(400).json({error:'Completa nombre y perfil.'});
  if(state.game.status!=='lobby') return res.status(409).json({error:'La selección de perfiles está cerrada.'});
  const slotMatch=/^identity-(\d{2})$/.exec(String(profileId));
  const actualProfileId=slotMatch?profiles[Number(slotMatch[1])-1]?.id:profileId;
  if(!actualProfileId||!profiles.some(p=>p.id===actualProfileId)) return res.status(400).json({error:'Perfil no válido.'});
  const existing=state.players.find(p=>p.clientId===clientId);
  if(existing){ if(existing.profileId!==actualProfileId && state.players.some(p=>p.profileId===actualProfileId&&p.clientId!==clientId)) return res.status(409).json({error:'Ese perfil ya está reservado.'}); existing.profileId=actualProfileId; existing.name=String(name).slice(0,40).trim(); await persist(); io.emit('state',publicState()); return res.json({ok:true,playerId:existing.id}); }
  if(state.players.some(p=>p.profileId===actualProfileId)) return res.status(409).json({error:'Ese perfil acaba de ser elegido por otra persona. Elige otro.'});
  if(state.players.length>=8) return res.status(409).json({error:'Se ha alcanzado el máximo de 8 participantes.'});
  const player={id:crypto.randomUUID(),clientId:String(clientId).slice(0,80),name:String(name).slice(0,40).trim(),profileId:actualProfileId,joinedAt:Date.now()};
  if(!player.name) return res.status(400).json({error:'Introduce tu nombre.'});
  state.players.push(player); await persist(); io.emit('state',publicState()); res.json({ok:true,playerId:player.id});
});
app.post('/api/players/release',async(req,res)=>{
  const {clientId}=req.body||{}; const p=state.players.find(x=>x.clientId===clientId);
  if(!p) return res.status(404).json({error:'No se encontró tu selección.'});
  if(state.game.status!=='lobby') return res.status(409).json({error:'La selección ya está cerrada.'});
  state.players=state.players.filter(x=>x.clientId!==clientId); await persist(); io.emit('state',publicState()); res.json({ok:true});
});
app.post('/api/admin/start',admin,async(req,res)=>{
  if(state.players.length<1) return res.status(400).json({error:'Necesitas al menos un participante.'});
  state.game.status='active'; state.game.startedAt=Date.now(); state.game.durationMs=DURATION_MS; if(!state.releasedClues.includes(1)) state.releasedClues.push(1); state.game.nextClueAt=Date.now()+90000; await persist(); io.emit('state',publicState()); res.json({ok:true});
});
app.post('/api/admin/clue/:id/release',admin,async(req,res)=>{
  const id=Number(req.params.id); if(!clues.some(c=>c.id===id)) return res.status(404).json({error:'Pista no encontrada.'});
  const nextClue=clues.find(c=>!state.releasedClues.includes(c.id)); if(!nextClue||id!==nextClue.id) return res.status(409).json({error:'Las pistas deben publicarse en orden. Adelanta únicamente la siguiente.'});
  if(state.game.status!=='active') return res.status(409).json({error:'Inicia la investigación antes de publicar pistas.'});
  if(!state.releasedClues.includes(id)) state.releasedClues.push(id);
  state.game.nextClueAt=state.releasedClues.length<clues.length?Date.now()+90000:null;
  await persist(); io.emit('state',publicState()); res.json({ok:true});
});
app.post('/api/admin/finish',admin,async(req,res)=>{ state.game.status='finished'; await persist(); io.emit('state',publicState()); res.json({ok:true}); });
app.post('/api/admin/reset',admin,async(req,res)=>{ state=initialState(); await persist(); io.emit('state',publicState()); res.json({ok:true}); });
app.post('/api/submit',async(req,res)=>{
  const {clientId,answers}=req.body||{}; const player=state.players.find(p=>p.clientId===clientId);
  if(!player) return res.status(403).json({error:'Primero debes seleccionar un perfil.'});
  if(state.game.status!=='active') return res.status(409).json({error:'La investigación no está abierta.'});
  const elapsedMs=Date.now()-state.game.startedAt;
  if(elapsedMs>state.game.durationMs) return res.status(409).json({error:'Se ha agotado el tiempo de investigación.'});
  if(state.submissions.some(s=>s.playerId===player.id)) return res.status(409).json({error:'Ya has enviado tu resolución.'});
  const allowed={culprit:['javier','daniel','laura','marcos','sara','elena','pablo','andrea'],tool:['jira','confluence','bitbucket','jsm'],commitAuthor:['daniel','javier','pablo','marcos','laura','sara','elena','andrea'],mechanism:['bypass','permissions','pipeline','token'],motive:['accelerate','sla','hide','prove','deadline'],sequence:['javier-daniel-pipeline','daniel-javier-pipeline','javier-pipeline-daniel','daniel-pipeline-javier'],evidence:['token-audit','jira-audit','commit','pipeline'],evidence2:['procedure-change','deleted-ticket','branch-policy','qa-results']};
  for(const k of Object.keys(allowed)) if(!allowed[k].includes(answers?.[k])) return res.status(400).json({error:'Revisa las respuestas del formulario.'});
  const score=scoreAnswers(answers,elapsedMs); state.submissions.push({playerId:player.id,answers,submittedAt:Date.now(),elapsedMs,score});
  await persist(); io.emit('state',publicState()); res.json({ok:true,elapsedMs,score});
});
app.get('/api/admin/results',admin,(req,res)=>res.json({players:state.players.map(p=>({id:p.id,name:p.name,profileId:p.profileId})),submissions:state.submissions.map(s=>({...s,playerName:state.players.find(p=>p.id===s.playerId)?.name,profileId:state.players.find(p=>p.id===s.playerId)?.profileId})).sort((a,b)=>b.score.total-a.score.total||a.elapsedMs-b.elapsedMs)}));
io.on('connection',socket=>socket.emit('state',publicState()));
// El servidor publica las pistas aunque el navegador del organizador se cierre.
setInterval(async()=>{if(state.game.status!=='active'||!state.game.nextClueAt||Date.now()<state.game.nextClueAt)return;const next=clues.find(c=>!state.releasedClues.includes(c.id));if(!next){state.game.nextClueAt=null;return;}state.releasedClues.push(next.id);state.game.nextClueAt=state.releasedClues.length<clues.length?Date.now()+90000:null;await persist();io.emit('state',publicState());console.log(`Pista ${next.id} publicada automáticamente`);},1000);
server.listen(PORT,'0.0.0.0',()=>console.log(`Atlassian Case Files listening on ${PORT}`));
