const $=id=>document.getElementById(id);
let state={data:null};
function fmt(m){m=Math.round(Number(m||0));return `${m<0?"−":""}${Math.floor(Math.abs(m)/60)}h${String(Math.abs(m)%60).padStart(2,"0")}`}
function fmtDate(iso){if(!iso)return"—";return new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Paris"}).format(new Date(iso))}
function dateOnly(iso){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(iso))}
async function api(url,o={}){const r=await fetch(url,{...o,headers:{"Content-Type":"application/json",...(o.headers||{})}}),t=await r.text();let p;try{p=t?JSON.parse(t):{}}catch{throw new Error(`Réponse illisible ${r.status}`)}if(!r.ok)throw new Error(p.error||`Erreur ${r.status}`);return p}
function isoWeekValue(date=new Date()){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));const y=new Date(Date.UTC(d.getUTCFullYear(),0,1));const w=Math.ceil((((d-y)/86400000)+1)/7);return `${d.getUTCFullYear()}-W${String(w).padStart(2,"0")}`}
function mondayFromWeek(value){const [y,w]=value.split("-W").map(Number);const jan4=new Date(Date.UTC(y,0,4));const monday=new Date(jan4);monday.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()||7)-1)+(w-1)*7);return monday.toISOString().slice(0,10)}
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function duration(row){return Math.max(0,Math.round((new Date(row.ended_at||Date.now())-new Date(row.started_at))/60000))}
function render(){
 const d=state.data,p=d.periods;
 $("statsDate").textContent=new Intl.DateTimeFormat("fr-FR",{dateStyle:"full"}).format(new Date(`${d.today}T12:00:00`));
 $("overtime").textContent=`${d.overtime_minutes>=0?"+":"−"}${fmt(Math.abs(d.overtime_minutes))}`;
 $("paidLeave").textContent=`${d.paid_leave.n1.toFixed(1)} j`;
 $("paidLeaveDetail").textContent=`N−1 : ${d.paid_leave.n1.toFixed(1)} · N : ${d.paid_leave.n.toFixed(1)}`;
 $("todayActivity").textContent=fmt(p.today.actual);$("todayDriving").textContent=`Conduite : ${fmt(p.today.driving)} · ${p.today.km} km`;
 const best=d.consumption[0];$("averageConsumption").textContent=best?`${best.l_per_100km.toFixed(2)} L/100 km`:"—";$("consumptionVehicle").textContent=best?best.vehicle:"Pas assez de pleins";
 $("weekTitle").textContent=`Semaine du ${d.week_start} au ${d.week_end}`;
 $("declarationsList").innerHTML=d.week_declarations.length?d.week_declarations.map(x=>`<div class="list-row"><div><strong>${x.work_date}</strong> · ${fmt(x.total_minutes)}<br><small>${esc(x.notes||"")}</small></div><button data-edit-declaration="${x.work_date}">✎ Modifier</button><button class="delete" data-delete-declaration="${x.id}">🗑</button></div>`).join(""):"<div class=list-row>Aucune heure déclarée.</div>";
 $("weekDeclaredTotal").textContent=`Total de la semaine : ${fmt(d.week_declarations.reduce((s,x)=>s+Number(x.total_minutes),0))}`;
 $("periodCards").innerHTML=[["Aujourd’hui",p.today],["Cette semaine",p.week],["Ce mois",p.month],["Cette année",p.year]].map(([l,x])=>{
   const percent=x.expected>0?Math.round((x.actual/x.expected)*100):(x.actual>0?100:0);
   const width=Math.min(percent,100);
   const cls=percent>100?"period-progress over":"period-progress";
   return `<article class=period-card>
     <span>${l}</span>
     <strong>${fmt(x.actual)}</strong>
     <div class="${cls}"><span style="width:${width}%"></span></div>
     <div class="progress-label"><span>${percent}% réalisé</span><span>${fmt(x.expected)} attendues</span></div>
     <small>Conduite ${fmt(x.driving)} · ${x.km} km</small>
   </article>`;
 }).join("");
 $("consumptionList").innerHTML=table(["Véhicule","Distance","Litres","Consommation"],d.consumption.map(x=>[x.vehicle,`${x.distance} km`,x.litres.toFixed(2),`${x.l_per_100km.toFixed(2)} L/100 km`]));
 $("fuelList").innerHTML=table(["Date","Véhicule","Km","Litres",""],d.fuel_fillups.map(x=>[fmtDate(x.filled_at),x.vehicle_registration,x.odometer_km,Number(x.litres).toFixed(2),actions("fuel",x.id)]));
 renderDaily();
 $("workSessions").innerHTML=table(["Début","Fin","Durée",""],d.work_sessions.map(x=>[fmtDate(x.started_at),fmtDate(x.ended_at),fmt(duration(x)),actions("work",x.id)]));
 $("drivingSessions").innerHTML=table(["Date","Véhicule","Début","Fin","Durée","Km début","Km fin","Distance",""],d.driving_sessions.map(x=>[dateOnly(x.started_at),x.vehicle_registration,fmtDate(x.started_at),fmtDate(x.ended_at),fmt(duration(x)),x.km_start,x.km_end??"—",x.km_end==null?"—":`${x.km_end-x.km_start} km`,actions("driving",x.id)]));
 const dist=d.distance_totals;$("distanceSummary").innerHTML=[["Aujourd’hui",dist.today],["Cette semaine",dist.week],["Ce mois",dist.month],["Cette année",dist.year],["Depuis toujours",dist.all]].map(([l,v])=>`<div><span>${l}</span><strong>${v} km</strong></div>`).join("");
}
function table(headers,rows){return `<table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join(""):`<tr><td colspan="${headers.length}">Aucune donnée.</td></tr>`}</tbody></table>`}
function actions(type,id){return `<div class=record-actions><button data-edit-record="${type}:${id}">✎</button><button class=delete data-delete-record="${type}:${id}">🗑</button></div>`}
function renderDaily(){const period=$("dailyPeriod").value,today=state.data.today;let start;if(period==="week")start=state.data.week_start;else if(period==="month")start=`${today.slice(0,7)}-01`;else start=`${today.slice(0,4)}-01-01`;const rows=state.data.daily.filter(x=>x.date>=start);$("dailyList").innerHTML=table(["Date","Travail réel","Attendu","Conduite","Conduite %","Distance"],rows.map(x=>[x.date,fmt(x.actual_minutes),fmt(x.expected_minutes),fmt(x.driving_minutes),x.actual_minutes?`${(x.driving_minutes/x.actual_minutes*100).toFixed(1)} %`:"0 %",`${x.km} km`]))}
async function load(){state.data=await api(`/api/timeclock/stats?week_start=${mondayFromWeek($("weekPicker").value)}`);render()}
async function openDeclaration(date=state.data.today){const p=await api(`/api/timeclock/declarations?date=${date}`),x=p.declaration||p.prefill||{};$("declareDate").value=date;$("morningStart").value=x.morning_start||"";$("morningEnd").value=x.morning_end||"";$("afternoonStart").value=x.afternoon_start||"";$("afternoonEnd").value=x.afternoon_end||"";$("declareNotes").value=x.notes||"";$("declareDialog").showModal()}
async function submitDeclaration(e){e.preventDefault();await api("/api/timeclock/declarations",{method:"POST",body:JSON.stringify({work_date:$("declareDate").value,morning_start:$("morningStart").value,morning_end:$("morningEnd").value,afternoon_start:$("afternoonStart").value,afternoon_end:$("afternoonEnd").value,notes:$("declareNotes").value})});$("declareDialog").close();await load()}
async function deleteRecord(type,id){if(!confirm("Supprimer cette donnée ?"))return;await api(`/api/timeclock/records/${type}/${id}`,{method:"DELETE"});await load()}

