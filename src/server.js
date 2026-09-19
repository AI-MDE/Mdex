import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEntities, loadUseCases, loadArchitecture, validateArchitecture } from "./knowledge.js";
import { MemoryStore } from "./store.js";
import { loadSeed } from "./seed.js";
import console from "node:console";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const packageInfo = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const instanceId = crypto.randomUUID();
const knowledgeDir = process.env.MDE_KNOWLEDGE || path.join(root, "sample/entities");
const seedFile = process.env.MDE_SEED || path.join(root, "sample/seed/data.json");
const dataFile = process.env.MDE_DATA || path.join(root, "sample/data/data.json");
const notesFile = process.env.MDE_NOTES || path.join(root, "sample/annotations/notes.jsonl");
const architectureFile = process.env.MDE_ARCHITECTURE || path.join(root, "sample/architecture/architecture.json");
if (!fs.existsSync(knowledgeDir)) throw new Error("Knowledge directory not found: " + knowledgeDir);
if (!fs.existsSync(seedFile)) throw new Error("Seed file not found: " + seedFile);
if (!fs.existsSync(notesFile)) throw new Error("Notes file not found: " + notesFile);
if (fs.existsSync(notesFile)) console.log("Notes file found: " + notesFile);

function loadNotes(){return fs.readFileSync(notesFile,"utf8").split(/\r?\n/).filter(line=>line.trim()).map((line,index)=>{try{return JSON.parse(line)}catch{throw new Error(`Invalid note JSON on line ${index+1}: ${notesFile}`)}})}
let notes = fs.existsSync(notesFile) ? loadNotes() : [];
function saveNotes(){fs.mkdirSync(path.dirname(notesFile),{recursive:true});fs.writeFileSync(notesFile,notes.map(note=>JSON.stringify(note)).join("\n"));}
const entities = loadEntities(knowledgeDir);
const useCases = loadUseCases(process.env.MDE_USE_CASES || path.join(root, "sample/use-cases"));
let architecture = loadArchitecture(architectureFile);
let architectureFindings = validateArchitecture(architecture, entities, useCases);
const architectureFailures = architectureFindings.filter(x=>x.status==="Fail");
if (architectureFailures.length) throw new Error("Architecture validation failed: "+architectureFailures.map(x=>x.subject+": "+x.message).join("; "));
const store = new MemoryStore(entities);
function saveData(){fs.mkdirSync(path.dirname(dataFile),{recursive:true});fs.writeFileSync(dataFile,JSON.stringify(store.snapshot(),null,2));}
if(fs.existsSync(dataFile))store.hydrate(JSON.parse(fs.readFileSync(dataFile,"utf8")));else{if(fs.existsSync(seedFile))loadSeed(store,seedFile);saveData()}

