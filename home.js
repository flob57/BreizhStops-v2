const $ = id => document.getElementById(id);
let clockState = { work: null, driving: null };
let vehicles = [];

function parisDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}
function fmtMinutes(total) {
  total = Math.max(0, Math.round(Number(total || 0)));
  return `${Math.floor(total/60)}h${String(total%60).padStart(2,"0")}`;
}
function updateClock() {
  const now = new Date();
  $("digitalTime").textContent = new Intl.DateTimeFormat("fr-FR", {
    timeZone:"Europe/Paris", hour:"2-digit", minute:"2-digit", hour12:false
  }).format(now);
  $("homeDate").textContent = new Intl.DateTimeFormat("fr-FR", {
    timeZone:"Europe/Paris", weekday:"long", day:"numeric", month:"long", year:"numeric"
  }).format(now);
}
async function api(url, options={}) {
  const response = await fetch(url, {
    ...options,
    headers: {"Content-Type":"application/json", ...(options.headers||{})}
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error(`Réponse serveur illisible (${response.status}).`); }
  if (!response.ok) throw new Error(payload.error || `Erreur ${response.status}`);
  return payload;
}
function secondsUntil(time) {
  const m=String(time||"").match(/(\d{1,2}):(\d{2})/); if(!m)return null;
  const now=new Date(), target=new Date(now);
  target.setHours(Number(m[1]),Number(m[2]),0,0);
  return Math.round((target-now)/1000);
}
async function loadDashboard() {
  try {
    const payload=await api(`/api/duties/today?date=${encodeURIComponent(parisDate())}`);
    const services=(payload.services||[]).filter(s=>String(s.driver_name||"").trim()||String(s.vehicle_registration||"").trim());
    const validated=services.filter(s=>Number(s.validated)===1).length;
    $("validatedCount").textContent=`${validated} / ${services.length}`;
    $("validationProgress").style.width=services.length?`${Math.round(validated/services.length*100)}%`:"0%";
    const next=services.map(service=>({service,seconds:secondsUntil(service.ps_time)}))
      .filter(i=>i.seconds!==null&&i.seconds>=0).sort((a,b)=>a.seconds-b.seconds)[0];
    $("nextDuty").textContent=next
      ? `Prochaine prise de service à ${next.service.ps_time} · ${next.service.first_course||"service"} · ${next.service.driver_name||"conducteur non renseigné"}`
      : services.length?"Toutes les prises de service prévues sont passées.":"Aucun service à effectuer aujourd’hui.";
  } catch {
    $("validatedCount").textContent="— / —";
    $("nextDuty").textContent="Impossible de charger les prises de service pour le moment.";
  }
}
async function loadVehicles(sync=false) {
  if(sync) {
    try { await api("/api/admin/vehicles/sync",{method:"POST",body:"{}"}); } catch(e) { console.warn(e); }
  }
  const payload=await api("/api/timeclock/vehicles");
  vehicles=payload.vehicles||[];
  $("drivingVehicle").innerHTML=vehicles.length
    ? vehicles.map(v=>`<option>${v}</option>`).join("")
    : `<option value="">Aucun véhicule synchronisé</option>`;
}
async function refreshActivity() {
  try {
    clockState=await api("/api/timeclock/status");
    const work=clockState.work, drive=clockState.driving;
    $("workCounter").textContent=fmtMinutes(clockState.work_minutes_today);
    $("drivingCounter").textContent=fmtMinutes(clockState.driving_minutes_today);
    $("workStateBadge").textContent=drive?`Conduite · ${drive.vehicle_registration}`:work?"En poste":"Hors poste";
    $("workStateBadge").classList.toggle("active",!!work);
    $("workToggle").textContent=work?"■ Terminer mon poste":"▶ Prendre mon poste";
    $("workToggle").classList.toggle("danger",!!work);
    $("driveToggle").hidden=!work;
    $("driveToggle").textContent=drive?"■ Terminer la conduite":"🛞 Prendre le volant";
    $("fuelButton").hidden=!drive;
    $("saeShortcut").hidden=!drive;
  } catch(e) { console.error(e); }
}
async function toggleWork() {
  try {
    await api("/api/timeclock/work",{method:"POST",body:JSON.stringify({action:clockState.work?"stop":"start"})});
    await refreshActivity();
  } catch(e) { alert(e.message); }
}
async function toggleDriving() {
  if(!clockState.driving) {
    if(!vehicles.length) await loadVehicles(true);
    $("drivingDialog").showModal();
  } else {
    $("drivingKmEnd").min=clockState.driving.km_start;
    $("drivingKmEnd").value=clockState.driving.km_start;
    $("drivingEndDialog").showModal();
  }
}
async function submitDrivingStart(e) {
  e.preventDefault();
  try {
    await api("/api/timeclock/driving",{method:"POST",body:JSON.stringify({
      action:"start",vehicle_registration:$("drivingVehicle").value,km_start:$("drivingKmStart").value
    })});
    $("drivingDialog").close(); e.target.reset(); await refreshActivity();
  } catch(err){alert(err.message);}
}
async function submitDrivingEnd(e) {
  e.preventDefault();
  try {
    await api("/api/timeclock/driving",{method:"POST",body:JSON.stringify({action:"stop",km_end:$("drivingKmEnd").value})});
    $("drivingEndDialog").close(); e.target.reset(); await refreshActivity();
  } catch(err){alert(err.message);}
}
function openFuel() {
  $("fuelVehicleLabel").textContent=`Véhicule : ${clockState.driving.vehicle_registration}`;
  $("fuelKm").min=clockState.driving.km_start;
  $("fuelKm").value=clockState.driving.km_start;
  $("fuelDialog").showModal();
}
async function submitFuel(e) {
  e.preventDefault();
  try {
    await api("/api/timeclock/fuel",{method:"POST",body:JSON.stringify({
      odometer_km:$("fuelKm").value,litres:$("fuelLitres").value,notes:$("fuelNotes").value
    })});
    $("fuelDialog").close(); e.target.reset(); alert("Plein enregistré.");
  } catch(err){alert(err.message);}
}
function declarationTotal() {
  let total=0;
  for(const [a,b] of [["morningStart","morningEnd"],["afternoonStart","afternoonEnd"]]){
    if($(a).value&&$(b).value){
      const [ah,am]=$(a).value.split(":").map(Number),[bh,bm]=$(b).value.split(":").map(Number);
      total+=Math.max(0,bh*60+bm-ah*60-am);
    }
  }
  $("declareTotal").textContent=`Total : ${fmtMinutes(total)}`;
}
async function openDeclaration() {
  try {
  const date=parisDate();
  const payload=await api(`/api/timeclock/declarations?date=${date}`);
  const d=payload.declaration||payload.prefill||{};
  $("declareDate").value=date;
  $("morningStart").value=d.morning_start||"";
  $("morningEnd").value=d.morning_end||"";
  $("afternoonStart").value=d.afternoon_start||"";
  $("afternoonEnd").value=d.afternoon_end||"";
  $("declareNotes").value=d.notes||"";
  declarationTotal();
  $("declareDialog").showModal();
  } catch (e) { alert(e.message); }
}
async function submitDeclaration(e) {
  e.preventDefault();
  try {
    await api("/api/timeclock/declarations",{method:"POST",body:JSON.stringify({
      work_date:$("declareDate").value,morning_start:$("morningStart").value,morning_end:$("morningEnd").value,
      afternoon_start:$("afternoonStart").value,afternoon_end:$("afternoonEnd").value,notes:$("declareNotes").value
    })});
    $("declareDialog").close(); alert("Heures déclarées enregistrées.");
  } catch(err){alert(err.message);}
}
async function loadHomeStats() {
  try {
    const p=await api("/api/timeclock/stats");
    const m=p.overtime_minutes;
    const overtimeText=`${m>=0?"+":"−"}${fmtMinutes(Math.abs(m))}`;
    $("homeOvertime").textContent=overtimeText;
    if ($("activityOvertime")) $("activityOvertime").textContent=overtimeText;
  } catch{}
}


function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadTodayTodos() {
  const list = $("todoList");
  const message = $("todoMessage");
  const count = $("todoCount");

  try {
    const payload = await api(
      `/api/todos/today?date=${encodeURIComponent(parisDate())}`
    );
    const tasks = payload.tasks || [];

    count.textContent = tasks.length;
    list.innerHTML = "";

    if (!tasks.length) {
      message.hidden = false;
      message.textContent = "Aucune tâche restante aujourd’hui.";
      return;
    }

    message.hidden = true;

    list.innerHTML = tasks.map(task => `
      <article class="todo-item" data-todo-id="${escapeHtml(task.id)}">
        <input
          class="todo-check"
          type="checkbox"
          aria-label="Marquer ${escapeHtml(task.title)} comme accomplie"
        >
        <span class="todo-title">${escapeHtml(task.title)}</span>
        <span class="todo-kind ${task.kind === "unique" ? "unique" : ""}">
          ${task.kind === "unique" ? "Date du jour" : "Récurrente"}
        </span>
      </article>
    `).join("");
  } catch (error) {
    count.textContent = "!";
    list.innerHTML = "";
    message.hidden = false;
    message.textContent = `Impossible de charger les tâches : ${error.message}`;
  }
}

async function completeTodayTodo(item) {
  const id = item.dataset.todoId;
  const checkbox = item.querySelector(".todo-check");
  checkbox.disabled = true;
  item.classList.add("completing");

  try {
    await api(`/api/todos/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      body: JSON.stringify({ date: parisDate() })
    });

    setTimeout(() => {
      item.remove();
      const remaining = $("todoList").children.length;
      $("todoCount").textContent = remaining;
      if (!remaining) {
        $("todoMessage").hidden = false;
        $("todoMessage").textContent = "Toutes les tâches du jour sont accomplies.";
      }
    }, 180);
  } catch (error) {
    checkbox.checked = false;
    checkbox.disabled = false;
    item.classList.remove("completing");
    alert(error.message);
  }
}

$("todoList").addEventListener("change", event => {
  const checkbox = event.target.closest(".todo-check");
  if (!checkbox || !checkbox.checked) return;
  const item = checkbox.closest(".todo-item");
  if (item) completeTodayTodo(item);
});

$("workToggle").addEventListener("click",toggleWork);
$("driveToggle").addEventListener("click",toggleDriving);
$("fuelButton").addEventListener("click",openFuel);
$("drivingForm").addEventListener("submit",submitDrivingStart);
$("drivingEndForm").addEventListener("submit",submitDrivingEnd);
$("fuelForm").addEventListener("submit",submitFuel);
$("declareHoursButton").addEventListener("click",openDeclaration);
$("declareHoursButtonCard").addEventListener("click",openDeclaration);
$("declareForm").addEventListener("submit",submitDeclaration);
["morningStart","morningEnd","afternoonStart","afternoonEnd"].forEach(id=>$(id).addEventListener("input",declarationTotal));
$("declareDate").addEventListener("change",async()=>{
  const p=await api(`/api/timeclock/declarations?date=${$("declareDate").value}`),d=p.declaration||p.prefill||{};
  for(const [id,key] of [["morningStart","morning_start"],["morningEnd","morning_end"],["afternoonStart","afternoon_start"],["afternoonEnd","afternoon_end"]]) $(id).value=d[key]||"";
  $("declareNotes").value=d.notes||""; declarationTotal();
});
updateClock(); setInterval(updateClock,1000);
loadDashboard(); setInterval(loadDashboard,60000);
loadTodayTodos(); setInterval(loadTodayTodos,300000);
loadVehicles(false).catch(()=>{});
refreshActivity(); setInterval(refreshActivity,15000);
loadHomeStats();
