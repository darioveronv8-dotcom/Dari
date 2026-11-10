import { createClient } from '@supabase/supabase-js';
import './style.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const app = document.querySelector('#app');
let supabase = null;
let session = null;
let organization = null;
let profile = null;
let activePage = 'dashboard';

const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = v => v ? new Date(v).toLocaleString('es-AR') : 'Sin fecha';
const notify = (msg, bad=false) => {
  const el=document.querySelector('#toast'); if(!el)return;
  el.textContent=msg; el.className='toast show'+(bad?' bad':'');
  setTimeout(()=>el.className='toast',3500);
};
const roleLabel = r => ({admin:'Administrador',coordinator:'Coordinador',collaborator:'Colaborador'}[r]||r);
const canManage = () => ['admin','coordinator'].includes(organization?.role);

function shell(content) {
  app.innerHTML = `
  <div class="layout">
    <aside class="sidebar">
      <div class="brand"><div class="brand-icon">T</div><div><b>TERRITORIO 360</b><small>Gestión territorial · Chaco</small></div></div>
      <div class="nav-caption">PLATAFORMA</div>
      <nav>
        ${[['dashboard','▦','Resumen'],['territory','⌖','Territorio'],['activities','▣','Actividades'],['tasks','☑','Tareas'],['reports','▤','Informes']].map(([id,ic,label])=>`<button data-page="${id}" class="${activePage===id?'active':''}">${ic} &nbsp; ${label}</button>`).join('')}
        ${canManage()?'<button data-page="members" class="'+(activePage==='members'?'active':'')+'">♙ &nbsp; Usuarios</button>':''}
      </nav>
      <div class="side-foot">Organización propia<br>Acceso restringido por perfil</div>
    </aside>
    <main>
      <header class="topbar"><div><b>${esc(organization?.name||'Organización')}</b><small>${esc(roleLabel(organization?.role||''))}</small></div>
        <div class="userbox"><span>${esc(profile?.display_name||session?.user?.email||'Usuario')}</span><button class="btn ghost small" id="logout">Salir</button></div>
      </header>
      <section class="content">${content}</section>
    </main>
  </div><div id="toast" class="toast"></div>`;
  document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>{activePage=b.dataset.page;renderPage()}));
  document.querySelector('#logout')?.addEventListener('click',async()=>{await supabase.auth.signOut();});
}

function loginScreen() {
  app.innerHTML = `<main class="login-wrap"><section class="login-card">
    <div class="brand login-brand"><div class="brand-icon">T</div><div><b>TERRITORIO 360</b><small>Gestión territorial · Chaco</small></div></div>
    <h1>Ingresar a la plataforma</h1><p class="muted">Acceso exclusivo para usuarios autorizados.</p>
    <form id="login-form" class="form-stack">
      <label>Correo electrónico<input name="email" type="email" autocomplete="username" required></label>
      <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Ingresar</button>
      <div id="login-error" class="error"></div>
    </form><p class="footnote">Si todavía no tenés usuario, solicitá el alta al administrador de la organización.</p>
  </section></main>`;
  document.querySelector('#login-form').addEventListener('submit',async e=>{
    e.preventDefault(); const fd=new FormData(e.currentTarget);
    const {error}=await supabase.auth.signInWithPassword({email:fd.get('email'),password:fd.get('password')});
    if(error)document.querySelector('#login-error').textContent='No se pudo iniciar sesión. Verificá los datos o consultá al administrador.';
  });
}

async function loadIdentity() {
  const {data:{user}}=await supabase.auth.getUser();
  if(!user){session=null;return false;}
  session=(await supabase.auth.getSession()).data.session;
  const [p,m]=await Promise.all([
    supabase.from('profiles').select('display_name').eq('id',user.id).maybeSingle(),
    supabase.from('organization_members').select('organization_id,role,organizations(id,name)').limit(1).maybeSingle()
  ]);
  if(m.error || !m.data){app.innerHTML='<main class="login-wrap"><section class="login-card"><h1>Acceso pendiente</h1><p>Tu usuario todavía no está asociado a una organización. Solicitá al administrador que complete el alta.</p><button class="btn" id="logout-pending">Cerrar sesión</button></section></main>';document.querySelector('#logout-pending').onclick=()=>supabase.auth.signOut();return false;}
  profile=p.data||{display_name:user.email};
  organization={id:m.data.organization_id,role:m.data.role,name:m.data.organizations?.name||'Organización'};
  return true;
}

