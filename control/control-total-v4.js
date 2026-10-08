/* BUSCO Control V4 · control total de afiliación, perfiles, valoraciones y embudo. */
(()=>{'use strict';

// Las tablas nuevas se cargan con el mismo mecanismo compartido del CRM.
tables.ratings='tool_ratings';
tables.users='internal_users';
tables.requests='tool_requests';
db.ratings ||= [];
db.users ||= [];
db.requests ||= [];

let BUSCO_PROFILE=null;
const DAY=86400000;
const roleLabel=r=>r==='propietaria'?'Propietaria':r==='gestor'?'Gestor/a':'Perfil interno';
const activeAffiliate=t=>t?.status==='Activa'&&!!String(t.affiliate_url||'').trim();
const toolEvents=t=>db.events.filter(e=>e.tool_id===t.id||e.tool_slug===t.tracking_slug);
const recent=(rows,days=30,dateKey='created_at')=>rows.filter(x=>Date.parse(x?.[dateKey]||0)>=Date.now()-days*DAY);
const eventDate=e=>Date.parse(e?.created_at||0)||0;
const safeNum=v=>Number.isFinite(Number(v))?Number(v):0;
const pct=(a,b)=>b?`${(a/b*100).toFixed(1)}%`:'—';
const dateText=v=>v?fmt(v):'—';
const normSource=v=>{
  if(!v)return 'Directo';
  if(typeof v==='string')return v||'Directo';
  return v.source||v.utm_source||'Directo';
};
const eventSource=e=>e.utm_source||normSource(e.last_source)||normSource(e.first_source)||'Directo';
const toolCommissions=t=>db.money.filter(c=>c.tool_id===t.id||(!c.tool_id&&slug(c.tool||'')===slug(t.name||'')));
const toolRatings=t=>db.ratings.filter(r=>r.tool_id===t.id);

function statsFor(t){
  const all=toolEvents(t),e30=recent(all,30),details=e30.filter(e=>e.event_type==='tool_detail'),clicks=e30.filter(e=>e.event_type==='affiliate_click'),compares=e30.filter(e=>e.event_type==='compare_add');
  const detailSessions=new Set(details.map(e=>e.session_id).filter(Boolean)),clickSessions=new Set(clicks.map(e=>e.session_id).filter(Boolean));
  const clickVisitors=new Set(clicks.map(e=>e.visitor_id).filter(Boolean));
  const cs=toolCommissions(t),known=cs.filter(c=>['Aprobada','Pagada'].includes(c.status)),pending=cs.filter(c=>c.status==='Pendiente'),approved=cs.filter(c=>c.status==='Aprobada'),paid=cs.filter(c=>c.status==='Pagada');
  const rs=toolRatings(t),ratingAvg=rs.length?rs.reduce((s,r)=>s+safeNum(r.rating),0)/rs.length:0;
  const sources={};
  for(const c of known){
    if(!c.click_id)continue;
    const ev=db.events.find(e=>String(e.click_id||e.id||'')===String(c.click_id));
    if(!ev)continue;
    const src=eventSource(ev);sources[src]=(sources[src]||0)+1;
  }
  const topSource=Object.entries(sources).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';
  const lastClick=[...all].filter(e=>e.event_type==='affiliate_click').sort((a,b)=>eventDate(b)-eventDate(a))[0]?.created_at||null;
  const lastConv=[...cs].sort((a,b)=>Date.parse(b.paid_date||b.date||0)-Date.parse(a.paid_date||a.date||0))[0];
  return {
    details:details.length,compares:compares.length,clicks:clicks.length,clickVisitors:clickVisitors.size,
    ctr:detailSessions.size?clickSessions.size/detailSessions.size*100:null,
    conversions:known.length,pending:pending.length,approved:approved.length,paid:paid.length,
    expected:cs.reduce((s,c)=>s+safeNum(c.expected),0),reported:cs.reduce((s,c)=>s+safeNum(c.reported),0),paidAmount:cs.reduce((s,c)=>s+safeNum(c.paid_commission),0),
    ratingAvg,ratingCount:rs.length,topSource,lastClick,lastConversion:lastConv?.paid_date||lastConv?.date||null
  };
}

function ownerNames(){
  const names=(db.users||[]).filter(u=>u.active).map(u=>u.display_name).filter(Boolean);
  for(const r of [...db.clients,...(db.projects||[]),...(db.leads||[])])if(r.owner&&!names.includes(r.owner))names.push(r.owner);
  if(!names.includes('Equipo BUSCO'))names.push('Equipo BUSCO');
  if((names.includes('Clara')||names.includes('Esther'))&&!names.includes('Clara + Esther'))names.push('Clara + Esther');
  return [...new Set(names)];
}
function refillOwnerSelect(sel,value){
  if(!sel)return;
  const current=value||sel.value||'Equipo BUSCO';
  sel.innerHTML=ownerNames().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if(!ownerNames().includes(current))sel.insertAdjacentHTML('beforeend',`<option value="${esc(current)}">${esc(current)}</option>`);
  sel.value=current;
}
function refreshOwnerFilter(){
  const sel=$('#clientOwnerF');if(!sel)return;const v=sel.value;
  sel.innerHTML='<option value="">Todas las responsables</option>'+ownerNames().map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if([...sel.options].some(o=>o.value===v))sel.value=v;
}

async function loadCurrentProfile(){
  if(!connected){BUSCO_PROFILE=null;return null;}
  try{BUSCO_PROFILE=await rpc('current_internal_profile',{});}catch{BUSCO_PROFILE=null;}
  applyRoleUI();
  return BUSCO_PROFILE;
}
function applyRoleUI(){
  const r=BUSCO_PROFILE?.role||'';
  document.body.dataset.buscoRole=r;
  const name=BUSCO_PROFILE?.display_name||remote.email||'';
  if(connected&&name)$('#mode').textContent=`Compartido · ${name} · ${roleLabel(r)}`;
  document.querySelectorAll('[data-owner-only]').forEach(el=>el.hidden=r!=='propietaria');
  const badge=$('#v4RoleNote');if(badge)badge.textContent=connected?`Perfil actual: ${name} · ${roleLabel(r)}`:'Inicia sesión para ver tu perfil.';
  const gate=$('#authGate');if(gate)gate.textContent='BUSCO Control privado. Inicia sesión con una cuenta autorizada. Los datos compartidos no se guardan en este navegador.';
}

// El perfil Consulta puede leer todo pero no modificar nada.
// Cargamos las tablas V4 y el perfil en cada actualización compartida.
const baseLoadRemote=loadRemote;
loadRemote=async function(){await baseLoadRemote();await loadCurrentProfile();renderV4Only();};
const baseLogin=login;
login=async function(){await baseLogin();await loadCurrentProfile();renderV4Only();};
const baseLogout=logout;
logout=async function(){BUSCO_PROFILE=null;await baseLogout();applyRoleUI();};

// ============================================================
// UI NUEVA
// ============================================================
function installV4UI(){
  const style=document.createElement('style');
  style.textContent=`
  .v4-split{display:grid;grid-template-columns:1fr;gap:16px;margin-top:14px}.v4-block{border:1px solid rgba(137,242,255,.13);border-radius:16px;background:linear-gradient(155deg,rgba(7,16,29,.60),rgba(2,8,16,.74));padding:16px}.v4-block.pending{border-color:rgba(255,199,102,.16)}
  .v4-block-head{display:flex;gap:12px;align-items:center;margin-bottom:12px}.v4-block-head h3{margin:0}.v4-count{margin-left:auto;padding:5px 9px;border-radius:999px;background:rgba(24,223,255,.07);border:1px solid rgba(24,223,255,.15);font-size:10px;color:#9cefff}.pending .v4-count{color:#ffd78b;border-color:rgba(255,199,102,.18);background:rgba(255,199,102,.05)}
  .v4-mini-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-top:14px}.v4-mini{padding:12px;border:1px solid rgba(137,242,255,.10);border-radius:12px;background:rgba(2,8,15,.38)}.v4-mini b{display:block;font-size:20px;margin-top:5px}.v4-mini small{color:#8295a8;font-size:9px;text-transform:uppercase;letter-spacing:.06em}
  .v4-tool-snapshot{border:1px solid rgba(24,223,255,.15);border-radius:14px;padding:14px;background:linear-gradient(100deg,rgba(24,223,255,.035),rgba(154,105,255,.025),rgba(255,47,183,.035))}.v4-statgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.v4-stat{padding:9px;border:1px solid rgba(255,255,255,.06);border-radius:10px}.v4-stat span{display:block;color:#7f92a7;font-size:8px;text-transform:uppercase}.v4-stat b{display:block;margin-top:4px;font-size:13px}
  .v4-profile-grid{display:grid;gap:8px}.v4-profile-row{display:grid;grid-template-columns:1.1fr .8fr .6fr auto;gap:10px;align-items:center;padding:10px;border:1px solid rgba(137,242,255,.09);border-radius:11px}.v4-profile-row small{color:#788ba0}.v4-role{display:inline-flex;padding:4px 8px;border-radius:999px;border:1px solid rgba(154,105,255,.18);font-size:9px;color:#c5bbff}.v4-role.owner{border-color:rgba(255,47,183,.2);color:#ff9ddd}.v4-role.viewer{color:#b5c0cc;border-color:rgba(255,255,255,.11)}
  #v4ExtraMetrics{margin-top:14px}.v4-wide-note{margin-top:10px;color:#8194a8;font-size:10px}.v4-aff-link{color:#9cefff;font-size:9px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}.v4-rating{white-space:nowrap;color:#ffd78b}.v4-danger{color:#ff9eb0}.v4-ok{color:#9ff1c7}
  @media(max-width:1000px){.v4-mini-metrics,.v4-statgrid{grid-template-columns:repeat(2,1fr)}}@media(max-width:720px){.v4-mini-metrics,.v4-statgrid{grid-template-columns:1fr}.v4-profile-row{grid-template-columns:1fr}.v4-block{padding:12px}}
  `;
  document.head.append(style);

  const toolsView=$('#v-tools');
  const oldTable=toolsView?.querySelector(':scope > .table');if(oldTable)oldTable.classList.add('hidden');
  if(toolsView&&!$('#v4ToolSplit'))toolsView.insertAdjacentHTML('beforeend',`<div id="v4ToolSplit" class="v4-split">
    <div class="v4-block"><div class="v4-block-head"><div><h3>AFILIADOS ACTIVOS</h3><div class="small muted">Tienen enlace de afiliación activo y pueden generar comisión.</div></div><span class="v4-count" id="v4AffiliateCount">0</span></div><div class="table"><table><thead><tr><th>Herramienta</th><th>Red / programa</th><th>Comisión</th><th>30 días</th><th>Valoración</th><th>Conciliación</th><th>Revisión</th><th></th></tr></thead><tbody id="v4Affiliates"></tbody></table></div></div>
    <div class="v4-block pending"><div class="v4-block-head"><div><h3>SIN AFILIACIÓN / EN TRÁMITE</h3><div class="small muted">Pendientes, rechazadas o todavía sin solicitar. Cuando llegue el enlace, se activa desde aquí.</div></div><span class="v4-count" id="v4NonAffiliateCount">0</span></div><div class="table"><table><thead><tr><th>Herramienta</th><th>Estado</th><th>Web</th><th>30 días</th><th>Valoración</th><th>Próxima revisión</th><th></th></tr></thead><tbody id="v4NonAffiliates"></tbody></table></div></div>
  </div>`);

  const firstMetrics=$('#v-dash .grid.metrics');
  if(firstMetrics&&!$('#v4ExtraMetrics'))firstMetrics.insertAdjacentHTML('afterend','<div id="v4ExtraMetrics" class="grid metrics"></div>');

  installCommissionColumns();

  const settings=$('#v-settings');
  if(settings&&!$('#v4ProfilesCard'))settings.insertAdjacentHTML('beforeend',`<div class="card" id="v4ProfilesCard" style="margin-top:14px"><div class="section-title"><div><h3>Perfiles de BUSCO Control</h3><p class="small muted">No está limitado a Clara y Esther. Puedes autorizar más personas cuando haga falta.</p></div><button class="btn" data-owner-only data-v4-write onclick="profileModal()">+ Añadir perfil</button></div><div class="note" id="v4RoleNote" style="margin:12px 0"></div><div class="note" style="margin-bottom:12px">Para añadir una persona: primero crea o invita su usuario en Supabase → Authentication. Después pega aquí su UUID. No se guardan contraseñas en BUSCO Control. <b>Gestor/a</b> puede llevar la operativa sin poder gestionar perfiles de acceso.</div><div id="v4Profiles" class="v4-profile-grid"></div></div>`);

  // Texto ya no limitado a dos personas.
  const sh=$('#v-settings .head p');if(sh)sh.textContent='Acceso compartido para todas las personas autorizadas.';
  const gate=$('#authGate');if(gate)gate.textContent='BUSCO Control privado. Inicia sesión con tu cuenta autorizada.';
  const catalogNote=[...document.querySelectorAll('#v-settings .note')].find(x=>x.textContent.includes('88 fichas'));if(catalogNote)catalogNote.innerHTML=catalogNote.innerHTML.replace('88 fichas','46 fichas actuales');
}

// ============================================================
// HERRAMIENTAS: DOS BLOQUES + ACTIVACIÓN
// ============================================================
const baseRenderTools=renderTools;
renderTools=function(){
  if(!$('#v4Affiliates'))return baseRenderTools();
  const q=($('#toolQ')?.value||'').toLowerCase(),f=$('#toolF')?.value||'',pf=$('#toolPublicF')?.value||'';
  const rows=db.tools.filter(x=>(!q||JSON.stringify(x).toLowerCase().includes(q))&&(!f||x.status===f)&&(!pf||(x.public_status||'Borrador')===pf));
  const aff=rows.filter(activeAffiliate),no=rows.filter(x=>!activeAffiliate(x));
  $('#v4AffiliateCount').textContent=aff.length;$('#v4NonAffiliateCount').textContent=no.length;
  $('#v4Affiliates').innerHTML=aff.length?aff.map(t=>{
    const s=statsFor(t);return `<tr><td><b>${esc(t.name)}</b><small class="v4-aff-link" title="${esc(t.affiliate_url||'')}">${esc(t.affiliate_url||'')}</small><div class="muted small">${esc(t.public_status||'Borrador')} · ${esc(t.tracking_slug||'')}</div></td><td>${esc(t.network||'—')}</td><td><b>${esc(t.commission||'—')}</b>${t.recurring?'<div class="small v4-ok">Recurrente</div>':''}</td><td>${s.clicks} clics · ${s.clickVisitors} pers.<div class="muted small">${s.details} fichas · CTR ${s.ctr==null?'—':s.ctr.toFixed(1)+'%'}</div></td><td><span class="v4-rating">${s.ratingCount?s.ratingAvg.toFixed(1)+' ★':'—'}</span><div class="muted small">${s.ratingCount} votos</div></td><td>${esc(t.reconciliation_method||'Manual')}</td><td>${esc(t.review_date||'—')}</td><td><button class="mini" data-v4-write onclick="toolModal('${t.id}')">Abrir ficha</button></td></tr>`;
  }).join(''):'<tr><td colspan="8" class="empty">No hay afiliaciones activas con estos filtros.</td></tr>';
  $('#v4NonAffiliates').innerHTML=no.length?no.map(t=>{const s=statsFor(t);return `<tr><td><b>${esc(t.name)}</b><div class="muted small">${esc(t.category||'')}</div></td><td><span class="status ${st(t.status)}">${esc(t.status||'Sin solicitar')}</span></td><td>${t.official_url?'<span class="v4-ok">Web guardada</span>':'<span class="v4-danger">Sin web</span>'}</td><td>${s.details} fichas · ${s.compares} comparaciones<div class="muted small">${s.clicks} clics afiliados</div></td><td><span class="v4-rating">${s.ratingCount?s.ratingAvg.toFixed(1)+' ★':'—'}</span><div class="muted small">${s.ratingCount} votos</div></td><td>${esc(t.review_date||'—')}</td><td><button class="mini" data-v4-write onclick="toolModal('${t.id}')">Editar</button> <button class="mini" data-v4-write onclick="activateAffiliate('${t.id}')">ACTIVAR AFILIACIÓN</button></td></tr>`;}).join(''):'<tr><td colspan="7" class="empty">No hay herramientas sin afiliación con estos filtros.</td></tr>';
  applyRoleUI();
};
window.activateAffiliate=function(id){
  toolModal(id);
  const status=$('#a4'),link=$('#a5');if(status)status.value='Activa';
  const grid=$('#mcontent .formgrid');if(grid)grid.insertAdjacentHTML('afterbegin','<div class="full note">Para pasarla a AFILIADOS ACTIVOS, pega el enlace de afiliación y guarda la ficha. BUSCO no permitirá activar una herramienta sin enlace.</div>');
  setTimeout(()=>link?.focus(),50);
};

const baseToolModal=toolModal;
toolModal=function(id=''){
  baseToolModal(id);
  const t=db.tools.find(x=>x.id===id)||{},s=t.id?statsFor(t):null,grid=$('#mcontent .formgrid');if(!grid)return;
  const rec=t.reconciliation_method||'Manual';
  grid.insertAdjacentHTML('beforeend',`<div><label>Método de conciliación</label><select id="v4Recon"><option>Manual</option><option>CSV / Excel</option><option>API</option><option>Webhook</option><option>SubID / Click ID</option><option>Panel partner</option><option>Otro</option></select></div><div><label>Estado real</label><div class="note">${activeAffiliate(t)?'AFILIADO ACTIVO':'SIN AFILIACIÓN / EN TRÁMITE'}</div></div>${s?`<div class="full v4-tool-snapshot"><b>CONTROL DE ESTA HERRAMIENTA</b><div class="v4-statgrid"><div class="v4-stat"><span>Fichas · 30 d</span><b>${s.details}</b></div><div class="v4-stat"><span>Clics · 30 d</span><b>${s.clicks}</b></div><div class="v4-stat"><span>Visitantes clic</span><b>${s.clickVisitors}</b></div><div class="v4-stat"><span>CTR ficha → clic</span><b>${s.ctr==null?'—':s.ctr.toFixed(1)+'%'}</b></div><div class="v4-stat"><span>Comparaciones</span><b>${s.compares}</b></div><div class="v4-stat"><span>Conversiones conocidas</span><b>${s.conversions}</b></div><div class="v4-stat"><span>Pend. / Aprob. / Pag.</span><b>${s.pending} / ${s.approved} / ${s.paid}</b></div><div class="v4-stat"><span>Comisión esperada</span><b>${money(s.expected)}</b></div><div class="v4-stat"><span>Comisión reportada</span><b>${money(s.reported)}</b></div><div class="v4-stat"><span>Comisión cobrada</span><b>${money(s.paidAmount)}</b></div><div class="v4-stat"><span>Valoración</span><b>${s.ratingCount?s.ratingAvg.toFixed(1)+' ★ · '+s.ratingCount:'Sin votos'}</b></div><div class="v4-stat"><span>Origen que más convierte</span><b>${esc(s.topSource)}</b></div><div class="v4-stat"><span>Último clic</span><b>${dateText(s.lastClick)}</b></div><div class="v4-stat"><span>Última conversión</span><b>${dateText(s.lastConversion)}</b></div></div><div class="v4-wide-note">Una conversión solo se vincula a una persona anónima si el partner devuelve un Click ID/SubID compatible. Si no, BUSCO conserva la conversión sin inventar quién compró.</div></div>`:''}`);
  $('#v4Recon').value=rec;
  applyRoleUI();
};

const baseSaveTool=saveTool;
saveTool=async function(id){
  if($('#a4')?.value==='Activa'&&!String($('#a5')?.value||'').trim())throw Error('Para activar la afiliación tienes que guardar el enlace de afiliado.');
  const recon=$('#v4Recon')?.value||'Manual',baseUpsert=upsert;
  upsert=async(t,r)=>baseUpsert(t,t==='tools'?{...r,reconciliation_method:recon}:r);
  try{await baseSaveTool(id);}finally{upsert=baseUpsert;}
};

// ============================================================
// PERFILES Y RESPONSABLES DINÁMICOS
// ============================================================
window.profileModal=function(id=''){
  if(BUSCO_PROFILE?.role!=='propietaria')throw Error('Solo una propietaria puede gestionar perfiles.');
  const u=db.users.find(x=>x.id===id)||{};
  openM(id?'Editar perfil':'Añadir perfil',`<div class="formgrid"><div class="full note">El usuario debe existir primero en Supabase → Authentication. Aquí autorizas su acceso a BUSCO Control.</div><div><label>UUID de Authentication</label><input id="pu1" value="${esc(u.id||'')}" ${id?'readonly':''} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></div><div><label>Nombre visible</label><input id="pu2" value="${esc(u.display_name||'')}"></div><div><label>Rol</label><select id="pu3"><option value="propietaria">Propietaria</option><option value="gestor">Gestor/a</option></select></div><div><label>Activo</label><select id="pu4"><option value="true">Sí</option><option value="false">No</option></select></div><div class="full"><label>Notas internas</label><textarea id="pu5">${esc(u.notes||'')}</textarea></div></div><div class="formactions"><button class="btn" data-v4-write onclick="saveProfile()">Guardar perfil</button></div>`);
  $('#pu3').value=u.role||'gestor';$('#pu4').value=String(u.active!==false);
};
window.saveProfile=async function(){
  requireAccess();if(BUSCO_PROFILE?.role!=='propietaria')throw Error('Solo una propietaria puede gestionar perfiles.');
  const id=$('#pu1').value.trim(),name=$('#pu2').value.trim(),role=$('#pu3').value,active=$('#pu4').value==='true',notes=$('#pu5').value.trim()||null;
  if(!Core.uuidRE.test(id))throw Error('Pega el UUID completo del usuario de Authentication.');
  await rpc('manage_internal_user',{p_user_id:id,p_display_name:name,p_role:role,p_active:active,p_notes:notes});
  closeM();await loadRemote();
};
function renderProfiles(){
  const box=$('#v4Profiles');if(!box)return;
  const rows=[...(db.users||[])].sort((a,b)=>Number(b.active)-Number(a.active)||String(a.display_name).localeCompare(String(b.display_name),'es'));
  box.innerHTML=rows.length?rows.map(u=>`<div class="v4-profile-row"><div><b>${esc(u.display_name)}</b><small>${esc(u.id)}</small></div><div><span class="v4-role ${u.role==='propietaria'?'owner':''}">${roleLabel(u.role)}</span></div><div><span class="status ${u.active?'ok':'bad'}">${u.active?'Activo':'Desactivado'}</span></div><div>${BUSCO_PROFILE?.role==='propietaria'?`<button class="mini" data-v4-write onclick="profileModal('${u.id}')">Editar</button>`:''}</div></div>`).join(''):'<div class="empty">Todavía no hay perfiles cargados.</div>';
  applyRoleUI();
}

const baseClientModal=clientModal;
clientModal=function(id=''){baseClientModal(id);const x=db.clients.find(v=>v.id===id)||{};refillOwnerSelect($('#cl17'),x.owner||'Equipo BUSCO');};
const baseEntityModal=entityModal;
entityModal=function(t,id=''){baseEntityModal(t,id);const x=db[t]?.find(v=>v.id===id)||{};if($('#ex_owner'))refillOwnerSelect($('#ex_owner'),x.owner||'Equipo BUSCO');};

// Comisión: mostrar también red, cobrado, vencimiento y evidencia.
function installCommissionColumns(){
  const head=$('#v-money table thead tr');if(head)head.innerHTML='<th>Fecha</th><th>Herramienta</th><th>Red</th><th>Venta</th><th>Esperado</th><th>Reportado</th><th>Cobrado</th><th>Estado</th><th>Vencimiento</th><th>Click ID</th><th>Diferencia</th><th></th>';
}
renderMoney=function(){
  installCommissionColumns();
  $('#tbMoney').innerHTML=db.money.length?db.money.map(x=>{const d=safeNum(x.reported)-safeNum(x.expected);return `<tr><td>${esc(x.date||'—')}</td><td><b>${esc(x.tool||'—')}</b></td><td>${esc(x.network||'—')}</td><td>${money(x.sale)}</td><td>${money(x.expected)}</td><td>${money(x.reported)}</td><td>${money(x.paid_commission)}</td><td><span class="status ${st(x.status)}">${esc(x.status||'Pendiente')}</span></td><td>${esc(x.due_date||'—')}</td><td><span class="muted small">${esc((x.click_id||'—').slice(0,12))}</span></td><td style="color:${Math.abs(d)>.01?'#ff6c86':'#52e6a6'}">${money(d)}</td><td><button class="mini" data-v4-write onclick="moneyModal('${x.id}')">Editar</button></td></tr>`;}).join(''):'<tr><td colspan="12" class="empty">Aún no hay conversiones.</td></tr>';
  applyRoleUI();
};

// ============================================================
// DASHBOARD Y RENDIMIENTO
// ============================================================
const labelEvent={page_view:'Visita',search:'Búsqueda',tool_detail:'Ficha abierta',compare_add:'Añadida a comparar',compare_remove:'Quitada de comparar',compare_open:'Comparador abierto',compare_complete:'Comparación finalizada',affiliate_click:'Clic afiliado',official_click:'Web oficial',whatsapp_click:'WhatsApp',portfolio_open:'Portfolio',guide_open:'Ayúdame a elegir',guide_apply:'Guía aplicada',voice_play:'Voz',implementation_request:'Solicitud implantación',partner_request_open:'Solicitud partner abierta',partner_request_submit:'Solicitud partner enviada',rating_submit:'Valoración'};
renderEvents=function(){
  $('#tbEvents').innerHTML=db.events.length?[...db.events].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,700).map(x=>`<tr><td>${fmt(x.created_at)}</td><td>${esc(labelEvent[x.event_type]||x.event_type)}</td><td>${esc((x.visitor_id||'—').slice(0,12))}</td><td>${esc(x.tool_slug||'—')}</td><td>${esc(eventSource(x))}</td><td>${esc((x.page_path||x.page_url||'—').slice(0,45))}</td></tr>`).join(''):'<tr><td colspan="6" class="empty">Aquí aparecerá la actividad aceptada por el usuario.</td></tr>';
};

const baseRenderDash=renderDash;
renderDash=function(){
  baseRenderDash();
  const e30=recent(db.events,30),views=e30.filter(e=>e.event_type==='page_view'),details=e30.filter(e=>e.event_type==='tool_detail'),compOpen=e30.filter(e=>['compare_open','compare_complete'].includes(e.event_type)),clicks=e30.filter(e=>e.event_type==='affiliate_click');
  const visitors=new Set(views.map(e=>e.visitor_id).filter(Boolean));
  const c30=db.money.filter(c=>Date.parse(c.paid_date||c.date||0)>=Date.now()-30*DAY),known30=c30.filter(c=>['Aprobada','Pagada'].includes(c.status)),paid30=c30.filter(c=>c.status==='Pagada');
  $('#mClicks').textContent=clicks.length;$('#mVisitors').textContent=visitors.size;$('#mConv').textContent=db.money.filter(c=>['Aprobada','Pagada'].includes(c.status)).length;$('#mPending').textContent=money(db.money.filter(c=>!['Rechazada','Pagada'].includes(c.status)).reduce((s,c)=>s+Math.max(0,safeNum(c.reported??c.expected)-safeNum(c.paid_commission)),0));
  const vals=[['Visitas · 30 d',views.length],['Fichas · 30 d',details.length],['Comparaciones · 30 d',compOpen.length],['Clic afiliado · 30 d',clicks.length],['Conversiones conocidas · 30 d',known30.length],['Pagadas · 30 d',paid30.length]],mx=Math.max(1,...vals.map(x=>x[1]));
  $('#funnel').innerHTML=vals.map(x=>`<div class="barrow"><span>${x[0]}</span><div class="bar"><i style="width:${x[1]/mx*100}%"></i></div><b>${x[1]}</b></div>`).join('');

  const requests30=(db.requests||[]).filter(r=>Date.parse(r.created_at||0)>=Date.now()-30*DAY).length;
  const metrics=[
    ['Visitas',views.length,'30 días'],['Fichas abiertas',details.length,'30 días'],['Comparaciones',compOpen.length,'abiertas/finalizadas'],['Voz',e30.filter(e=>e.event_type==='voice_play').length,'reproducciones'],
    ['Ayúdame a elegir',e30.filter(e=>['guide_open','guide_apply'].includes(e.event_type)).length,'usos'],['Implantación',e30.filter(e=>e.event_type==='implementation_request').length,'solicitudes'],['Partners',requests30,'solicitudes reales'],['Valoraciones',db.ratings.length,'votos acumulados']
  ];
  $('#v4ExtraMetrics').innerHTML=metrics.map((m,i)=>`<div class="card ${i%2?'pink':''}"><div class="ml">${m[0]}</div><div class="mv ${i%2?'pink':'cyan'}">${m[1]}</div><div class="ms">${m[2]}</div></div>`).join('');

  const expected=db.money.reduce((s,c)=>s+safeNum(c.expected),0),reported=db.money.reduce((s,c)=>s+safeNum(c.reported),0),paid=db.money.reduce((s,c)=>s+safeNum(c.paid_commission),0);
  if($('#extraMetrics'))$('#extraMetrics').innerHTML=`Comisión esperada: <b>${money(expected)}</b> · reportada: <b>${money(reported)}</b> · cobrada: <b>${money(paid)}</b>. La compra solo queda vinculada al visitante cuando el partner devuelve un Click ID/SubID compatible.`;

  const alerts=[];const today=new Date().toISOString().slice(0,10),cut60=Date.now()-60*DAY;
  for(const t of db.tools){
    if(t.review_date&&t.review_date<today)alerts.push(`<strong>${esc(t.name)}</strong>Toca revisar comisión o condiciones.`);
    if(t.status==='Activa'&&!String(t.affiliate_url||'').trim())alerts.push(`<strong>${esc(t.name)}</strong>Está marcada Activa pero falta el enlace afiliado.`);
    if(t.public_status==='Publicado'&&!String(t.official_url||'').trim())alerts.push(`<strong>${esc(t.name)}</strong>Está publicada sin web oficial.`);
    if(activeAffiliate(t)){
      const e=toolEvents(t),click60=e.filter(x=>x.event_type==='affiliate_click'&&eventDate(x)>=cut60).length,conv60=toolCommissions(t).filter(c=>['Aprobada','Pagada'].includes(c.status)&&Date.parse(c.paid_date||c.date||0)>=cut60).length;
      if(click60>0&&conv60===0)alerts.push(`<strong>${esc(t.name)}</strong>${click60} clics afiliados en 60 días y ninguna conversión conocida.`);
    }
  }
  for(const c of db.money){if(c.reported!=null&&c.expected!=null&&Math.abs(safeNum(c.reported)-safeNum(c.expected))>.01)alerts.push(`<strong>${esc(c.tool||'Comisión')}</strong>Diferencia entre comisión esperada y reportada.`);if(c.due_date&&c.due_date<today&&!['Pagada','Rechazada'].includes(c.status))alerts.push(`<strong>${esc(c.tool||'Comisión')}</strong>Comisión vencida pendiente de cobro.`);}
  for(const i of db.issues.filter(x=>x.status!=='Resuelta'))if(/enlace|link/i.test(i.type||''))alerts.push(`<strong>${esc(i.tool||'Enlace')}</strong>Incidencia de enlace abierta: ${esc(i.type||'revisar')}.`);
  $('#alerts').innerHTML=alerts.length?alerts.map(a=>`<div class="alert">${a}</div>`).join(''):'<div class="empty">Sin avisos importantes.</div>';
};

renderPerformance=function(){
  const rows=db.tools.map(t=>({t,s:statsFor(t)})).sort((a,b)=>b.s.paidAmount-a.s.paidAmount||b.s.conversions-a.s.conversions||b.s.clicks-a.s.clicks);
  $('#toolPerformance').innerHTML=`<p class="small muted">30 días para navegación/clics · acumulado para conversiones, comisión y valoraciones.</p><div class="table"><table class="perf-table"><thead><tr><th>Herramienta</th><th>Fichas</th><th>Comp.</th><th>Clics</th><th>Visit. clic</th><th>CTR</th><th>Conv.</th><th>P/A/P</th><th>Esperado</th><th>Reportado</th><th>Cobrado</th><th>★</th><th>Origen que convierte</th><th>Últ. clic</th><th>Últ. conv.</th><th>Conciliación</th></tr></thead><tbody>${rows.map(({t,s})=>`<tr><td><button class="mini" onclick="toolModal('${t.id}')">${esc(t.name)}</button></td><td>${s.details}</td><td>${s.compares}</td><td>${s.clicks}</td><td>${s.clickVisitors}</td><td>${s.ctr==null?'—':s.ctr.toFixed(1)+'%'}</td><td>${s.conversions}</td><td>${s.pending}/${s.approved}/${s.paid}</td><td>${money(s.expected)}</td><td>${money(s.reported)}</td><td>${money(s.paidAmount)}</td><td>${s.ratingCount?s.ratingAvg.toFixed(1)+' · '+s.ratingCount:'—'}</td><td>${esc(s.topSource)}</td><td>${dateText(s.lastClick)}</td><td>${dateText(s.lastConversion)}</td><td>${esc(t.reconciliation_method||'Manual')}</td></tr>`).join('')}</tbody></table></div>`;
};

function renderV4Only(){refreshOwnerFilter();renderProfiles();renderTools();renderDash();renderPerformance();renderEvents();applyRoleUI();}
const baseRender=render;
render=function(){baseRender();renderV4Only();};

installV4UI();
refreshOwnerFilter();
renderV4Only();
})();
