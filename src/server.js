import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEntities, loadUseCases, loadArchitecture, validateArchitecture } from "./knowledge.js";
import { MemoryStore } from "./store.js";
import { loadSeed } from "./seed.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const knowledgeDir = process.env.MDE_KNOWLEDGE || path.join(root, "sample/entities");
const seedFile = process.env.MDE_SEED || path.join(root, "sample/seed/data.json");
const notesFile = process.env.MDE_NOTES || path.join(root, "sample/annotations/notes.json");
let notes = fs.existsSync(notesFile) ? JSON.parse(fs.readFileSync(notesFile, "utf8")).notes || [] : [];
function saveNotes(){ fs.mkdirSync(path.dirname(notesFile),{recursive:true}); fs.writeFileSync(notesFile,JSON.stringify({type:"annotations",notes},null,2)+"\\n"); }
const entities = loadEntities(knowledgeDir);
const useCases = loadUseCases(process.env.MDE_USE_CASES || path.join(root, "sample/use-cases"));
const architecture = loadArchitecture(process.env.MDE_ARCHITECTURE || path.join(root, "sample/architecture/architecture.json"));
const architectureFindings = validateArchitecture(architecture, entities, useCases);
const architectureFailures = architectureFindings.filter(x=>x.status==="Fail");
if (architectureFailures.length) throw new Error("Architecture validation failed: "+architectureFailures.map(x=>x.subject+": "+x.message).join("; "));
const store = new MemoryStore(entities);
if (fs.existsSync(seedFile)) loadSeed(store, seedFile);