async function renderPage() {
  if(!organization){loginScreen();return;}
  if(activePage==='dashboard')return dashboard();
  if(activePage==='territory')return territory();
  if(activePage==='activities')return activities();
  if(activePage==='tasks')return tasks();
  if(activePage==='reports')return reports();
  if(activePage==='members'&&canManage())return members();
  activePage='dashboard';return dashboard();
}
function heading(h,sub,action=''){return `<div class="page-head"><div><h1>${h}</h1><p>${sub}</p></div>${action}</div>`}
function metric(n,label,icon){return `<article class="metric"><div><strong>${n}</strong><small>${label}</small></div><span>${icon}</span></article>`}
function statusPill(s){return `<span class="pill ${s==='completed'?'green':s==='in_progress'?'blue':'amber'}">${({pending:'Pendiente',in_progress:'En curso',completed:'Completada'})[s]||s}</span>`}
async function dashboard(){
  shell('<div class="loading">Cargando indicadores…</div>');
  const [l,a,t]=await Promise.all([
    supabase.from('localities').select('id',{count:'exact',head:true}),
    supabase.from('activities').select('id,title,starts_at,status,localities(name)').eq('organization_id',organization.id).order('created_at',{ascending:false}).limit(5),
    supabase.from('tasks').select('id,status').eq('organization_id',organization.id)
  ]);
  const open=(t.data||[]).filter(x=>x.status!=='completed').length;
  shell(`${heading('Panel de control','Resumen operativo de tu organización')}
  <div class="metrics">${metric(l.count??'—','Localidades del catálogo','⌖')}${metric(a.data?.length??0,'Últimas actividades','▣')}${metric(t.data?.length??0,'Tareas registradas','☑')}${metric(open,'Tareas pendientes','◷')}</div>
  <div class="panel section"><h2>Actividad reciente</h2>${a.data?.length?`<div class="table-wrap"><table><thead><tr><th>Actividad</th><th>Localidad</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>${a.data.map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.localities?.name||'—')}</td><td>${fmtDate(x.starts_at)}</td><td>${statusPill(x.status)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">Todavía no hay actividades registradas.</p>'}</div>
  <div class="notice">La información se comparte entre los usuarios autorizados de esta organización. Los permisos se aplican en la base de datos.</div>`);
}
async function territory(){
  const {data,error}=await supabase.from('localities').select('id,name,department,zone').eq('province','Chaco').order('department').order('name');
  shell(`${heading('Territorio','Catálogo provincial de localidades')}
  <div class="toolbar"><input id="q" placeholder="Buscar localidad o departamento…"></div>
  <div class="panel table-wrap"><table><thead><tr><th>Localidad</th><th>Departamento</th><th>Zona</th></tr></thead><tbody id="locality-rows">${(data||[]).map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.department)}</td><td>${esc(x.zone||'—')}</td></tr>`).join('')}</tbody></table>${!data?.length?'<p class="empty">No hay localidades cargadas.</p>':''}</div>${error?'<p class="error">No se pudo cargar el catálogo.</p>':''}`);
  document.querySelector('#q')?.addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#locality-rows tr').forEach(tr=>tr.hidden=!tr.textContent.toLowerCase().includes(q));});
}
async function activities(){
  const [{data:rows,error},{data:locs}]=await Promise.all([
    supabase.from('activities').select('id,title,activity_type,starts_at,status,localities(name)').eq('organization_id',organization.id).order('starts_at',{ascending:false}),
    supabase.from('localities').select('id,name').eq('province','Chaco').order('name')
  ]);
  shell(`${heading('Actividades','Reuniones, jornadas, eventos y acciones institucionales',canManage()?'<button class="btn primary" id="new-activity">＋ Nueva actividad</button>':'')}
  <div class="panel table-wrap"><table><thead><tr><th>Actividad</th><th>Localidad</th><th>Fecha</th><th>Tipo</th><th>Estado</th></tr></thead><tbody>${(rows||[]).map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.localities?.name||'—')}</td><td>${fmtDate(x.starts_at)}</td><td>${esc(x.activity_type)}</td><td>${statusPill(x.status)}</td></tr>`).join('')}</tbody></table>${!rows?.length?'<p class="empty">No hay actividades registradas.</p>':''}</div>${error?'<p class="error">No se pudieron cargar las actividades.</p>':''}`);
  document.querySelector('#new-activity')?.addEventListener('click',()=>activityDialog(locs||[]));
}
function activityDialog(locs){
 const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.innerHTML=`<form class="modal form-stack"><h2>Nueva actividad</h2><label>Nombre<input name="title" required maxlength="140"></label><label>Localidad<select name="locality_id"><option value="">Sin localidad asignada</option>${locs.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><label>Tipo<select name="activity_type"><option>Reunión</option><option>Jornada</option><option>Evento</option><option>Recorrida institucional</option><option>Capacitación</option><option>Otro</option></select></label><label>Fecha y hora<input type="datetime-local" name="starts_at"></label><label>Descripción<textarea name="description" rows="3"></textarea></label><div class="modal-actions"><button type="button" class="btn ghost" id="cancel">Cancelar</button><button class="btn primary">Guardar</button></div><p class="error" id="modal-error"></p></form>`;
 document.body.append(wrap);wrap.querySelector('#cancel').onclick=()=>wrap.remove();
 wrap.querySelector('form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const payload={organization_id:organization.id,title:fd.get('title'),locality_id:fd.get('locality_id')||null,activity_type:fd.get('activity_type'),starts_at:fd.get('starts_at')?new Date(fd.get('starts_at')).toISOString():null,description:fd.get('description'),created_by:session.user.id};
 const {error}=await supabase.from('activities').insert(payload);if(error){wrap.querySelector('#modal-error').textContent='No se pudo guardar. Verificá tus permisos.';return;}wrap.remove();notify('Actividad guardada');activities();};
}
async function tasks(){
 const {data,error}=await supabase.from('tasks').select('id,title,due_at,status,profiles:assigned_to(display_name)').eq('organization_id',organization.id).order('due_at');
 shell(`${heading('Tareas','Seguimiento de compromisos y responsables')}
 <div class="panel table-wrap"><table><thead><tr><th>Tarea</th><th>Responsable</th><th>Vencimiento</th><th>Estado</th></tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${esc(x.title)}</td><td>${esc(x.profiles?.display_name||'Sin asignar')}</td><td>${fmtDate(x.due_at)}</td><td>${statusPill(x.status)}</td></tr>`).join('')}</tbody></table>${!data?.length?'<p class="empty">No hay tareas registradas.</p>':''}</div>${error?'<p class="error">No se pudieron cargar las tareas.</p>':''}`);
}
async function members(){
 const {data,error}=await supabase.from('organization_members').select('role,profiles(display_name)').eq('organization_id',organization.id);
 shell(`${heading('Usuarios y permisos','Miembros asociados a la organización')}
 <div class="notice">El alta y la baja de usuarios se realizan mediante un proceso administrativo seguro. No se habilita el registro público.</div>
 <div class="panel table-wrap"><table><thead><tr><th>Nombre</th><th>Perfil</th></tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${esc(x.profiles?.display_name||'Usuario')}</td><td>${esc(roleLabel(x.role))}</td></tr>`).join('')}</tbody></table>${!data?.length?'<p class="empty">No hay miembros visibles.</p>':''}</div>${error?'<p class="error">No se pudo consultar la lista.</p>':''}`);
}
async function reports(){
 const [a,t]=await Promise.all([supabase.from('activities').select('id',{count:'exact',head:true}).eq('organization_id',organization.id),supabase.from('tasks').select('id,status',{count:'exact'}).eq('organization_id',organization.id)]);
 shell(`${heading('Informes','Indicadores operativos de la organización')}
 <div class="metrics">${metric(a.count??'—','Actividades','▣')}${metric(t.count??'—','Tareas','☑')}</div>
 <div class="panel section"><h2>Exportación</h2><p class="muted">Descargá datos de actividades y tareas en formato CSV para análisis administrativo.</p><div class="toolbar"><button class="btn primary" id="csv-activities">Actividades CSV</button><button class="btn primary" id="csv-tasks">Tareas CSV</button></div></div>`);
 document.querySelector('#csv-activities').onclick=()=>exportTable('activities',['title','activity_type','starts_at','status']);
 document.querySelector('#csv-tasks').onclick=()=>exportTable('tasks',['title','due_at','status']);
}
async function exportTable(table,cols){
 const {data,error}=await supabase.from(table).select(cols.join(',')).eq('organization_id',organization.id);
 if(error||!data?.length){notify('No hay datos para exportar',true);return;}
 const csv=[cols.join(';'),...data.map(row=>cols.map(c=>'"'+String(row[c]??'').replace(/"/g,'""')+'"').join(';'))].join('\n');
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));a.href=url;a.download=`territorio360-${table}.csv`;a.click();URL.revokeObjectURL(url);
}
async function boot(){
 if(!SUPABASE_URL||!SUPABASE_KEY){app.innerHTML=`<main class="login-wrap"><section class="login-card"><div class="brand login-brand"><div class="brand-icon">T</div><div><b>TERRITORIO 360</b><small>Gestión territorial · Chaco</small></div></div><h1>Configuración pendiente</h1><p>La interfaz está preparada. Para habilitar el acceso multiusuario, el administrador técnico debe crear el proyecto Supabase y completar las variables de entorno.</p><p class="muted">No ingreses contraseñas ni claves secretas en este archivo.</p></section></main>`;return;}
 supabase=createClient(SUPABASE_URL,SUPABASE_KEY);
 supabase.auth.onAuthStateChange(async(_event,newSession)=>{session=newSession;if(newSession){const ok=await loadIdentity();if(ok)renderPage();}else{session=null;organization=null;loginScreen();}});
 const {data:{session:s}}=await supabase.auth.getSession();session=s;
 if(!session){loginScreen();return;}
 const ok=await loadIdentity();if(ok)await renderPage();
}
boot();
