// Generic MDEX Use Case editor.
// Standalone module: the host supplies the use-case artifact, semantic model and persistence callback.
// This file intentionally does not modify or depend on index.html.

export function mountUseCaseEditor({ root, useCase, model = {}, saveUseCase }) {
  let draft=structuredClone(useCase);
  draft.inputs ||= {};
  draft.steps ||= [];

  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const entityNames=()=>Object.keys(model);
  const operationNames=entity=>Object.keys(model[entity]?.operations||{});

  function inputRow(name="",s={}){
    const kind=s.entity?"entity":s.type||"string";
    return `<tr>
      <td><input class="uc-in-name" value="${esc(name)}"></td>
      <td><select class="uc-in-kind"><option value="string">string</option><option value="enum">enum</option><option value="entity">entity</option></select></td>
      <td><input class="uc-in-detail" value="${esc(s.entity||((s.values||[]).join(", ")))}" placeholder="Entity or enum values"></td>
      <td><input class="uc-in-required" type="checkbox" ${s.required?"checked":""}></td>
      <td><button class="btn danger uc-remove">×</button></td>
    </tr>`;
  }

  function stepRow(step={},i=0){
    const inv=step.invoke||{}, ref=inv.entity||"", entity=resolveEntity(ref);
    return `<tr>
      <td>${i+1}</td>
      <td><input class="uc-step-title" value="${esc(step.title||"")}"></td>
      <td><select class="uc-step-entity"><option value="">Select…</option>${entityChoices(ref)}</select></td>
      <td><select class="uc-step-operation"><option value="">Select…</option>${operationNames(entity).map(x=>`<option ${x===inv.operation?"selected":""}>${esc(x)}</option>`).join("")}</select></td>
      <td><input class="uc-step-args" value="${esc(argsText(inv.arguments||{}))}" placeholder="department=$department"></td>
      <td><button class="btn danger uc-remove">×</button></td>
    </tr>`;
  }

  function entityChoices(selected=""){
    const inputs=Object.entries(draft.inputs).filter(([,s])=>s.entity).map(([n,s])=>[`$${n}`,`${n} (${s.entity})`]);
    return [...inputs,...entityNames().map(n=>[n,n])].map(([v,l])=>`<option value="${esc(v)}" ${v===selected?"selected":""}>${esc(l)}</option>`).join("");
  }
  function resolveEntity(ref){if(ref?.startsWith("$"))return draft.inputs[ref.slice(1)]?.entity;return ref}
  function argsText(args){return Object.entries(args).map(([k,v])=>`${k}=${v}`).join(", ")}
  function parseArgs(text){const out={};for(const part of text.split(",").map(x=>x.trim()).filter(Boolean)){const p=part.indexOf("=");if(p>0)out[part.slice(0,p).trim()]=part.slice(p+1).trim()}return out}

  function render(){
    root.innerHTML=`<div class="usecase-editor" style="max-width:1050px">
      <div class="toolbar"><strong>Use Case Editor</strong><button class="btn primary" id="uc-save">Save Use Case</button></div>
      <div class="field"><strong>Name</strong><input id="uc-name" value="${esc(draft.name||"")}"></div>
      <div class="field"><strong>Title</strong><input id="uc-title" value="${esc(draft.title||"")}"></div>
      <div class="field"><strong>Actor</strong><input id="uc-actor" value="${esc(draft.actor||"")}"></div>
      <div class="field"><strong>Goal</strong><textarea id="uc-goal" style="width:100%;min-height:65px">${esc(draft.goal||"")}</textarea></div>

      <h3>Inputs</h3>
      <table id="uc-inputs"><tr><th>Name</th><th>Kind</th><th>Entity / Values</th><th>Required</th><th></th></tr>
      ${Object.entries(draft.inputs).map(([n,s])=>inputRow(n,s)).join("")}</table>
      <div class="toolbar"><button class="btn" id="uc-add-input">+ Input</button></div>

      <h3>Flow</h3>
      <table id="uc-steps"><tr><th>#</th><th>Step</th><th>Target</th><th>Operation</th><th>Arguments</th><th></th></tr>
      ${draft.steps.map(stepRow).join("")}</table>
      <div class="toolbar"><button class="btn" id="uc-add-step">+ Step</button></div>

      <div class="field"><strong>Outcome</strong><textarea id="uc-outcome" style="width:100%;min-height:65px">${esc(draft.outcome||"")}</textarea></div>
      <p class="muted">Flow steps invoke declared semantic entity operations. Business rules remain with the entity/operation.</p>
    </div>`;

    root.querySelectorAll("#uc-inputs tr").forEach((tr,i)=>{if(i){const current=Object.values(draft.inputs)[i-1],sel=tr.querySelector(".uc-in-kind");sel.value=current.entity?"entity":current.type||"string"}});
    root.querySelectorAll(".uc-remove").forEach(b=>b.onclick=()=>b.closest("tr").remove());
    root.querySelector("#uc-add-input").onclick=()=>{root.querySelector("#uc-inputs").insertAdjacentHTML("beforeend",inputRow());wireRemoves()};
    root.querySelector("#uc-add-step").onclick=()=>{syncInputs();root.querySelector("#uc-steps").insertAdjacentHTML("beforeend",stepRow({},root.querySelectorAll("#uc-steps tr").length-1));wireRemoves();wireStepEntities()};
    wireStepEntities();
    root.querySelector("#uc-save").onclick=save;
  }

  function wireRemoves(){root.querySelectorAll(".uc-remove").forEach(b=>b.onclick=()=>b.closest("tr").remove())}
  function wireStepEntities(){root.querySelectorAll(".uc-step-entity").forEach(sel=>sel.onchange=()=>{syncInputs();const row=sel.closest("tr"),entity=resolveEntity(sel.value),op=row.querySelector(".uc-step-operation");op.innerHTML='<option value="">Select…</option>'+operationNames(entity).map(x=>`<option>${esc(x)}</option>`).join("")})}

  function syncInputs(){
    const inputs={};
    for(const tr of [...root.querySelectorAll("#uc-inputs tr")].slice(1)){
      const name=tr.querySelector(".uc-in-name").value.trim();if(!name)continue;
      const kind=tr.querySelector(".uc-in-kind").value,detail=tr.querySelector(".uc-in-detail").value.trim(),s={};
      if(kind==="entity")s.entity=detail;else {s.type=kind;if(kind==="enum")s.values=detail.split(",").map(x=>x.trim()).filter(Boolean)}
      if(tr.querySelector(".uc-in-required").checked)s.required=true;inputs[name]=s;
    }
    draft.inputs=inputs;return inputs;
  }

  async function save(){
    draft.type="use-case";
    draft.name=root.querySelector("#uc-name").value.trim();
    draft.title=root.querySelector("#uc-title").value.trim();
    draft.actor=root.querySelector("#uc-actor").value.trim();
    draft.goal=root.querySelector("#uc-goal").value.trim();
    draft.outcome=root.querySelector("#uc-outcome").value.trim();
    syncInputs();
    draft.steps=[...root.querySelectorAll("#uc-steps tr")].slice(1).map(tr=>({
      ...(tr.querySelector(".uc-step-title").value.trim()?{title:tr.querySelector(".uc-step-title").value.trim()}:{}),
      invoke:{
        entity:tr.querySelector(".uc-step-entity").value,
        operation:tr.querySelector(".uc-step-operation").value,
        arguments:parseArgs(tr.querySelector(".uc-step-args").value)
      }
    })).filter(x=>x.invoke.entity&&x.invoke.operation);
    if(!draft.name)throw new Error("Use case name is required.");
    if(!draft.goal)throw new Error("Use case goal is required.");
    await saveUseCase(draft);
  }

  render();
}