function entityFromPath(segment) {
  if (!segment) return undefined;
  const wanted = decodeURIComponent(segment).toLowerCase();
  return [...entities.keys()].find(name => name.toLowerCase() === wanted || `${name.toLowerCase()}s` === wanted);
}
function modelObject() { return Object.fromEntries(entities); }
function entityFile(name){for(const file of fs.readdirSync(knowledgeDir).filter(x=>x.endsWith(".json"))){const full=path.join(knowledgeDir,file),artifact=JSON.parse(fs.readFileSync(full,"utf8"));if(artifact.name===name)return full}return undefined}
function requestActor(req){return req.headers["x-actor"]||"Workbench user"}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/") return html(res, fs.readFileSync(path.join(root, "public/index.html"), "utf8"));
    if (req.method === "GET" && url.pathname === "/version") return send(res, 200, { version: packageInfo.version, instanceId });
    if (req.method === "GET" && url.pathname === "/model") return send(res, 200, modelObject());
    if (req.method === "PATCH" && url.pathname.startsWith("/model/") && url.pathname.endsWith("/design")) { const name=decodeURIComponent(url.pathname.split("/")[2]),entity=entities.get(name),file=entityFile(name);if(!entity||!file)return send(res,404,{error:"Unknown entity"});const data=await body(req),proposed={...entity};if(data.architectureFeatures!==undefined){const features=data.architectureFeatures;if(!features||typeof features!=="object"||["auditStamp","trackHistory"].some(key=>typeof features[key]!=="boolean"))return send(res,400,{error:"auditStamp and trackHistory must be boolean"});proposed.architectureFeatures={auditStamp:features.auditStamp,trackHistory:features.trackHistory}}for(const section of ["attributes","children","operations","rules","states","transitions"])if(data[section]!==undefined){if(!data[section]||Array.isArray(data[section])||typeof data[section]!=="object")return send(res,400,{error:section+" must be an object"});proposed[section]=data[section]}if(data.stateAttribute!==undefined)proposed.stateAttribute=data.stateAttribute||undefined;if(!proposed.attributes?.[proposed.key])return send(res,400,{error:"The system key must remain a declared attribute"});const proposedEntities=new Map(entities);proposedEntities.set(name,proposed),findings=validateArchitecture(architecture,proposedEntities,useCases),failures=findings.filter(x=>x.status==="Fail");if(failures.length)return send(res,400,{error:"Entity design validation failed: "+failures.map(x=>x.subject+": "+x.message).join("; ")});fs.writeFileSync(file,JSON.stringify(proposed,null,2));Object.keys(entity).forEach(key=>delete entity[key]);Object.assign(entity,proposed);return send(res,200,entity); }
    if (req.method === "GET" && url.pathname === "/use-cases") return send(res, 200, Object.fromEntries(useCases));
    if (req.method === "GET" && url.pathname === "/architecture") return send(res, 200, {architecture,findings:architectureFindings});
    if (req.method === "PATCH" && url.pathname === "/architecture") { const data=await body(req); if(data.title!==undefined&&typeof data.title!=="string")return send(res,400,{error:"Architecture title must be text"}); if(data.principles!==undefined&&(!Array.isArray(data.principles)||data.principles.some(x=>typeof x!=="string"||!x.trim())))return send(res,400,{error:"Architecture principles must be non-empty text"}); if(data.constraints!==undefined&&(!data.constraints||Array.isArray(data.constraints)||typeof data.constraints!=="object"))return send(res,400,{error:"Architecture constraints must be an object"}); const proposed={...architecture,title:data.title??architecture.title,principles:data.principles?.map(x=>x.trim())??architecture.principles,constraints:data.constraints??architecture.constraints}; const findings=validateArchitecture(proposed,entities,useCases),failures=findings.filter(x=>x.status==="Fail"); if(failures.length)return send(res,400,{error:"Architecture validation failed: "+failures.map(x=>x.subject+": "+x.message).join("; ")}); fs.writeFileSync(architectureFile,JSON.stringify(proposed,null,2)); architecture=proposed;architectureFindings=findings;return send(res,200,{architecture,findings}); }
    if (url.pathname === "/notes" && req.method === "GET") { const target=url.searchParams.get("target"); return send(res,200,target?notes.filter(n=>n.target===target):notes); }
    if (url.pathname === "/notes" && req.method === "POST") { const data=await body(req); if(!data.target||!data.text?.trim()) return send(res,400,{error:"Target and note text are required"}); const note={id:crypto.randomUUID(),target:data.target,text:data.text.trim(),status:"Open",createdAt:new Date().toISOString()}; notes.push(note); saveNotes(); return send(res,201,note); }
    if (req.method === "PATCH" && url.pathname.startsWith("/notes/")) { const id=decodeURIComponent(url.pathname.split("/")[2]), note=notes.find(n=>n.id===id); if(!note)return send(res,404,{error:"Note not found"}); const data=await body(req); if(data.text!==undefined){if(!data.text?.trim())return send(res,400,{error:"Note text is required"});note.text=data.text.trim()} if(data.target!==undefined){if(!data.target)return send(res,400,{error:"Target is required"});note.target=data.target} if(data.status!==undefined){if(!["Open","Resolved"].includes(data.status))return send(res,400,{error:"Status must be Open or Resolved"});note.status=data.status} saveNotes(); return send(res,200,note); }
    if (req.method === "DELETE" && url.pathname.startsWith("/notes/")) { const id=decodeURIComponent(url.pathname.split("/")[2]), index=notes.findIndex(n=>n.id===id); if(index<0)return send(res,404,{error:"Note not found"}); notes.splice(index,1); saveNotes(); return send(res,204); }
    if (req.method === "POST" && url.pathname.startsWith("/use-cases/") && url.pathname.endsWith("/run")) {
      const name=decodeURIComponent(url.pathname.split("/")[2]), uc=useCases.get(name); if(!uc)return send(res,404,{error:"Unknown use case"});
      const input=await body(req); let result; const results=[];
      for(let index=0; index<uc.steps.length; index++){const step=uc.steps[index];if(step.invoke){const inv=step.invoke, entityInput=inv.entity.startsWith("$")?inv.entity.slice(1):null;const recordId=entityInput?input[entityInput]:input.id;const args={};for(const [k,v] of Object.entries(inv.arguments||{}))args[k]=typeof v==="string"&&v.startsWith("$")?input[v.slice(1)]:v;result=store.execute(entityInput?uc.inputs[entityInput].entity:inv.entity,inv.operation,{id:recordId,data:args,actor:requestActor(req)});results.push({step:index+1,title:step.title||inv.operation,result});}}
      saveData();return send(res,200,{useCase:name,outcome:uc.outcome,result,results});
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if(parts[0]==="history"&&req.method==="GET"){const entity=entityFromPath(parts[1]),id=parts[2];if(!entity||!id)return send(res,404,{error:"Unknown history target"});return send(res,200,store.history(entity,decodeURIComponent(id)))}
    if (parts[0] === "data") {
      const entity = entityFromPath(parts[1]), id = parts[2];
      if (!entity) return send(res, 404, { error: "Unknown entity" });
      if (req.method === "GET" && !id) return send(res, 200, store.list(entity, Object.fromEntries(url.searchParams)));
      if (req.method === "GET" && id) return send(res, store.get(entity, decodeURIComponent(id)) ? 200 : 404, store.get(entity, decodeURIComponent(id)) ?? { error: "Not found" });
      if (req.method === "POST" && !id) {const value=store.execute(entity,"create",{data:await body(req),actor:requestActor(req)});saveData();return send(res,201,value)}
      if (req.method === "PATCH" && id) {
        const value = store.execute(entity, "update", { id: decodeURIComponent(id), data: await body(req),actor:requestActor(req) });
        if(value)saveData();return send(res, value ? 200 : 404, value ?? { error: "Not found" });
      }
      if (req.method === "DELETE" && id) {const deleted=store.execute(entity,"delete",{id:decodeURIComponent(id),actor:requestActor(req)});if(deleted)saveData();return send(res,deleted?204:404)}
    }

    const [, api, collection, id] = url.pathname.split("/");
    if (api !== "api") return send(res, 404, { error: "Not found" });
    const entity = entityFromPath(collection);
    if (!entity) return send(res, 404, { error: "Unknown entity" });
    if (req.method === "GET" && !id) return send(res, 200, store.execute(entity, "list"));
    if (req.method === "GET" && id) return send(res, store.execute(entity, "get", { id }) ? 200 : 404, store.execute(entity, "get", { id }) ?? { error: "Not found" });
    if (req.method === "POST" && !id) {const value=store.execute(entity,"create",{data:await body(req),actor:requestActor(req)});saveData();return send(res,201,value)}
    if (req.method === "PATCH" && id) {
      const value = store.execute(entity, "update", { id, data: await body(req),actor:requestActor(req) });
      if(value)saveData();return send(res, value ? 200 : 404, value ?? { error: "Not found" });
    }
    if (req.method === "DELETE" && id) {const deleted=store.execute(entity,"delete",{id,actor:requestActor(req)});if(deleted)saveData();return send(res,deleted?204:404)}
    if (req.method === "POST" && id) {const value=store.execute(entity,decodeURIComponent(id),{...await body(req),actor:requestActor(req)});saveData();return send(res,200,value)}
    return send(res, 405, { error: "Method not allowed" });
  } catch (error) { return send(res, 400, { error: error.message }); }
});
function body(req){return new Promise((resolve,reject)=>{let raw="";req.on("data",c=>raw+=c);req.on("end",()=>{try{resolve(raw?JSON.parse(raw):{})}catch(e){reject(e)}})})}
function send(res,status,value){res.statusCode=status;if(status===204)return res.end();res.setHeader("content-type","application/json");res.end(JSON.stringify(value))}
function html(res,value){res.statusCode=200;res.setHeader("content-type","text/html; charset=utf-8");res.end(value)}
const port=Number(process.env.PORT||3090);
const host = process.env.HOST || "0.0.0.0";
server.listen(port, host, ()=>console.log(`MDE Runtime Workbench listening on ${host}:${port}`));
