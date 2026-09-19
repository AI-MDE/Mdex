// Generic MDEX semantic ERD editor.
// Visualizes entities, attributes, references and child relationships from the application model.

export function mountERD({ root, model, saveEntity, openEntity }) {
  const draft=structuredClone(model), names=Object.keys(draft);
  const esc=v=>String(v??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const positions={}; names.forEach((n,i)=>positions[n]={x:60+(i%3)*300,y:55+Math.floor(i/3)*245});
  let selected=null;

  function relationships(){
    const out=[];
    for(const [name,e] of Object.entries(draft)){
      for(const [a,s] of Object.entries(e.attributes||{}))if(s.type==="reference"&&s.entity)out.push({from:name,to:s.entity,label:a,kind:"reference"});
      for(const [a,s] of Object.entries(e.children||{}))if(s.entity)out.push({from:name,to:s.entity,label:s.label||a,kind:s.ownership||"child"});
    }
    return out;
  }
  function render(){
    root.innerHTML=`<div class="erd-editor"><div class="toolbar"><strong>Application Model — ERD</strong><button class="btn" id="erd-add-rel">+ Relationship</button><span class="muted">Drag entities · click an entity to edit it</span></div><svg id="erd-canvas" viewBox="0 0 1000 720" style="width:100%;min-height:620px;border:1px solid #ddd;background:#fafafa"></svg><div id="erd-props"></div></div>`;
    draw();
    root.querySelector("#erd-add-rel").onclick=addRelationship;
  }
  function draw(){
    const svg=root.querySelector("#erd-canvas");
    let out='<defs><marker id="erd-arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"/></marker></defs>';
    for(const r of relationships()){const a=positions[r.from],b=positions[r.to];if(!a||!b)continue;const x1=a.x+210,y1=a.y+45,x2=b.x,y2=b.y+45;out+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#777" marker-end="url(#erd-arrow)"/><text x="${(x1+x2)/2}" y="${(y1+y2)/2-6}" text-anchor="middle" font-size="12">${esc(r.label)} · ${esc(r.kind)}</text>`}
    for(const [name,e] of Object.entries(draft)){const p=positions[name],attrs=Object.entries(e.attributes||{}).slice(0,7);const h=44+attrs.length*22;out+=`<g class="erd-node" data-name="${esc(name)}" transform="translate(${p.x},${p.y})" style="cursor:move"><rect width="210" height="${h}" rx="8" fill="white" stroke="${selected===name?"#1769d2":"#777"}" stroke-width="${selected===name?2:1}"/><rect width="210" height="36" rx="8" fill="#eef4ff"/><text x="12" y="24" font-size="15" font-weight="600">${esc(name)}</text>${attrs.map(([a,s],i)=>`<text x="12" y="${57+i*22}" font-size="12">${esc(a)} : ${esc(s.type)}${s.type==="reference"?" → "+esc(s.entity):""}</text>`).join("")}</g>`}
    svg.innerHTML=out;svg.querySelectorAll(".erd-node").forEach(node=>wireNode(node,svg));
  }
  function wireNode(node,svg){
    let dragging=false,dx=0,dy=0;const name=node.dataset.name;
    node.onpointerdown=e=>{dragging=true;node.setPointerCapture(e.pointerId);const p=positions[name];dx=e.offsetX-p.x;dy=e.offsetY-p.y};
    node.onpointermove=e=>{if(!dragging)return;const box=svg.getBoundingClientRect(),sx=1000/box.width,sy=720/box.height;positions[name]={x:Math.max(0,e.offsetX*sx-dx),y:Math.max(0,e.offsetY*sy-dy)};draw()};
    node.onpointerup=e=>{dragging=false;selected=name;draw();showProps(name)};
    node.ondblclick=()=>openEntity?.(name);
  }
  function showProps(name){const e=draft[name],box=root.querySelector("#erd-props");box.innerHTML=`<div class="card"><h3>${esc(name)}</h3><div class="toolbar"><button class="btn primary" id="erd-edit">Edit Entity</button></div><p class="muted">${Object.keys(e.attributes||{}).length} attributes · ${Object.keys(e.operations||{}).length} operations · ${Object.keys(e.children||{}).length} child relationships</p></div>`;box.querySelector("#erd-edit").onclick=()=>openEntity?.(name)}
  async function addRelationship(){const from=prompt("From entity:\n"+names.join(", "));if(!draft[from])return;const to=prompt("To entity:\n"+names.filter(n=>n!==from).join(", "));if(!draft[to])return;const attr=prompt("Relationship / reference name");if(!attr?.trim())return;draft[from].attributes||={};draft[from].attributes[attr.trim()]={type:"reference",entity:to};await saveEntity(from,draft[from]);draft[from]=structuredClone(model[from]||draft[from]);render()}
  render();
}
