
const $=id=>document.getElementById(id);
let analysis=null;
function parisDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
$("planningDate").value=parisDate();

$("planningImage").addEventListener("change",()=>{
  const file=$("planningImage").files[0];
  if(!file)return;
  $("preview").src=URL.createObjectURL(file);
  $("preview").hidden=false;
});

function message(text,error=false){$("message").textContent=text;$("message").classList.toggle("error",error)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;")}

function activityOptions(current){
  const options=["circulation","atelier","transfert","prise_service","conduite_qub","conduite_breizhgo","conduite_lecoeur","hlp","occasionnel","coupure","repos","conge","at","maladie","fin_service"];
  return options.map(v=>`<option value="${v}" ${v===current?"selected":""}>${v}</option>`).join("");
}

function render(){
  const rows=analysis?.items||[];
  $("detectedCount").textContent=rows.length;
  $("resultTable").innerHTML=rows.map((item,index)=>`
    <div class="result-row" data-index="${index}">
      <input class="entity wide" value="${esc(item.entity_name||item.ocelorn_number||"")}" placeholder="Conducteur / parc / véhicule">
      <input class="registration" value="${esc(item.registration||"")}" placeholder="Immatriculation">
      <input class="start" type="time" value="${esc(item.start_time||"")}">
      <input class="end" type="time" value="${esc(item.end_time||"")}">
      <select class="type">${activityOptions(item.activity_type||"circulation")}</select>
      <input class="label wide" value="${esc(item.activity_label||item.details||"")}" placeholder="Détail">
      <button class="remove" type="button">×</button>
    </div>`).join("");
  $("resultSection").hidden=false;
}

$("resultTable").addEventListener("click",event=>{
  if(!event.target.classList.contains("remove"))return;
  const index=Number(event.target.closest(".result-row").dataset.index);
  analysis.items.splice(index,1);render();
});

$("analyzeButton").addEventListener("click",async()=>{
  const file=$("planningImage").files[0];
  if(!file)return message("Choisis d’abord une capture.",true);
  const form=new FormData();
  form.append("image",file);
  form.append("type",$("planningType").value);
  form.append("date",$("planningDate").value);
  $("analyzeButton").disabled=true;message("Analyse de la capture en cours…");
  try{
    const response=await fetch("/api/planning/analyze",{method:"POST",body:form});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error||"Analyse impossible.");
    analysis=payload;
    if(payload.date)$("planningDate").value=payload.date;
    render();message(`${payload.items.length} élément(s) détecté(s). Vérifie les données avant validation.`);
  }catch(e){message(e.message,true)}
  finally{$("analyzeButton").disabled=false}
});

function collect(){
  return [...document.querySelectorAll(".result-row")].map((row,index)=>{
    const original=analysis.items[index]||{};
    return {
      ...original,
      entity_name:row.querySelector(".entity").value,
      registration:row.querySelector(".registration").value,
      ocelorn_number:original.ocelorn_number||($("planningType").value==="vehicle"?row.querySelector(".entity").value:""),
      start_time:row.querySelector(".start").value,
      end_time:row.querySelector(".end").value,
      activity_type:row.querySelector(".type").value,
      activity_label:row.querySelector(".label").value
    };
  });
}

$("saveButton").addEventListener("click",async()=>{
  const file=$("planningImage").files[0];
  const body={type:$("planningType").value,date:$("planningDate").value,source_name:file?.name||"",items:collect()};
  $("saveButton").disabled=true;
  try{
    const response=await fetch("/api/planning/imports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error||"Enregistrement impossible.");
    message(`${payload.saved} élément(s) enregistrés pour le ${payload.date}.`);
    setTimeout(()=>location.href=body.type==="driver"?"./planning-conducteurs.html":body.type==="workshop"?"./atelier.html":"./stationnement.html",700);
  }catch(e){message(e.message,true)}
  finally{$("saveButton").disabled=false}
});
$("cancelButton").addEventListener("click",()=>{$("resultSection").hidden=true;analysis=null});
