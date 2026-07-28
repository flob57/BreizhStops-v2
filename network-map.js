(() => {
  const DB_NAME = "breizhstops-network-routes";
  const STORE = "routes";
  const DB_VERSION = 2;
  let dbPromise;
  let routeLayerGroup;
  let routeRecords = [];

  const $n = id => document.getElementById(id);
  const esc = text => String(text || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function storeAction(mode, action) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode); const result = action(tx.objectStore(STORE));
      if (result) { result.onsuccess = () => resolve(result.result); result.onerror = () => reject(result.error); }
      else { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }
    });
  }
  const getAllRoutes = () => storeAction("readonly", s => s.getAll()).then(x => x || []);
  const putRoute = route => storeAction("readwrite", s => { s.put(route); });
  const deleteRoute = id => storeAction("readwrite", s => { s.delete(id); });
  const clearRoutes = () => storeAction("readwrite", s => { s.clear(); });

  function hashText(text) { let h = 2166136261; for (let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);} return (h>>>0).toString(16); }
  function colorFromName(name) { const p=["#0066cc","#d62828","#2a9d8f","#8a2be2","#f77f00","#008000","#c2185b","#455a64"]; let n=0; for(const c of name)n=(n*31+c.charCodeAt(0))>>>0; return p[n%p.length]; }
  function parseCoordinates(text) { return String(text||"").trim().split(/\s+/).map(x=>{const [lon,lat]=x.split(",").map(Number); return Number.isFinite(lat)&&Number.isFinite(lon)?[lat,lon]:null;}).filter(Boolean); }
  function collectLineStrings(node, out=[]) { for(const child of node.children||[]){ if(child.localName==="LineString"){const c=[...child.children].find(x=>x.localName==="coordinates")?.textContent; const pts=parseCoordinates(c); if(pts.length>=2)out.push(pts);} else collectLineStrings(child,out);} return out; }
  function getDirectText(node, localName) { return [...(node?.children||[])].find(x=>x.localName===localName)?.textContent?.trim() || ""; }

  function parseKmlDocument(kmlText, fallbackName) {
    const xml = new DOMParser().parseFromString(kmlText, "application/xml");
    if (xml.querySelector("parsererror")) throw new Error("KML invalide");
    const docName = getDirectText(xml.getElementsByTagNameNS("*","Document")[0], "name") || fallbackName;
    const links = [...xml.getElementsByTagNameNS("*", "NetworkLink")].map(link => {
      const href = [...link.getElementsByTagNameNS("*", "href")][0]?.textContent?.trim();
      return href ? { name: getDirectText(link,"name") || docName, href } : null;
    }).filter(Boolean);
    const routes = [];
    [...xml.getElementsByTagNameNS("*", "Placemark")].forEach((pm,index)=>{
      const segments=collectLineStrings(pm); if(!segments.length)return;
      const name=getDirectText(pm,"name") || `${docName} ${index+1}`;
      routes.push({ name, segments });
    });
    return { docName, links, routes };
  }

  async function decodeKmlResponse(response) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes[0]===0x50 && bytes[1]===0x4b) {
      const entries=fflate.unzipSync(bytes); const name=Object.keys(entries).find(x=>x.toLowerCase().endsWith(".kml"));
      if(!name)throw new Error("Le fichier KMZ ne contient aucun KML.");
      return new TextDecoder("utf-8").decode(entries[name]);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
  async function textFromFile(file) {
    if(file.name.toLowerCase().endsWith(".kmz")){ const bytes=new Uint8Array(await file.arrayBuffer()); const entries=fflate.unzipSync(bytes); const n=Object.keys(entries).find(x=>x.toLowerCase().endsWith(".kml")); if(!n)throw new Error("Aucun KML dans le KMZ"); return new TextDecoder("utf-8").decode(entries[n]); }
    return file.text();
  }

  function getMainMap() {
    // app.js déclare `let map` dans un script classique : la variable est globale,
    // mais elle n'est pas forcément exposée dans window.map.
    try { return typeof map !== "undefined" ? map : window.map; }
    catch { return window.map; }
  }
  function ensureLayer(){
    const mainMap = getMainMap();
    if(!mainMap || !window.L) return false;
    if(!routeLayerGroup) routeLayerGroup=L.layerGroup().addTo(mainMap);
    return true;
  }
  function drawRoutes(){ if(!ensureLayer())return; routeLayerGroup.clearLayers(); if($n("showAllKml")?.checked===false)return; routeRecords.filter(r=>r.visible!==false&&r.segments?.length).forEach(route=>route.segments.forEach(points=>L.polyline(points,{color:route.color,weight:5,opacity:.82}).bindPopup(`<strong>${esc(route.name)}</strong><br><small>${esc(route.sourceName||"Google My Maps")}</small>`).addTo(routeLayerGroup))); }
  function routeBounds(route){const pts=(route.segments||[]).flat(); return pts.length?L.latLngBounds(pts):null;}
  function dateLabel(value){if(!value)return "Jamais"; try{return new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value));}catch{return value;}}

  function renderList(){
    const list=$n("kmlRoutesList"); if(!list)return;
    if(!routeRecords.length){list.innerHTML='<p class="empty">Aucun itinéraire My Maps enregistré.</p>';return;}
    list.innerHTML=routeRecords.slice().sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(route=>`
      <article class="kml-route-row" data-id="${esc(route.id)}">
        <label class="kml-route-main"><input class="kml-route-visible" type="checkbox" ${route.visible!==false?"checked":""}><span class="kml-route-swatch" style="background:${esc(route.color)}"></span><span><strong>${esc(route.name)}</strong><small>${route.networkUrl?"My Maps synchronisé":"KML local"} · ${route.segments?.length||0} tracé(s) · ${esc(dateLabel(route.syncedAt))}</small></span></label>
        <div class="kml-route-actions">${route.networkUrl?'<button type="button" class="secondary kml-sync">Synchroniser</button>':''}<button type="button" class="secondary kml-zoom">Voir</button><button type="button" class="danger kml-delete">Supprimer</button></div>
      </article>`).join("");
  }

  async function syncRoute(route, silent=false){
    if(!route.networkUrl)return false;
    const response=await fetch(`/api/my-maps/sync?url=${encodeURIComponent(route.networkUrl)}`,{cache:"no-store"});
    if(!response.ok){ let msg=`Erreur ${response.status}`; try{const j=await response.json();msg=j.error||msg;}catch{} throw new Error(msg); }
    const text=await decodeKmlResponse(response); const parsed=parseKmlDocument(text,route.name);
    const allSegments=parsed.routes.flatMap(r=>r.segments);
    if(!allSegments.length)throw new Error("Aucun tracé de ligne trouvé. Vérifie que la carte est accessible et contient un itinéraire.");
    route.segments=allSegments; route.syncedAt=new Date().toISOString(); route.syncError=""; route.sourceName="Google My Maps";
    await putRoute(route); if(!silent){routeRecords=await getAllRoutes();renderList();drawRoutes();} return true;
  }

  async function importFiles(files){
    const status=$n("kmlImportStatus"); const all=[...files].filter(f=>/\.(kml|kmz)$/i.test(f.name));
    if(!all.length){status.textContent="Aucun fichier KML ou KMZ sélectionné.";return;}
    let links=0,locals=0,failed=0;
    for(let i=0;i<all.length;i++){
      const file=all[i]; status.textContent=`Import ${i+1}/${all.length} : ${file.name}`;
      try{
        const parsed=parseKmlDocument(await textFromFile(file),file.name.replace(/\.(kml|kmz)$/i,""));
        if(parsed.links.length){
          for(const link of parsed.links){
            const name=link.name||parsed.docName; const id=`mymaps-${hashText(link.href)}`;
            const existing=routeRecords.find(r=>r.id===id);
            const route={...(existing||{}),id,name,sourceName:file.name,networkUrl:link.href,color:existing?.color||colorFromName(name),visible:existing?.visible!==false,segments:existing?.segments||[],importedAt:existing?.importedAt||new Date().toISOString()};
            await putRoute(route); links++;
            try{await syncRoute(route,true);}catch(error){route.syncError=error.message;await putRoute(route);}
          }
        } else {
          for(const item of parsed.routes){const id=`kml-${hashText(file.name+"|"+item.name+"|"+JSON.stringify(item.segments))}`; await putRoute({id,name:item.name,sourceName:file.name,segments:item.segments,color:colorFromName(item.name),visible:true,importedAt:new Date().toISOString(),syncedAt:new Date().toISOString()});locals++;}
        }
      }catch(error){console.error(file.name,error);failed++;}
    }
    routeRecords=await getAllRoutes();renderList();drawRoutes(); status.textContent=`${all.length} fichier(s) traité(s) · ${links} lien(s) My Maps ajouté(s) · ${locals} tracé(s) local(aux) · ${failed} échec(s).`;
  }

  async function syncAll(){
    const status=$n("kmlImportStatus"); const targets=routeRecords.filter(r=>r.networkUrl); if(!targets.length){status.textContent="Aucun lien My Maps à synchroniser.";return;}
    let ok=0,failed=0;
    for(let i=0;i<targets.length;i++){status.textContent=`Synchronisation ${i+1}/${targets.length} : ${targets[i].name}`;try{await syncRoute(targets[i],true);ok++;}catch(error){targets[i].syncError=error.message;await putRoute(targets[i]);failed++;}}
    routeRecords=await getAllRoutes();renderList();drawRoutes();status.textContent=`Synchronisation terminée : ${ok} itinéraire(s) mis à jour, ${failed} échec(s).`;
  }

  function fitAllVisible(){const pts=[];routeRecords.filter(r=>r.visible!==false).forEach(r=>(r.segments||[]).flat().forEach(p=>pts.push(p)));const mainMap=getMainMap();if(pts.length&&mainMap)mainMap.fitBounds(pts,{padding:[35,35]});}
  async function init(){
    const dialog=$n("kmlLibraryDialog");if(!dialog)return;
    routeRecords=await getAllRoutes();
    // Le bouton doit fonctionner même si Leaflet finit de s'initialiser après ce module.
    $n("openKmlLibrary")?.addEventListener("click",()=>{
      renderList();
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    });
    ensureLayer();renderList();drawRoutes();
    const input=$n("kmlFiles"),zone=$n("kmlDropZone");zone.addEventListener("click",()=>input.click());zone.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" ")input.click();});["dragenter","dragover"].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.add("dragging");}));["dragleave","drop"].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.remove("dragging");}));zone.addEventListener("drop",e=>importFiles(e.dataTransfer.files));input.addEventListener("change",()=>{importFiles(input.files);input.value="";});
    $n("showAllKml")?.addEventListener("change",drawRoutes);$n("syncAllKml")?.addEventListener("click",()=>syncAll().catch(e=>$n("kmlImportStatus").textContent=e.message));$n("fitKmlRoutes")?.addEventListener("click",fitAllVisible);
    $n("deleteAllKml")?.addEventListener("click",async()=>{if(!confirm("Supprimer tous les itinéraires enregistrés ?"))return;await clearRoutes();routeRecords=[];renderList();drawRoutes();});
    $n("kmlRoutesList")?.addEventListener("click",async e=>{const row=e.target.closest(".kml-route-row");if(!row)return;const route=routeRecords.find(r=>r.id===row.dataset.id);if(!route)return;if(e.target.closest(".kml-delete")){await deleteRoute(route.id);routeRecords=routeRecords.filter(r=>r.id!==route.id);renderList();drawRoutes();}else if(e.target.closest(".kml-zoom")){const b=routeBounds(route);const mainMap=getMainMap();if(b&&mainMap)mainMap.fitBounds(b,{padding:[30,30]});dialog.close();}else if(e.target.closest(".kml-sync")){const status=$n("kmlImportStatus");status.textContent=`Synchronisation : ${route.name}`;try{await syncRoute(route);status.textContent=`${route.name} a été mis à jour.`;}catch(error){status.textContent=`Échec : ${error.message}`;}}});
    $n("kmlRoutesList")?.addEventListener("change",async e=>{if(!e.target.classList.contains("kml-route-visible"))return;const row=e.target.closest(".kml-route-row"),route=routeRecords.find(r=>r.id===row.dataset.id);route.visible=e.target.checked;await putRoute(route);drawRoutes();});
  }
  // L'interface d'import est initialisée dès que le DOM est prêt. La couche Leaflet
  // se rattache ensuite à la carte dès que celle-ci existe.
  const start = () => init().catch(error => {
    console.error("Initialisation My Maps impossible", error);
    const status=$n("kmlImportStatus");
    if(status) status.textContent=`Initialisation impossible : ${error.message}`;
  });
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once:true});
  else start();
  const layerTimer=setInterval(()=>{
    if(ensureLayer()){
      clearInterval(layerTimer);
      drawRoutes();
    }
  },100);
  setTimeout(()=>clearInterval(layerTimer),15000);
})();
