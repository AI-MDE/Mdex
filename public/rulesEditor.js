// Generic MDEX Business Rules editor.
// Standalone module. The host supplies an entity artifact and persistence callback.
// This file intentionally does not modify or depend on index.html.

export function mountRulesEditor({ root, entity, saveEntity }) {
  let draft=structuredClone(entity);
  draft.rules ||= {};
  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  function row(name="",r={}){
    const when=Object.entries(r.when||{})[0]||["",""];
    const forbid=Object.entries(r.forbid||{})[0]||["",""];
    return `<tr>
      <td><input class="re-name" value="${esc(name)}"></td>
      <td><select class="re-kind"><option value="precondition">precondition</option><option value="constraint">constraint</option></select></td>
      <td><input class="re-desc" value="${esc(r.description||"")}"></td>
      <td><select class="re-when-field"><option value="">—</option>${attributeOptions(when[0])}</select></td>
      <td><input class="re-when-value" value="${esc(when[1])}"></td>
      <td><select class="re-forbid-field"><option value="">—</option>${attributeOptions(forbid[0])}</select></td>
      <td><input class="re-forbid-value" value="${esc(forbid[1])}" placeholder="present"></td>
      <td><button class="btn danger re-remove">×</button></td>
    </tr>`;
  }

  function attributeOptions(selected=""){
    return Object.keys(draft.attributes||{}).map(a=>`<option value="${esc(a)}" ${a===selected?"selected":""}>${esc(a)}</option>`).join("");
  }

  function render(){
    root.innerHTML=`<div class="rules-editor" style="max-width:1200px">
      <div class="toolbar"><strong>${esc(draft.name)} — Business Rules</strong><button class="btn" id="re-add">+ Rule</button><button class="btn primary" id="re-save">Save Rules</button></div>
      <table id="re-table">
        <tr><th>Name</th><th>Kind</th><th>Description</th><th>When field</th><th>Equals</th><th>Forbid field</th><th>Forbid</th><th></th></tr>
        ${Object.entries(draft.rules).map(([n,r])=>row(n,r)).join("")}
      </table>
      <h3>Messages</h3>
      <div id="re-messages">${Object.entries(draft.rules).map(([n,r])=>messageRow(n,r.message||"")).join("")}</div>
      <p class="muted">Rules remain semantic knowledge owned by the entity. Preconditions govern whether operations may execute; constraints protect valid entity state.</p>
    </div>`;
    [...root.querySelectorAll("#re-table tr")].slice(1).forEach((tr,i)=>tr.querySelector(".re-kind").value=Object.values(draft.rules)[i].kind||"precondition");
    wire();
  }

  function messageRow(name,message){return `<label class="field re-message-row" data-rule="${esc(name)}"><strong>${esc(name)}</strong><input class="re-message" value="${esc(message)}"></label>`}

  function wire(){
    root.querySelectorAll(".re-remove").forEach(b=>b.onclick=()=>{b.closest("tr").remove();syncMessageRows()});
    root.querySelector("#re-add").onclick=()=>{root.querySelector("#re-table").insertAdjacentHTML("beforeend",row());wire();syncMessageRows()};
    root.querySelector("#re-save").onclick=save;
    root.querySelectorAll(".re-name").forEach(x=>x.oninput=syncMessageRows);
  }

  function syncMessageRows(){
    const existing={};root.querySelectorAll(".re-message-row").forEach(r=>existing[r.dataset.rule]=r.querySelector(".re-message").value);
    const names=[...root.querySelectorAll("#re-table tr")].slice(1).map(tr=>tr.querySelector(".re-name").value.trim()).filter(Boolean);
    root.querySelector("#re-messages").innerHTML=names.map(n=>messageRow(n,existing[n]||"")).join("");
  }

  async function save(){
    const messages={};root.querySelectorAll(".re-message-row").forEach(r=>messages[r.dataset.rule]=r.querySelector(".re-message").value.trim());
    const rules={};
    for(const tr of [...root.querySelectorAll("#re-table tr")].slice(1)){
      const name=tr.querySelector(".re-name").value.trim();if(!name)continue;
      const r={kind:tr.querySelector(".re-kind").value};
      const description=tr.querySelector(".re-desc").value.trim();if(description)r.description=description;
      const wf=tr.querySelector(".re-when-field").value,wv=tr.querySelector(".re-when-value").value.trim();if(wf&&wv)r.when={[wf]:coerce(wv)};
      const ff=tr.querySelector(".re-forbid-field").value,fv=tr.querySelector(".re-forbid-value").value.trim();if(ff&&fv)r.forbid={[ff]:coerce(fv)};
      if(messages[name])r.message=messages[name];rules[name]=r;
    }
    draft.rules=rules;
    await saveEntity(draft);
  }

  function coerce(v){if(v==="true")return true;if(v==="false")return false;if(v!==""&&!Number.isNaN(Number(v)))return Number(v);return v}
  render();
}
