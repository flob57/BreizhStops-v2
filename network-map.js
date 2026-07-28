(() => {
  const DB_NAME = "breizhstops-network-routes";
  const STORE = "routes";
  const DB_VERSION = 2;
  let dbPromise;
  let routeLayerGroup;
  let routeRecords = [];
  let stopDisplayMode = "all";

  const $n = id => document.getElementById(id);
  const esc = text => String(text || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const normalize = text => String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
  const putLocalRoute = route => storeAction("readwrite", s => { s.put(route); });
  const deleteLocalRoute = id => storeAction("readwrite", s => { s.delete(id); });
  const clearLocalRoutes = () => storeAction("readwrite", s => { s.clear(); });

  async function fetchRemoteRoutes() {
    const response = await fetch("/api/my-maps/routes", { cache: "no-store" });
    if (!response.ok) throw new Error(`Stockage partagé indisponible (${response.status})`);
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  }

  async function saveRemoteRoute(route) {
    const response = await fetch("/api/my-maps/routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(route)
    });
    if (!response.ok) {
      let message = `Enregistrement partagé impossible (${response.status})`;
      try { message = (await response.json()).error || message; } catch {}
      throw new Error(message);
    }
  }

  async function deleteRemoteRoute(id) {
    const response = await fetch(`/api/my-maps/routes/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`Suppression partagée impossible (${response.status})`);
  }

  async function putRoute(route, options = {}) {
    await putLocalRoute(route);
    if (options.localOnly) return;
    try { await saveRemoteRoute(route); }
    catch (error) { console.warn("Sauvegarde D1 My Maps impossible, copie locale conservée", error); }
  }

  async function deleteRoute(id) {
    await deleteLocalRoute(id);
    try { await deleteRemoteRoute(id); }
    catch (error) { console.warn("Suppression D1 My Maps impossible", error); }
  }

  async function clearRoutes() {
    const ids = routeRecords.map(route => route.id);
    await clearLocalRoutes();
    await Promise.allSettled(ids.map(deleteRemoteRoute));
  }

  async function loadSharedRoutes() {
    const local = (await getAllRoutes()).map(enrichRoute);
    try {
      const remote = (await fetchRemoteRoutes()).map(enrichRoute);
      const remoteById = new Map(remote.map(route => [route.id, route]));
      const localById = new Map(local.map(route => [route.id, route]));

      // Migration automatique : les anciens itinéraires du PC sont envoyés une seule fois dans D1.
      for (const route of local) {
        if (!remoteById.has(route.id)) {
          try { await saveRemoteRoute(route); remoteById.set(route.id, route); }
          catch (error) { console.warn("Migration d'un itinéraire local impossible", route.name, error); }
        }
      }

      const merged = [...remoteById.values()].map(route => ({
        ...route,
        // Le choix affiché/masqué reste propre à chaque appareil.
        visible: localById.has(route.id) ? localById.get(route.id).visible !== false : route.visible !== false
      }));
      await Promise.all(merged.map(route => putLocalRoute(route)));
      return merged;
    } catch (error) {
      console.warn("Chargement partagé impossible, utilisation du cache local", error);
      return local;
    }
  }

  function hashText(text) { let h = 2166136261; for (let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);} return (h>>>0).toString(16); }
  function colorFromName(name) { const p=["#0066cc","#d62828","#2a9d8f","#8a2be2","#f77f00","#008000","#c2185b","#455a64"]; let n=0; for(const c of name)n=(n*31+c.charCodeAt(0))>>>0; return p[n%p.length]; }
  function parseCoordinates(text) { return String(text||"").trim().split(/\s+/).map(x=>{const [lon,lat]=x.split(",").map(Number); return Number.isFinite(lat)&&Number.isFinite(lon)?[lat,lon]:null;}).filter(Boolean); }
  function collectLineStrings(node, out=[]) { for(const child of node.children||[]){ if(child.localName==="LineString"){const c=[...child.children].find(x=>x.localName==="coordinates")?.textContent; const pts=parseCoordinates(c); if(pts.length>=2)out.push(pts);} else collectLineStrings(child,out);} return out; }
  function getDirectText(node, localName) { return [...(node?.children||[])].find(x=>x.localName===localName)?.textContent?.trim() || ""; }

  function parseRouteIdentity(name) {
    const raw = String(name || "").trim();
    const parts = raw.split(/\s*[-–—]\s*/).filter(Boolean);
    let network = "Autre";
    let line = "";
    let direction = "";
    if (parts.length >= 2 && /^[A-ZÀ-Ü][A-ZÀ-Ü0-9 ]{1,14}$/i.test(parts[0])) {
      network = parts.shift().trim();
    }
    const first = parts[0] || raw;
    const match = first.match(/\b(?:L(?:IGNE)?\s*)?([A-Z]?\d{1,4}[A-Z]?)\b/i);
    line = match ? match[1].replace(/^0+(?=\d)/, "") : first.trim();
    direction = parts.slice(match ? 1 : 0).join(" → ").trim();
    return { network, line, direction };
  }

  function enrichRoute(route) {
    const parsed = parseRouteIdentity(route.name);
    return {
      ...route,
      network: route.network || parsed.network,
      line: route.line || parsed.line,
      direction: route.direction || parsed.direction
    };
  }

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

  function isLeafletMap(value) { return Boolean(value && typeof value.addLayer === "function" && typeof value.removeLayer === "function" && typeof value.fitBounds === "function"); }
  function getMainMap() {
    if (isLeafletMap(window.breizhStopsMap)) return window.breizhStopsMap;
    try { if (typeof map !== "undefined" && isLeafletMap(map)) return map; } catch {}
    return null;
  }
  function ensureLayer(){ const mainMap=getMainMap(); if(!mainMap||!window.L)return false; if(!routeLayerGroup)routeLayerGroup=L.layerGroup().addTo(mainMap); return true; }

  function visibleRoutes() { return routeRecords.filter(r => r.visible !== false && r.segments?.length); }
  function drawRoutes(){
    if(!ensureLayer())return;
    routeLayerGroup.clearLayers();
    if($n("showAllKml")?.checked===false)return;
    visibleRoutes().forEach(route=>route.segments.forEach(points=>L.polyline(points,{color:route.color,weight:5,opacity:.82}).bindPopup(`<strong>${esc(route.name)}</strong><br><small>${esc(route.network || "")} ${route.line ? `· ligne ${esc(route.line)}` : ""}</small>`).addTo(routeLayerGroup)));
    updateFloatingPanel();
  }
  function routeBounds(route){const pts=(route.segments||[]).flat(); return pts.length?L.latLngBounds(pts):null;}
  function dateLabel(value){if(!value)return "Jamais"; try{return new Intl.DateTimeFormat("fr-FR",{dateStyle:"short",timeStyle:"short"}).format(new Date(value));}catch{return value;}}

  function filteredRoutes() {
    const network = $n("myMapsNetworkFilter")?.value || "";
    const line = normalize($n("myMapsLineSearch")?.value || "");
    return routeRecords.filter(route => (!network || route.network === network) && (!line || normalize(`${route.line} ${route.name} ${route.direction}`).includes(line)));
  }

  function renderLibraryFilters() {
    const host = $n("routesLibrary");
    if (!host) return;
    const networks = [...new Set(routeRecords.map(r => r.network || "Autre"))].sort((a,b)=>a.localeCompare(b,"fr"));
    host.innerHTML = `
      <section class="unified-routes-toolbar">
        <label>Réseau<select id="myMapsNetworkFilter"><option value="">Tous les réseaux</option>${networks.map(n=>`<option>${esc(n)}</option>`).join("")}</select></label>
        <label>Ligne ou direction<input id="myMapsLineSearch" type="search" placeholder="Ex. 12, Briec, Quimper"></label>
        <label>Arrêts affichés<select id="routeStopsMode"><option value="all">Tous les arrêts BreizhStops</option><option value="lines">Uniquement les arrêts des lignes affichées</option></select></label>
        <button type="button" id="openMyMapsImport" class="secondary">➕ Importer / synchroniser</button>
      </section>
      <div class="routes-selection-summary"><strong id="visibleRoutesCount">0</strong> ligne(s) affichée(s) sur la carte</div>
      <div id="unifiedMyMapsList" class="kml-routes-list"></div>
      <details class="saved-routes-section"><summary>Itinéraires créés dans BreizhStops</summary><div id="savedBreizhRoutes"><p>Chargement…</p></div></details>`;
    $n("routeStopsMode").value = stopDisplayMode;
    $n("myMapsNetworkFilter").addEventListener("change", renderUnifiedList);
    $n("myMapsLineSearch").addEventListener("input", renderUnifiedList);
    $n("routeStopsMode").addEventListener("change", e => { stopDisplayMode=e.target.value; applyStopMode(); updateFloatingPanel(); });
    $n("openMyMapsImport").addEventListener("click", () => $n("kmlLibraryDialog")?.showModal());
    loadSavedBreizhRoutes();
    renderUnifiedList();
  }

  function renderUnifiedList() {
    const list=$n("unifiedMyMapsList"); if(!list)return;
    const routes=filteredRoutes().sort((a,b)=>(`${a.network} ${a.line} ${a.name}`).localeCompare(`${b.network} ${b.line} ${b.name}`,"fr"));
    $n("visibleRoutesCount").textContent = visibleRoutes().length;
    if(!routes.length){list.innerHTML='<p class="empty">Aucun itinéraire My Maps correspondant.</p>';return;}
    list.innerHTML=routes.map(route=>`
      <article class="kml-route-row" data-id="${esc(route.id)}">
        <label class="kml-route-main"><input class="kml-route-visible" type="checkbox" ${route.visible!==false?"checked":""}><span class="kml-route-swatch" style="background:${esc(route.color)}"></span><span class="kml-route-text"><strong title="${esc(route.name)}">${esc(route.name)}</strong><small>${esc(route.network)}${route.line ? ` · ligne ${esc(route.line)}` : ""}${route.direction ? ` · ${esc(route.direction)}` : ""} · synchro ${esc(dateLabel(route.syncedAt))}</small></span></label>
        <div class="kml-route-actions"><button type="button" class="secondary kml-zoom">Voir</button>${route.networkUrl?'<button type="button" class="secondary kml-sync">Synchroniser</button>':''}</div>
      </article>`).join("");
  }

  async function loadSavedBreizhRoutes() {
    const host=$n("savedBreizhRoutes"); if(!host)return;
    try {
      const response=await fetch("/api/public/routes",{headers:{}});
      if(!response.ok)throw new Error(`Erreur ${response.status}`);
      const routes=await response.json();
      host.innerHTML=routes.length?routes.map(route=>`<article class="library-item"><h3>${esc(route.name)}</h3><div class="meta">${esc(route.network||"")} · ${((route.distance||0)/1000).toFixed(1)} km</div><button type="button" onclick="loadSavedRoute('${esc(route.id)}')">Ouvrir</button></article>`).join(""):'<p>Aucun itinéraire créé dans BreizhStops.</p>';
    } catch(error) { host.innerHTML=`<p>Impossible de charger ces itinéraires.<br><small>${esc(error.message)}</small></p>`; }
  }

  function renderList(){
    const list=$n("kmlRoutesList"); if(!list)return;
    if(!routeRecords.length){list.innerHTML='<p class="empty">Aucun itinéraire My Maps enregistré.</p>';return;}
    list.innerHTML=routeRecords.slice().sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(route=>`
      <article class="kml-route-row" data-id="${esc(route.id)}">
        <label class="kml-route-main"><input class="kml-route-visible" type="checkbox" ${route.visible!==false?"checked":""}><span class="kml-route-swatch" style="background:${esc(route.color)}"></span><span class="kml-route-text"><strong title="${esc(route.name)}">${esc(route.name)}</strong><small>${esc(route.network)} ${route.line?`· ligne ${esc(route.line)}`:""} · ${route.segments?.length||0} tracé(s)</small></span></label>
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
    Object.assign(route,enrichRoute(route),{segments:allSegments,syncedAt:new Date().toISOString(),syncError:"",sourceName:"Google My Maps"});
    await putRoute(route); if(!silent){routeRecords=(await getAllRoutes()).map(enrichRoute);renderList();renderUnifiedList();drawRoutes();applyStopMode();} return true;
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
            const name=link.name||parsed.docName; const id=`mymaps-${hashText(link.href)}`; const existing=routeRecords.find(r=>r.id===id);
            const route=enrichRoute({...(existing||{}),id,name,sourceName:file.name,networkUrl:link.href,color:existing?.color||colorFromName(name),visible:existing?.visible!==false,segments:existing?.segments||[],importedAt:existing?.importedAt||new Date().toISOString()});
            await putRoute(route); links++; try{await syncRoute(route,true);}catch(error){route.syncError=error.message;await putRoute(route);}
          }
        } else {
          for(const item of parsed.routes){const id=`kml-${hashText(file.name+"|"+item.name+"|"+JSON.stringify(item.segments))}`; await putRoute(enrichRoute({id,name:item.name,sourceName:file.name,segments:item.segments,color:colorFromName(item.name),visible:true,importedAt:new Date().toISOString(),syncedAt:new Date().toISOString()}));locals++;}
        }
      }catch(error){console.error(file.name,error);failed++;}
    }
    routeRecords=(await getAllRoutes()).map(enrichRoute);renderList();renderUnifiedList();drawRoutes();applyStopMode(); status.textContent=`${all.length} fichier(s) traité(s) · ${links} lien(s) My Maps ajouté(s) · ${locals} tracé(s) local(aux) · ${failed} échec(s).`;
  }

  async function syncAll(){
    const status=$n("kmlImportStatus"); const targets=routeRecords.filter(r=>r.networkUrl); if(!targets.length){status.textContent="Aucun lien My Maps à synchroniser.";return;}
    let ok=0,failed=0;
    for(let i=0;i<targets.length;i++){status.textContent=`Synchronisation ${i+1}/${targets.length} : ${targets[i].name}`;try{await syncRoute(targets[i],true);ok++;}catch(error){targets[i].syncError=error.message;await putRoute(targets[i]);failed++;}}
    routeRecords=(await getAllRoutes()).map(enrichRoute);renderList();renderUnifiedList();drawRoutes();applyStopMode();status.textContent=`Synchronisation terminée : ${ok} itinéraire(s) mis à jour, ${failed} échec(s).`;
  }

  function fitAllVisible(){const pts=[];visibleRoutes().forEach(r=>(r.segments||[]).flat().forEach(p=>pts.push(p)));const mainMap=getMainMap();if(pts.length&&mainMap)mainMap.fitBounds(pts,{padding:[35,35]});}

  function buildRouteSampleGrid(routes) {
    const cell=.0015, grid=new Map();
    const add=(lat,lon)=>{const key=`${Math.floor(lat/cell)}:${Math.floor(lon/cell)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push([lat,lon]);};
    routes.forEach(route => (route.segments||[]).forEach(points => {
      for(let i=1;i<points.length;i++){
        const [aLat,aLon]=points[i-1], [bLat,bLon]=points[i];
        const steps=Math.max(1,Math.ceil(Math.max(Math.abs(bLat-aLat),Math.abs(bLon-aLon))/0.0007));
        for(let j=0;j<=steps;j++){const t=j/steps;add(aLat+(bLat-aLat)*t,aLon+(bLon-aLon)*t);}
      }
    }));
    return {cell,grid};
  }
  function stopsNearVisibleRoutes() {
    const api=window.BreizhStopsMapApi, routes=visibleRoutes(); if(!api||!routes.length)return [];
    const {cell,grid}=buildRouteSampleGrid(routes), maxLat=.00135;
    return api.getStops().filter(stop=>{
      const lat=Number(stop.lat),lon=Number(stop.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return false;
      const x=Math.floor(lat/cell),y=Math.floor(lon/cell);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const p of grid.get(`${x+dx}:${y+dy}`)||[]){
        const dLat=lat-p[0],dLon=(lon-p[1])*Math.cos(lat*Math.PI/180); if(Math.hypot(dLat,dLon)<=maxLat)return true;
      }
      return false;
    });
  }
  function applyStopMode() {
    const api=window.BreizhStopsMapApi;if(!api)return;
    if(stopDisplayMode==="lines" && visibleRoutes().length) api.showStops(stopsNearVisibleRoutes(),false);
    else api.showAllStops();
  }

  function ensureFloatingPanel() {
    if($n("visibleLinesPanel"))return;
    const panel=document.createElement("section"); panel.id="visibleLinesPanel"; panel.className="visible-lines-panel";
    panel.innerHTML='<div class="visible-lines-title">🚌 Lignes affichées <button type="button" id="toggleVisibleLines">−</button></div><div id="visibleLinesBody"></div>';
    $n("map")?.appendChild(panel);
    $n("toggleVisibleLines")?.addEventListener("click",()=>panel.classList.toggle("collapsed"));
  }
  function updateFloatingPanel() {
    ensureFloatingPanel(); const body=$n("visibleLinesBody");if(!body)return; const routes=visibleRoutes();
    body.innerHTML=routes.length?`<div class="visible-line-chips">${routes.map(r=>`<span style="--route-color:${esc(r.color)}">${esc(r.network)} ${esc(r.line||r.name)}</span>`).join("")}</div><label><select id="floatingStopsMode"><option value="all">Tous les arrêts</option><option value="lines">Arrêts des lignes</option></select></label><button type="button" id="hideAllVisibleRoutes" class="secondary">Masquer toutes les lignes</button>`:'<p>Aucune ligne affichée.</p>';
    const select=$n("floatingStopsMode");if(select){select.value=stopDisplayMode;select.addEventListener("change",e=>{stopDisplayMode=e.target.value;applyStopMode();const other=$n("routeStopsMode");if(other)other.value=stopDisplayMode;});}
    $n("hideAllVisibleRoutes")?.addEventListener("click",async()=>{for(const r of routeRecords){r.visible=false;await putRoute(r);}renderList();renderUnifiedList();drawRoutes();applyStopMode();});
  }

  async function handleRouteListClick(e, dialog) {
    const row=e.target.closest(".kml-route-row");if(!row)return;const route=routeRecords.find(r=>r.id===row.dataset.id);if(!route)return;
    if(e.target.closest(".kml-delete")){await deleteRoute(route.id);routeRecords=routeRecords.filter(r=>r.id!==route.id);renderList();renderUnifiedList();drawRoutes();applyStopMode();}
    else if(e.target.closest(".kml-zoom")){const b=routeBounds(route);const mainMap=getMainMap();if(b&&mainMap)mainMap.fitBounds(b,{padding:[30,30]});dialog?.close();}
    else if(e.target.closest(".kml-sync")){const status=$n("kmlImportStatus");if(status)status.textContent=`Synchronisation : ${route.name}`;try{await syncRoute(route);if(status)status.textContent=`${route.name} a été mis à jour.`;}catch(error){if(status)status.textContent=`Échec : ${error.message}`;}}
  }
  async function handleRouteVisibility(e) {
    if(!e.target.classList.contains("kml-route-visible"))return;const row=e.target.closest(".kml-route-row"),route=routeRecords.find(r=>r.id===row.dataset.id);if(!route)return;route.visible=e.target.checked;await putRoute(route);renderList();renderUnifiedList();drawRoutes();applyStopMode();
  }

  async function init(){
    const dialog=$n("kmlLibraryDialog");if(!dialog)return;
    routeRecords=await loadSharedRoutes();
    $n("openKmlLibrary")?.addEventListener("click",()=>{renderList();dialog.showModal?.()||dialog.setAttribute("open","");});
    window.openUnifiedRoutesLibrary=()=>{renderLibraryFilters();$n("routesLibraryDialog")?.showModal();};
    ensureLayer();renderList();drawRoutes();updateFloatingPanel();
    const sharedStatus=$n("kmlImportStatus");
    if(sharedStatus && routeRecords.length) sharedStatus.textContent=`${routeRecords.length} itinéraire(s) chargé(s) depuis le stockage partagé. Ils sont disponibles sur PC et smartphone.`;
    const input=$n("kmlFiles"),zone=$n("kmlDropZone");zone.addEventListener("click",()=>input.click());zone.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" ")input.click();});["dragenter","dragover"].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.add("dragging");}));["dragleave","drop"].forEach(t=>zone.addEventListener(t,e=>{e.preventDefault();zone.classList.remove("dragging");}));zone.addEventListener("drop",e=>importFiles(e.dataTransfer.files));input.addEventListener("change",()=>{importFiles(input.files);input.value="";});
    $n("showAllKml")?.addEventListener("change",drawRoutes);$n("syncAllKml")?.addEventListener("click",()=>syncAll().catch(e=>$n("kmlImportStatus").textContent=e.message));$n("fitKmlRoutes")?.addEventListener("click",fitAllVisible);
    $n("deleteAllKml")?.addEventListener("click",async()=>{if(!confirm("Supprimer tous les itinéraires enregistrés ?"))return;await clearRoutes();routeRecords=[];renderList();renderUnifiedList();drawRoutes();applyStopMode();});
    $n("kmlRoutesList")?.addEventListener("click",e=>handleRouteListClick(e,dialog));$n("kmlRoutesList")?.addEventListener("change",handleRouteVisibility);
    $n("routesLibrary")?.addEventListener("click",e=>handleRouteListClick(e,$n("routesLibraryDialog")));$n("routesLibrary")?.addEventListener("change",handleRouteVisibility);
  }

  const start=()=>init().catch(error=>{console.error("Initialisation My Maps impossible",error);const status=$n("kmlImportStatus");if(status)status.textContent=`Initialisation impossible : ${error.message}`;});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start,{once:true});else start();
  const layerTimer=setInterval(()=>{if(ensureLayer()){clearInterval(layerTimer);drawRoutes();}},100);setTimeout(()=>clearInterval(layerTimer),15000);
})();