function localParts(iso){
  if(!iso) return {date:"",time:""};
  const d=new Date(iso);
  const parts=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Europe/Paris",
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23"
  }).formatToParts(d);
  const value=t=>parts.find(p=>p.type===t)?.value||"";
  return {date:`${value("year")}-${value("month")}-${value("day")}`,time:`${value("hour")}:${value("minute")}`};
}

function parisOffsetMinutes(date,time){
  const [y,m,d]=date.split("-").map(Number);
  const [hh,mm]=time.split(":").map(Number);
  const probe=new Date(Date.UTC(y,m-1,d,hh,mm,0));
  const local=new Intl.DateTimeFormat("en-CA",{
    timeZone:"Europe/Paris",
    year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
  }).formatToParts(probe);
  const value=t=>Number(local.find(p=>p.type===t)?.value||0);
  const represented=Date.UTC(
    value("year"),value("month")-1,value("day"),
    value("hour"),value("minute"),value("second")
  );
  return Math.round((represented-probe.getTime())/60000);
}

function localDateTimeToIso(date,time){
  if(!date||!time) return null;
  const [y,m,d]=date.split("-").map(Number);
  const [hh,mm]=time.split(":").map(Number);
  let utc=Date.UTC(y,m-1,d,hh,mm,0);
  let offset=parisOffsetMinutes(date,time);
  utc-=offset*60000;
  // Deuxième passage pour les jours de changement heure été/hiver.
  const correctedOffset=parisOffsetMinutes(
    new Intl.DateTimeFormat("en-CA",{
      timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(new Date(utc)),
    new Intl.DateTimeFormat("fr-FR",{
      timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).format(new Date(utc))
  );
  if(Number.isFinite(correctedOffset) && correctedOffset!==offset){
    utc=Date.UTC(y,m-1,d,hh,mm,0)-correctedOffset*60000;
  }
  return new Date(utc).toISOString();
}

function clockDuration(start,end){
  if(!start||!end)return "—";
  const [sh,sm]=start.split(":").map(Number);
  const [eh,em]=end.split(":").map(Number);
  let minutes=(eh*60+em)-(sh*60+sm);
  if(minutes<0) minutes+=1440;
  return fmt(minutes);
}

function updateRecordDuration(){
  $("recordWorkDuration").textContent=clockDuration(
    $("recordWorkStart").value,$("recordWorkEnd").value
  );
  $("recordDrivingDuration").textContent=clockDuration(
    $("recordDrivingStart").value,$("recordDrivingEnd").value
  );
}

function closeRecordDialog(){
  $("recordDialog").close();
}

async function editRecord(type,id){
  const list=
    type==="work"?state.data.work_sessions:
    type==="driving"?state.data.driving_sessions:
    state.data.fuel_fillups;
  const x=list.find(r=>r.id===id);
  if(!x)return;

  $("recordType").value=type;
  $("recordId").value=id;
  $("recordWorkFields").hidden=type!=="work";
  $("recordDrivingFields").hidden=type!=="driving";
  $("recordFuelFields").hidden=type!=="fuel";

  if(type==="work"){
    $("recordDialogTitle").textContent="Modifier la session de travail";
    const start=localParts(x.started_at);
    const end=localParts(x.ended_at);
    $("recordWorkDate").value=start.date;
    $("recordWorkStart").value=start.time;
    $("recordWorkEnd").value=end.time;
    $("recordWorkNotes").value=x.notes||"";
  }

  if(type==="driving"){
    $("recordDialogTitle").textContent="Modifier la session de conduite";
    const start=localParts(x.started_at);
    const end=localParts(x.ended_at);
    $("recordDrivingDate").value=start.date;
    $("recordDrivingStart").value=start.time;
    $("recordDrivingEnd").value=end.time;
    $("recordDrivingVehicle").value=x.vehicle_registration||"";
    $("recordDrivingKmStart").value=x.km_start??"";
    $("recordDrivingKmEnd").value=x.km_end??"";
    $("recordDrivingNotes").value=x.notes||"";
  }

  if(type==="fuel"){
    $("recordDialogTitle").textContent="Modifier le plein de carburant";
    const filled=localParts(x.filled_at);
    $("recordFuelDate").value=filled.date;
    $("recordFuelTime").value=filled.time;
    $("recordFuelVehicle").value=x.vehicle_registration||"";
    $("recordFuelKm").value=x.odometer_km??"";
    $("recordFuelLitres").value=x.litres??"";
    $("recordFuelNotes").value=x.notes||"";
  }

  updateRecordDuration();
  $("recordDialog").showModal();
}

async function submitRecordEdit(event){
  event.preventDefault();
  const type=$("recordType").value;
  const id=$("recordId").value;
  let body={};

  if(type==="work"){
    const date=$("recordWorkDate").value;
    body={
      started_at:localDateTimeToIso(date,$("recordWorkStart").value),
      ended_at:$("recordWorkEnd").value
        ?localDateTimeToIso(date,$("recordWorkEnd").value)
        :null,
      notes:$("recordWorkNotes").value
    };
  }

  if(type==="driving"){
    const date=$("recordDrivingDate").value;
    body={
      vehicle_registration:$("recordDrivingVehicle").value,
      started_at:localDateTimeToIso(date,$("recordDrivingStart").value),
      ended_at:$("recordDrivingEnd").value
        ?localDateTimeToIso(date,$("recordDrivingEnd").value)
        :null,
      km_start:$("recordDrivingKmStart").value,
      km_end:$("recordDrivingKmEnd").value,
      notes:$("recordDrivingNotes").value
    };
  }

  if(type==="fuel"){
    body={
      vehicle_registration:$("recordFuelVehicle").value,
      filled_at:localDateTimeToIso(
        $("recordFuelDate").value,$("recordFuelTime").value
      ),
      odometer_km:$("recordFuelKm").value,
      litres:$("recordFuelLitres").value,
      notes:$("recordFuelNotes").value
    };
  }

  await api(`/api/timeclock/records/${type}/${id}`,{
    method:"PATCH",
    body:JSON.stringify(body)
  });
  closeRecordDialog();
  await load();
}
$("weekPicker").value=isoWeekValue();$("weekPicker").addEventListener("change",load);$("dailyPeriod").addEventListener("change",renderDaily);$("declareHere").addEventListener("click",()=>openDeclaration().catch(e=>alert(e.message)));$("declareForm").addEventListener("submit",submitDeclaration);
$("settingsButton").addEventListener("click",async()=>{try{const s=state.data?.settings||(await api("/api/timeclock/settings")).settings;$("settingOvertime").value=s.overtime_balance_minutes??720;$("settingOvertimeDate").value=s.overtime_baseline_date||"2026-07-17";$("settingN1").value=s.paid_leave_n1??28;$("settingN").value=s.paid_leave_n??5;$("settingLeaveDate").value=s.paid_leave_baseline_date||"2026-07-17";$("settingsDialog").showModal()}catch(e){alert(e.message)}});
$("settingsForm").addEventListener("submit",async e=>{e.preventDefault();await api("/api/timeclock/settings",{method:"POST",body:JSON.stringify({overtime_balance_minutes:$("settingOvertime").value,overtime_baseline_date:$("settingOvertimeDate").value,paid_leave_n1:$("settingN1").value,paid_leave_n:$("settingN").value,paid_leave_baseline_date:$("settingLeaveDate").value})});$("settingsDialog").close();await load()});
document.addEventListener("click",async e=>{const ed=e.target.closest("[data-edit-declaration]"),dd=e.target.closest("[data-delete-declaration]"),dr=e.target.closest("[data-delete-record]"),er=e.target.closest("[data-edit-record]");if(ed)openDeclaration(ed.dataset.editDeclaration);if(dd&&confirm("Supprimer cette déclaration ?")){await api(`/api/timeclock/declarations/${dd.dataset.deleteDeclaration}`,{method:"DELETE"});await load()}if(dr){const [t,id]=dr.dataset.deleteRecord.split(":");deleteRecord(t,id)}if(er){const [t,id]=er.dataset.editRecord.split(":");editRecord(t,id)}});

$("recordForm").addEventListener("submit",event=>{
  submitRecordEdit(event).catch(error=>alert(error.message));
});
$("closeRecordDialog").addEventListener("click",closeRecordDialog);
$("cancelRecordDialog").addEventListener("click",closeRecordDialog);
[
  "recordWorkStart","recordWorkEnd",
  "recordDrivingStart","recordDrivingEnd"
].forEach(id=>$(id).addEventListener("input",updateRecordDuration));

load().catch(e=>alert(e.message));
