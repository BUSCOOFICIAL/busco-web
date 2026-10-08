/* BUSCO V4 · analítica con consentimiento + valoraciones + solicitudes públicas. */
(()=>{'use strict';
const cfg=window.BUSCO_CONFIG||{};
const types=new Set(['page_view','search','tool_detail','compare_add','compare_remove','compare_open','compare_complete','affiliate_click','official_click','whatsapp_click','portfolio_open','guide_open','guide_apply','voice_play','implementation_request','partner_request_open','partner_request_submit','rating_submit']);
const read=(s,k)=>{try{return s.getItem(k);}catch{return null;}},write=(s,k,v)=>{try{s.setItem(k,v);}catch{}},remove=(s,k)=>{try{s.removeItem(k);}catch{}};
let vid,sid,first,last,lastAt=0,consent=read(localStorage,'busco_consent')==='accepted',inflight=new Set();
const disabled=()=>navigator.globalPrivacyControl===true;
function initIds(){if(vid)return;vid=read(localStorage,'busco_vid')||crypto.randomUUID();sid=read(sessionStorage,'busco_sid')||crypto.randomUUID();write(localStorage,'busco_vid',vid);write(sessionStorage,'busco_sid',sid);const p=new URLSearchParams(location.search);let ref='direct';try{ref=document.referrer?new URL(document.referrer).hostname:'direct';}catch{};last={source:(p.get('utm_source')||ref).slice(0,100),medium:(p.get('utm_medium')||'').slice(0,100),campaign:(p.get('utm_campaign')||'').slice(0,100)};try{first=JSON.parse(read(localStorage,'busco_first_touch'))||last;}catch{first=last;}write(localStorage,'busco_first_touch',JSON.stringify(first));write(localStorage,'busco_last_touch',JSON.stringify(last));}
async function track(type,extra={}){if(!consent||disabled()||!types.has(type)||!cfg.supabaseUrl||!cfg.publishableKey)return null;if(Date.now()-lastAt<80&&type==='search')return null;lastAt=Date.now();initIds();const id=crypto.randomUUID(),row={id,event_type:type,visitor_id:vid,session_id:sid,tool_slug:extra.tool_slug||extra.tool_id||null,page_path:location.pathname,utm_source:last.source,utm_medium:last.medium,utm_campaign:last.campaign,first_source:first,last_source:last,query_length:String(extra.query||'').length,selected_count:Number(extra.selected_count||0),surface:String(extra.surface||'').slice(0,80),action:String(extra.action||'').slice(0,80)};const controller=new AbortController();inflight.add(controller);try{const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/collect_event',{method:'POST',keepalive:true,signal:controller.signal,headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({event:row})});if(!r.ok||await r.json()!==true)return null;return id;}catch{return null;}finally{inflight.delete(controller);}}
window.BUSCO_TRACK=track;
function setConsent(accepted){consent=accepted&&!disabled();write(localStorage,'busco_consent',consent?'accepted':'rejected');if(!consent){for(const c of inflight)c.abort();for(const k of ['busco_vid','busco_first_touch','busco_last_touch','busco_public_analytics_v1'])remove(localStorage,k);remove(sessionStorage,'busco_sid');vid=sid=first=last=null;}else track('page_view');document.getElementById('buscoConsent')?.remove();}
window.BUSCO_SET_CONSENT=setConsent;
window.BUSCO_GET_ANON_VISITOR=()=>{if(!consent||disabled())return null;initIds();return vid;};

window.BUSCO_RATE_TOOL=async function(toolSlug,rating){
  if(!consent||disabled()){panel();throw new Error('Para guardar una valoración anónima hay que aceptar la medición.');}
  initIds();
  const value=Number(rating);if(!Number.isInteger(value)||value<1||value>5)throw new Error('La valoración debe estar entre 1 y 5.');
  const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/submit_tool_rating',{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_tool_slug:toolSlug,p_visitor_id:vid,p_rating:value})});
  if(!r.ok)throw new Error((await r.json().catch(()=>({}))).message||'No se pudo guardar la valoración.');
  const out=await r.json();track('rating_submit',{tool_slug:toolSlug,action:String(value),surface:'ficha'});return out;
};

window.BUSCO_SUBMIT_TOOL_REQUEST=async function(payload){
  if(!cfg.supabaseUrl||!cfg.publishableKey)throw new Error('BUSCO no está conectado.');
  const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+'/rest/v1/rpc/submit_tool_request',{method:'POST',headers:{apikey:cfg.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({request:payload})});
  if(!r.ok)throw new Error((await r.json().catch(()=>({}))).message||'No se pudo registrar la solicitud.');
  const out=await r.json();track('partner_request_submit',{surface:'partner_form'});return out;
};

function panel(){document.getElementById('buscoConsent')?.remove();const p=document.createElement('aside');p.id='buscoConsent';p.setAttribute('aria-label','Preferencias de analítica');p.style.cssText='position:fixed;bottom:55px;left:16px;z-index:99999;max-width:430px;padding:18px;background:#07101a;color:#f7fbff;border:1px solid #18dfff;border-radius:16px;font:14px Segoe UI,sans-serif';const text=document.createElement('p');text.textContent='¿Permites medir visitas y clics de BUSCO? Usamos un identificador aleatorio de navegador, sin guardar el texto de tus búsquedas. Puedes cambiar esta elección aquí cuando quieras.';p.append(text);for(const [label,yes] of [['Aceptar',true],['Rechazar',false]]){const b=document.createElement('button');b.textContent=label;b.style.cssText='margin:4px;padding:10px 16px;background:#07101a;color:white;border:1px solid #18dfff;border-radius:12px';b.onclick=()=>setConsent(yes);p.append(b);}document.body.append(p);}
function start(){remove(localStorage,'busco_public_analytics_v1');const b=document.createElement('button');b.textContent='Privacidad';b.style.cssText='position:fixed;bottom:8px;left:10px;z-index:99998;background:#07101a;color:white;border:1px solid #18dfff;border-radius:12px;padding:7px';b.onclick=panel;document.body.append(b);if(disabled())setConsent(false);else if(!read(localStorage,'busco_consent'))panel();else if(consent)track('page_view');}
document.addEventListener('click',e=>{const el=e.target.closest('a,button');if(!el)return;if(el.dataset.buscoAffiliate)track('affiliate_click',{tool_slug:el.dataset.buscoAffiliate,surface:el.dataset.buscoSurface||'ficha'});else if(el.dataset.buscoTrack==='portfolio'||/portfolio/i.test(el.getAttribute('onclick')||''))track('portfolio_open');else if(el.dataset.buscoTrack==='whatsapp'||/^https:\/\/(wa.me|api.whatsapp.com)\//.test(el.href||''))track('whatsapp_click',{surface:el.dataset.buscoSurface||''});},true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
