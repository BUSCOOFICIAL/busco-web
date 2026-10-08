(()=>{'use strict';
async function start(){let routes;try{const r=await fetch('seo-routes.json');if(!r.ok)return;routes=await r.json();}catch{return;}
const query=new URLSearchParams(location.search);if([...query.keys()].some(k=>['q','categoria','filter','search'].includes(k))){document.querySelector('meta[name="robots"]')?.setAttribute('content','noindex,follow');}
function seoToolHref(id){const l=window.BUSCO_CURRENT_LANG||'es';return l==='en'?'/en/tools/'+id+'/':(l==='ca'?'/ca/eines/'+id+'/':'/herramientas/'+id+'/')}function seoToolLabel(){const l=window.BUSCO_CURRENT_LANG||'es';return l==='en'?'Full profile ↗':(l==='ca'?'Fitxa completa ↗':'Ficha completa ↗')}function addLinks(){for(const card of document.querySelectorAll('#bcResults [data-tool]')){const id=card.dataset.tool;if(!routes.tools.includes(id)||card.querySelector('[data-seo-link]'))continue;const a=document.createElement('a');a.href=seoToolHref(id);a.textContent=seoToolLabel();a.dataset.seoLink=id;a.className='bc-web-link';card.append(a);}const detail=document.querySelector('#bcDetail [data-official-tool]');if(detail&&routes.tools.includes(detail.dataset.officialTool)&&!document.querySelector('#bcDetail [data-seo-link]')){const a=document.createElement('a');a.href=seoToolHref(detail.dataset.officialTool);a.textContent=seoToolLabel();a.dataset.seoLink=detail.dataset.officialTool;detail.parentNode.append(a);}}
const observer=new MutationObserver(addLinks);for(const id of ['bcResults','bcDetail']){const el=document.getElementById(id);if(el)observer.observe(el,{childList:true,subtree:true});}addLinks();
const c=query.get('categoria');if(c&&routes.categories[c])window.futureRoute?.(c);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
