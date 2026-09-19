// Generic MDEX state-transition diagram editor.
// Reads and writes the entity's states/transitions through the semantic model API.

export function mountStateDiagram({ root, entityName, entity, saveEntity }) {
  let draft = structuredClone(entity);
  const states = () => draft.states?.values || [];
  draft.states ||= { initial: "", values: [] };
  draft.transitions ||= {};

  const esc = v => String(v ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const render = () => {
    const values=states(), initial=draft.states.initial;
    root.innerHTML=`<div class="state-editor">
      <div class="toolbar"><strong>${esc(entityName)} — State Transition Diagram</strong><button class="btn" id="sd-add-state">+ State</button><button class="btn" id="sd-add-transition">+ Transition</button><button class="btn primary" id="sd-save">Save</button></div>
      <svg id="sd-canvas" viewBox="0 0 900 420" style="width:100%;min-height:420px;border:1px solid #ddd;background:#fafafa"></svg>
      <h3>Transitions</h3>
      <table><tr><th>Name</th><th>From</th><th>To</th><th>Rules</th><th></th></tr>
      ${Object.entries(draft.transitions).map(([n,t])=>`<tr><td><input data-t="${esc(n)}" data-f="name" value="${esc(n)}"></td><td><select data-t="${esc(n)}" data-f="from">${values.map(s=>`<option ${(t.from||[]).includes(s)?"selected":""}>${esc(s)}</option>`).join("")}</select></td><td><select data-t="${esc(n)}" data-f="to">${values.map(s=>`<option ${t.to===s?"selected":""}>${esc(s)}</option>`).join("")}</select></td><td>${esc((t.rules||[]).join(", "))}</td><td><button class="btn danger" data-delete="${esc(n)}">×</button></td></tr>`).join("")}</table>
      <p class="muted">Initial state: <select id="sd-initial">${values.map(s=>`<option ${s===initial?"selected":""}>${esc(s)}</option>`).join("")}</select></p>
    </div>`;
    draw();
    root.querySelector("#sd-add-state").onclick=()=>{const n=prompt("State name");if(n&&!values.includes(n)){draft.states.values.push(n);if(!draft.states.initial)draft.states.initial=n;render()}};
    root.querySelector("#sd-add-transition").onclick=()=>{if(values.length<2)return alert("Add at least two states first.");const n=prompt("Transition name");if(n&&!draft.transitions[n]){draft.transitions[n]={from:[values[0]],to:values[1]};render()}};
    root.querySelector("#sd-save").onclick=async()=>{sync();await saveEntity(draft);};
    root.querySelector("#sd-initial").onchange=e=>draft.states.initial=e.target.value;
    root.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>{delete draft.transitions[b.dataset.delete];render()});
  };
  function sync(){const renamed={};root.querySelectorAll("[data-t]").forEach(el=>{const old=el.dataset.t;renamed[old]??=structuredClone(draft.transitions[old]);if(el.dataset.f==="from")renamed[old].from=[el.value];if(el.dataset.f==="to")renamed[old].to=el.value;if(el.dataset.f==="name")renamed[old]._name=el.value.trim()||old});for(const [old,t] of Object.entries(renamed)){const n=t._name||old;delete t._name;if(n!==old){delete draft.transitions[old];draft.transitions[n]=t}else draft.transitions[old]=t}}
  function draw(){const svg=root.querySelector("#sd-canvas"),vals=states(),pos={};vals.forEach((s,i)=>{const angle=(Math.PI*2*i/Math.max(vals.length,1))-Math.PI/2;pos[s]={x:450+250*Math.cos(angle),y:210+135*Math.sin(angle)}});let out='<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"/></marker></defs>';for(const [n,t] of Object.entries(draft.transitions)){for(const from of t.from||[]){if(!pos[from]||!pos[t.to])continue;const a=pos[from],b=pos[t.to];out+=`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#555" marker-end="url(#arrow)"/><text x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-7}" text-anchor="middle" font-size="13">${esc(n)}</text>`}}for(const s of vals){const p=pos[s],isInitial=s===draft.states.initial;out+=`<rect x="${p.x-65}" y="${p.y-25}" width="130" height="50" rx="9" fill="${isInitial?"#e8f3ff":"white"}" stroke="${isInitial?"#1769d2":"#777"}"/><text x="${p.x}" y="${p.y+5}" text-anchor="middle" font-size="15">${esc(s)}</text>`}svg.innerHTML=out}
  render();
}
