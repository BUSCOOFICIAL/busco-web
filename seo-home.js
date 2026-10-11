(()=>{'use strict';
async function start(){let routes;try{const r=await fetch('seo-routes.json');if(!r.ok)return;routes=await r.json();}catch{return;}
const query=new URLSearchParams(location.search);if([...query.keys()].some(k=>['q','categoria','filter','search'].includes(k))){document.querySelector('meta[name="robots"]')?.setAttribute('content','noindex,follow');}
function seoToolHref(id){const l=window.BUSCO_CURRENT_LANG||'es';return l==='en'?'/en/tools/'+id+'/':(l==='ca'?'/ca/eines/'+id+'/':'/herramientas/'+id+'/')}function seoToolLabel(){const l=window.BUSCO_CURRENT_LANG||'es';return l==='en'?'Full profile ↗':(l==='ca'?'Fitxa completa ↗':'Ficha completa ↗')}function addLinks(){for(const card of document.querySelectorAll('#bcResults [data-tool]')){const id=card.dataset.tool;if(!routes.tools.includes(id)||card.querySelector('[data-seo-link]'))continue;const a=document.createElement('a');a.href=seoToolHref(id);a.textContent=seoToolLabel();a.dataset.seoLink=id;a.className='bc-web-link';void a;}const detail=document.querySelector('#bcDetail [data-official-tool]');if(detail&&routes.tools.includes(detail.dataset.officialTool)&&!document.querySelector('#bcDetail [data-seo-link]')){const a=document.createElement('a');a.href=seoToolHref(detail.dataset.officialTool);a.textContent=seoToolLabel();a.dataset.seoLink=detail.dataset.officialTool;detail.parentNode.append(a);}}
const observer=new MutationObserver(addLinks);for(const id of ['bcResults','bcDetail']){const el=document.getElementById(id);if(el)observer.observe(el,{childList:true,subtree:true});}addLinks();
const c=query.get('categoria');if(c&&routes.categories[c])window.futureRoute?.(c);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();

/* BUSCO: diseño de botones de todas las fichas */
(function () {
  const style = document.createElement("style");
  style.id = "busco-detail-buttons-final";
  style.textContent = `
    /* Eliminar el enlace redundante */
    #bcDetail .bc-detail-actions a[data-seo-link] {
      display: none !important;
    }

    /* Dos botones en una sola fila */
    #bcDetail .bc-detail-actions {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      align-items: center !important;
      gap: 8px !important;
      width: 100% !important;
    }

    /* VISITAR: largo, fino y degradado */
    #bcDetail .bc-detail-actions > a:not([data-seo-link]) {
      order: 1 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 1 1 75% !important;
      width: auto !important;
      min-width: 0 !important;
      height: 36px !important;
      min-height: 36px !important;
      padding: 0 10px !important;
      border-radius: 999px !important;
      background: linear-gradient(100deg,
        #00bfd6 0%,
        #b2ebf9 35%,
        #e72ba9 75%,
        #a5578d 100%) !important;
      color: #ffffff !important;
      font-size: 10px !important;
      font-weight: 700 !important;
      text-align: center !important;
      white-space: normal !important;
    }

    /* COMPARAR: compacto y a la derecha */
    #bcDetail .bc-detail-actions > button {
      order: 2 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 0 0 auto !important;
      width: auto !important;
      max-width: 48% !important;
      height: 36px !important;
      min-height: 36px !important;
      padding: 0 12px !important;
      border-radius: 999px !important;
      border: 1px solid #e72ba9 !important;
      background: #080d17 !important;
      color: #ffffff !important;
      font-size: 9px !important;
      font-weight: 700 !important;
      white-space: nowrap !important;
    }

    /* Alternativas: dos botones juntos */
    #bcDetail .bc-related .bc-related-actions {
      display: flex !important;
      flex-direction: row !important;
      gap: 5px !important;
    }

    #bcDetail .bc-related .bc-related-actions > :first-child {
      border-color: #18dfff !important;
    }

    #bcDetail .bc-related .bc-related-actions > :last-child {
      border-color: #ff2fb7 !important;
    }

    @media (max-width: 480px) {
      #bcDetail .bc-detail-actions {
        gap: 5px !important;
      }
      #bcDetail .bc-detail-actions > a:not([data-seo-link]) {
        font-size: 9px !important;
        padding: 0 6px !important;
      }
      #bcDetail .bc-detail-actions > button {
        font-size: 8px !important;
        padding: 0 7px !important;
      }
    }
  `;
  (document.head || document.documentElement).appendChild(style);
})();
