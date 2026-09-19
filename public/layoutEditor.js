// MDEX Layout Editor prototype.
// Standalone: define layout regions first, then drag semantic repository objects into them.
// No index.html dependency beyond a host element and optional callbacks.

export function mountLayoutEditor({ root, repository = {}, layout, saveLayout, preview }) {
  let draft = structuredClone(layout || defaultLayout());
  let selectedRegion = null;

  const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const icon = kind => ({attribute:"A",relation:"↔",operation:"⚙",feature:"◇"}[kind] || "•");

  function defaultLayout() {
    return {
      type:"layout", name:"detail-standard", title:"Employee - Detail View",
      regions:[
        {id:"header",label:"Header",kind:"section",items:[]},
        {id:"body",label:"Body",kind:"split",direction:"horizontal",regions:[
          {id:"main",label:"Main",kind:"section",width:"70%",items:[]},
          {id:"side",label:"Side",kind:"section",width:"30%",items:[]}
        ]},
        {id:"bottom",label:"Bottom",kind:"tabs",items:[]}
      ]
    };
  }

  function allRegions(regions=draft.regions,out=[]) {
    for (const r of regions || []) { out.push(r); allRegions(r.regions,out); }
    return out;
  }
  function findRegion(id){ return allRegions().find(r=>r.id===id); }

  function repoGroups() {
    const groups=[];
    for(const [entityName,e] of Object.entries(repository)) {
      const items=[];
      for(const name of Object.keys(e.attributes||{})) items.push({kind:"attribute",entity:entityName,name,label:name});
      for(const [name,r] of Object.entries(e.children||{})) items.push({kind:"relation",entity:entityName,name,label:r.label||name});
      for(const name of Object.keys(e.operations||{})) items.push({kind:"operation",entity:entityName,name,label:name});
      for(const name of Object.keys(e.features||{})) items.push({kind:"feature",entity:entityName,name,label:name});
      groups.push({entityName,items});
    }
    return groups;
  }

  function render(){
    root.innerHTML=`
    <div class="mdex-layout">
      <header class="le-topbar">
        <div class="le-brand">MDEX</div><div class="le-title">Layout Editor <span>Prototype</span></div>
        <div class="le-steps">1. Define layout&nbsp;&nbsp; 2. Drag repository objects&nbsp;&nbsp; 3. Preview</div>
        <div class="le-top-actions"><input id="le-title" value="${esc(draft.title||draft.name)}"><button class="le-btn" id="le-preview">▶ Preview</button><button class="le-btn primary" id="le-save">Save</button></div>
      </header>
      <main class="le-shell">
        <aside class="le-left">
          <h2>1. Layout Structure</h2>
          <div class="le-tabs"><button class="active">Regions</button><button>Templates</button><button>Properties</button></div>
          <div class="le-palette">
            ${palette("row","▥","Row","Horizontal container")}
            ${palette("column","▥","Column","Vertical container")}
            ${palette("split","▥","Split","Resizable panels")}
            ${palette("tabs","▰","Tabs","Tabbed container")}
            ${palette("section","▤","Section","Titled section")}
            ${palette("panel","□","Panel","General container")}
          </div>
          <h3>Quick Templates</h3>
          <div class="le-templates">
            <button data-template="detail"><i class="tpl detail"></i>Detail (Standard)</button>
            <button data-template="two"><i class="tpl two"></i>Two Column</button>
            <button data-template="tabs"><i class="tpl tabbed"></i>Tabbed Detail</button>
            <button data-template="master"><i class="tpl master"></i>Master Detail</button>
          </div>
        </aside>
        <section class="le-center">
          <div class="le-canvas-head"><h2>2. Layout Canvas</h2><span>Drag regions, then repository objects</span></div>
          <div id="le-canvas" class="le-canvas">${renderRegions(draft.regions)}</div>
        </section>
        <aside class="le-right">
          <h2>3. Repository</h2>
          <input class="le-search" id="le-search" placeholder="Search repository...">
          <div id="le-repository">${renderRepository()}</div>
        </aside>
      </main>
      <footer class="le-footer"><span>Layout: <b>${esc(draft.name)}</b></span><button class="le-btn" id="le-json">&lt;/&gt; Edit JSON</button><span class="le-spacer"></span><span id="le-status">Ready</span></footer>
    </div>`;
    wire();
  }

  function palette(kind,glyph,title,desc){return `<div class="le-palette-item" draggable="true" data-layout-kind="${kind}"><b>${glyph}</b><span><strong>${title}</strong><small>${desc}</small></span></div>`}

  function renderRegions(regions){
    return (regions||[]).map(r=>{
      if(r.kind==="split" || r.kind==="row" || r.kind==="column")
        return `<div class="le-region le-${r.kind}" data-region="${esc(r.id)}"><label>${esc(r.label)}</label><div class="le-region-children">${renderRegions(r.regions||[])}</div></div>`;
      return `<div class="le-region le-${r.kind||"section"}" data-region="${esc(r.id)}"><label>${esc(r.label)}</label><div class="le-drop">${renderItems(r.items||[]) || '<span class="le-empty">Drag items here</span>'}</div></div>`;
    }).join("");
  }

  function renderItems(items){return items.map(x=>`<div class="le-bound-item" data-ref="${esc(x.ref)}"><b>${icon(x.kind)}</b><span>${esc(x.label||x.name)}</span><button title="Remove">×</button></div>`).join("")}

  function renderRepository(filter=""){
    const q=filter.toLowerCase();
    return repoGroups().map(g=>{
      const items=g.items.filter(x=>!q || x.name.toLowerCase().includes(q) || x.kind.includes(q));
      if(!items.length)return "";
      const grouped={attribute:[],relation:[],operation:[],feature:[]};items.forEach(x=>grouped[x.kind].push(x));
      return `<div class="le-repo-entity"><h3>${esc(g.entityName)}</h3>${Object.entries(grouped).map(([kind,list])=>list.length?`<details open><summary>${kind[0].toUpperCase()+kind.slice(1)}s</summary>${list.map(x=>`<div class="le-repo-item" draggable="true" data-repo='${esc(JSON.stringify(x))}'><b>${icon(kind)}</b><span>${esc(x.label)}</span><i>⋮⋮</i></div>`).join("")}</details>`:"").join("")}</div>`;
    }).join("");
  }

  function wire(){
    root.querySelectorAll(".le-region").forEach(el=>{
      el.onclick=e=>{e.stopPropagation();selectedRegion=el.dataset.region;root.querySelectorAll(".le-region").forEach(x=>x.classList.toggle("selected",x===el))};
      el.ondragover=e=>{e.preventDefault();el.classList.add("dragover")};
      el.ondragleave=()=>el.classList.remove("dragover");
      el.ondrop=e=>dropInto(e,el.dataset.region);
    });
    root.querySelectorAll(".le-repo-item").forEach(el=>el.ondragstart=e=>e.dataTransfer.setData("application/mdex-repo",el.dataset.repo));
    root.querySelectorAll(".le-palette-item").forEach(el=>el.ondragstart=e=>e.dataTransfer.setData("application/mdex-layout",el.dataset.layoutKind));
    root.querySelectorAll(".le-bound-item button").forEach(b=>b.onclick=e=>{e.stopPropagation();const item=b.closest(".le-bound-item"),region=b.closest(".le-region").dataset.region,r=findRegion(region);r.items=r.items.filter(x=>x.ref!==item.dataset.ref);render()});
    root.querySelector("#le-search").oninput=e=>{root.querySelector("#le-repository").innerHTML=renderRepository(e.target.value);wireRepoOnly()};
    root.querySelector("#le-save").onclick=async()=>{draft.title=root.querySelector("#le-title").value;await saveLayout?.(structuredClone(draft));status("Saved")};
    root.querySelector("#le-preview").onclick=()=>preview?.(structuredClone(draft));
    root.querySelector("#le-json").onclick=editJSON;
    root.querySelectorAll("[data-template]").forEach(b=>b.onclick=()=>applyTemplate(b.dataset.template));
  }
  function wireRepoOnly(){root.querySelectorAll(".le-repo-item").forEach(el=>el.ondragstart=e=>e.dataTransfer.setData("application/mdex-repo",el.dataset.repo))}

  function dropInto(e,id){
    e.preventDefault();e.stopPropagation();const r=findRegion(id);if(!r)return;
    const repo=e.dataTransfer.getData("application/mdex-repo");
    const kind=e.dataTransfer.getData("application/mdex-layout");
    if(repo){
      if(r.regions)return status("Drop repository objects into a leaf region");
      const x=JSON.parse(repo),ref=`${x.entity}.${x.kind}.${x.name}`;r.items||=[];
      if(!r.items.some(i=>i.ref===ref))r.items.push({...x,ref});render();return;
    }
    if(kind){r.regions||=[];r.items=undefined;const id2=`${kind}-${Date.now().toString(36)}`;r.regions.push({id:id2,label:kind[0].toUpperCase()+kind.slice(1),kind,items:[]});render()}
  }

  function applyTemplate(t){
    const presets={
      detail:defaultLayout().regions,
      two:[{id:"body",label:"Body",kind:"split",direction:"horizontal",regions:[{id:"left",label:"Left",kind:"section",items:[]},{id:"right",label:"Right",kind:"section",items:[]}]}],
      tabs:[{id:"header",label:"Header",kind:"section",items:[]},{id:"tabs",label:"Tabs",kind:"tabs",items:[]}],
      master:[{id:"body",label:"Master / Detail",kind:"split",direction:"horizontal",regions:[{id:"master",label:"Master",kind:"section",items:[]},{id:"detail",label:"Detail",kind:"section",items:[]}]}]
    };draft.regions=structuredClone(presets[t]||presets.detail);render()
  }

  function editJSON(){
    const text=prompt("Layout JSON",JSON.stringify(draft,null,2));if(!text)return;
    try{draft=JSON.parse(text);render()}catch(e){status("Invalid JSON: "+e.message)}
  }
  function status(s){const el=root.querySelector("#le-status");if(el)el.textContent=s}
  render();
}
