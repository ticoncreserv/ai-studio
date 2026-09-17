export const PREVIEW_WAIT_ROOT = "atelier-preview-wait";

export function previewWaitStyle(): string {
  return `#${PREVIEW_WAIT_ROOT}{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,sans-serif}#${PREVIEW_WAIT_ROOT}[hidden]{display:none!important}#${PREVIEW_WAIT_ROOT} .aw-card{width:min(92vw,380px);padding:28px 24px;text-align:center}#${PREVIEW_WAIT_ROOT} .aw-spin{width:32px;height:32px;margin:0 auto 16px;border:2.5px solid #e2e8f0;border-top-color:#c40000;border-radius:999px;animation:atelier-wait-spin .7s linear infinite}#${PREVIEW_WAIT_ROOT} .aw-bar{height:3px;margin:18px 0 0;overflow:hidden;border-radius:999px;background:#e2e8f0}#${PREVIEW_WAIT_ROOT} .aw-bar>i{display:block;height:100%;width:40%;border-radius:999px;background:#c40000;animation:atelier-wait-bar 1.1s ease-in-out infinite}#${PREVIEW_WAIT_ROOT} .aw-title{margin:0;font-size:18px;font-weight:650;letter-spacing:-.03em}#${PREVIEW_WAIT_ROOT} .aw-hint{min-height:2.6em;margin:8px 0 0;font-size:13px;line-height:1.45;color:#64748b}#${PREVIEW_WAIT_ROOT} .aw-time{margin-top:10px;font-size:11px;font-family:ui-monospace,monospace;color:#94a3b8}@keyframes atelier-wait-spin{to{transform:rotate(360deg)}}@keyframes atelier-wait-bar{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}`;
}

export function previewWaitMarkup(): string {
  return `<div id="${PREVIEW_WAIT_ROOT}" data-phase="boot" role="status" aria-live="polite" aria-busy="true"><div class="aw-card"><div class="aw-spin" aria-hidden="true"></div><p class="aw-title" data-wait-title>Loading…</p><p class="aw-hint" data-wait-hint></p><p class="aw-time" data-wait-elapsed>0:00</p><div class="aw-bar" aria-hidden="true"><i></i></div></div></div>`;
}

export function previewWaitScript(): string {
  return `(function(){var root=document.getElementById(${JSON.stringify(PREVIEW_WAIT_ROOT)});if(!root||root.getAttribute("data-bound"))return;root.setAttribute("data-bound","1");var title=root.querySelector("[data-wait-title]");var hint=root.querySelector("[data-wait-hint]");var timer=root.querySelector("[data-wait-elapsed]");var pt=((document.documentElement.lang||"pt").toLowerCase().indexOf("pt")===0);var copy={boot:pt?"Carregando a tela…":"Loading the screen…",hydrate:pt?"Montando a interface…":"Mounting the interface…",nav:pt?"Abrindo a próxima tela…":"Opening the next screen…",slow:pt?"Isso pode levar alguns minutos.":"This can take a few minutes.",slower:pt?"Isso pode levar alguns minutos.":"This can take a few minutes."};var started=Date.now();var mode="boot";function ping(type,phase){try{parent.postMessage({type:type,phase:phase,source:"atelier-preview"},"*");}catch(e){}}function setText(phase){if(title)title.textContent=phase==="nav"?copy.nav:phase==="hydrate"?copy.hydrate:copy.boot;root.setAttribute("data-phase",phase);}function show(phase){mode=phase;started=Date.now();root.removeAttribute("hidden");root.setAttribute("aria-busy","true");if(hint)hint.textContent="";setText(phase);ping("atelier-preview-loading",phase);}function hide(){if(mode==="ready")return;mode="ready";root.setAttribute("hidden","");root.setAttribute("aria-busy","false");ping("atelier-preview-ready","ready");}function appReady(){var app=document.getElementById("app");return !!(app&&app.childElementCount>0);}function tick(){if(mode==="ready"||!timer)return;var s=Math.floor((Date.now()-started)/1000);timer.textContent=Math.floor(s/60)+":"+String(s%60).padStart(2,"0");if(hint){if(s>=12)hint.textContent=copy.slower;else if(s>=4)hint.textContent=copy.slow;}}setInterval(function(){tick();if(mode==="boot"&&appReady()){setText("hydrate");hide();}},250);document.addEventListener("inertia:start",function(){show("nav");});document.addEventListener("inertia:finish",hide);document.addEventListener("inertia:navigate",hide);window.addEventListener("pageshow",function(){if(mode==="ready"&&!appReady())show("boot");});show("boot");})();`;
}

export function injectPreviewWait(html: string): string {
  if (html.includes(PREVIEW_WAIT_ROOT)) return html;
  let next = html;
  if (/<head[^>]*>/i.test(next)) {
    next = next.replace(/<head[^>]*>/i, (open) => `${open}<style id="atelier-preview-wait-css">${previewWaitStyle()}</style>`);
  }
  if (/<body[^>]*>/i.test(next)) {
    next = next.replace(/<body[^>]*>/i, (open) => `${open}${previewWaitMarkup()}<script>${previewWaitScript()}</script>`);
  }
  return next;
}