function entityFromPath(segment) {
  if (!segment) return undefined;
  const wanted = decodeURIComponent(segment).toLowerCase();
  return [...entities.keys()].find(name => name.toLowerCase() === wanted || `${name.toLowerCase()}s` === wanted);
}
function modelObject() { return Object.fromEntries(entities); }

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/") return html(res, fs.readFileSync(path.join(root, "public/index.html"), "utf8"));
    if (req.method === "GET" && url.pathname === "/version") return send(res, 200, { version: packageInfo.version });
    if (req.method === "GET" && url.pathname === "/model") return send(res, 200, modelObject());
    if (req.method === "PUT" && url.pathname.startsWith("/model/entities/")) {
      const oldName=decodeURIComponent(url.pathname.split("/")[3]), currentEntity=entities.get(oldName);
      if(!currentEntity)return send(res,404,{error:"Unknown entity"});
      const artifact=await body(req);
      if(artifact.type!=="entity"||!artifact.name||!artifact.key||!artifact.attributes?.[artifact.key])return send(res,400,{error:"Entity requires type, name, key, and a key attribute"});
      for(const [a,x] of Object.entries(artifact.attributes))if(x.type==="reference"&&!entities.has(x.entity)&&x.entity!==artifact.name)return send(res,400,{error:`Unknown reference target ${x.entity} for ${a}`});
      const oldFile=path.join(knowledgeDir,oldName.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase()+".json");
      const newFile=path.join(knowledgeDir,artifact.name.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase()+".json");
      fs.writeFileSync(newFile,JSON.stringify(artifact,null,2)+"\n");
      if(oldFile!==newFile&&fs.existsSync(oldFile))fs.unlinkSync(oldFile);
      entities.delete(oldName);entities.set(artifact.name,artifact);
      return send(res,200,artifact);
    }
    if (req.method === "GET" && url.pathname === "/use-cases") return send(res, 200, Object.fromEntries(useCases));
    if (req.method === "GET" && url.pathname === "/architecture") return send(res, 200, {architecture,findings:architectureFindings});
    if (url.pathname === "/notes" && req.method === "GET") { const target=url.searchParams.get("target"); return send(res,200,target?notes.filter(n=>n.target===target):notes); }
    if (url.pathname === "/notes" && req.method === "POST") { const data=await body(req); if(!data.target||!data.text?.trim()) return send(res,400,{error:"Target and note text are required"}); const note={id:crypto.randomUUID(),target:data.target,text:data.text.trim(),status:"Open",createdAt:new Date().toISOString()}; notes.push(note); saveNotes(); return send(res,201,note); }
    if (req.method === "PATCH" && url.pathname.startsWith("/notes/")) { const id=decodeURIComponent(url.pathname.split("/")[2]), note=notes.find(n=>n.id===id); if(!note)return send(res,404,{error:"Note not found"}); Object.assign(note,await body(req)); saveNotes(); return send(res,200,note); }
    if (req.method === "POST" && url.pathname.startsWith("/use-cases/") && url.pathname.endsWith("/run")) {
      const name=decodeURIComponent(url.pathname.split("/")[2]), uc=useCases.get(name); if(!uc)return send(res,404,{error:"Unknown use case"});
      const input=await body(req); let result; const results=[];
      for(let index=0; index<uc.steps.length; index++){const step=uc.steps[index];if(step.invoke){const inv=step.invoke, entityInput=inv.entity.startsWith("$")?inv.entity.slice(1):null;const recordId=entityInput?input[entityInput]:input.id;const args={};for(const [k,v] of Object.entries(inv.arguments||{}))args[k]=typeof v==="string"&&v.startsWith("$")?input[v.slice(1)]:v;result=store.execute(entityInput?uc.inputs[entityInput].entity:inv.entity,inv.operation,{id:recordId,data:args});results.push({step:index+1,title:step.title||inv.operation,result});}}
      return send(res,200,{useCase:name,outcome:uc.outcome,result,results});
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "data") {
      const entity = entityFromPath(parts[1]), id = parts[2];
      if (!entity) return send(res, 404, { error: "Unknown entity" });
      if (req.method === "GET" && !id) return send(res, 200, store.list(entity, Object.fromEntries(url.searchParams)));
      if (req.method === "GET" && id) return send(res, store.get(entity, decodeURIComponent(id)) ? 200 : 404, store.get(entity, decodeURIComponent(id)) ?? { error: "Not found" });
      if (req.method === "POST" && !id) return send(res, 201, store.execute(entity, "create", { data: await body(req) }));
      if (req.method === "PATCH" && id) {
        const value = store.execute(entity, "update", { id: decodeURIComponent(id), data: await body(req) });
        return send(res, value ? 200 : 404, value ?? { error: "Not found" });
      }
      if (req.method === "DELETE" && id) return send(res, store.execute(entity, "delete", { id: decodeURIComponent(id) }) ? 204 : 404);
    }

    const [, api, collection, id] = url.pathname.split("/");
    if (api !== "api") return send(res, 404, { error: "Not found" });
    const entity = entityFromPath(collection);
    if (!entity) return send(res, 404, { error: "Unknown entity" });
    if (req.method === "GET" && !id) return send(res, 200, store.execute(entity, "list"));
    if (req.method === "GET" && id) return send(res, store.execute(entity, "get", { id }) ? 200 : 404, store.execute(entity, "get", { id }) ?? { error: "Not found" });
    if (req.method === "POST" && !id) return send(res, 201, store.execute(entity, "create", { data: await body(req) }));
    if (req.method === "PATCH" && id) {
      const value = store.execute(entity, "update", { id, data: await body(req) });
      return send(res, value ? 200 : 404, value ?? { error: "Not found" });
    }
    if (req.method === "DELETE" && id) return send(res, store.execute(entity, "delete", { id }) ? 204 : 404);
    if (req.method === "POST" && id) return send(res, 200, store.execute(entity, decodeURIComponent(id), await body(req)));
    return send(res, 405, { error: "Method not allowed" });
  } catch (error) { return send(res, 400, { error: error.message }); }
});
function body(req){return new Promise((resolve,reject)=>{let raw="";req.on("data",c=>raw+=c);req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}})})}
function send(res,status,value){res.statusCode=status;if(status===204)return res.end();res.setHeader("content-type","application/json");res.end(JSON.stringify(value))}
function html(res,value){res.statusCode=200;res.setHeader("content-type","text/html; charset=utf-8");res.end(value)}
const port=Number(process.env.PORT||3090);
const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, ()=>console.log(`MDE Runtime Workbench listening on ${host}:${port}`));
