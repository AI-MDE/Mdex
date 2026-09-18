import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "../src/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const entities = new Map([
  ["Department", {
    type: "entity", name: "Department", key: "departmentId",
    attributes: {
      departmentId: { type: "uuid", generated: true },
      name: { type: "string", required: true }
    },
    operations: {
      create: { action: "create" }, get: { action: "get" },
      list: { action: "list" }, update: { action: "update" },
      delete: { action: "delete" }
    }
  }],
  ["Employee", {
    type: "entity", name: "Employee", key: "employeeId",
    attributes: {
      employeeId: { type: "uuid", generated: true },
      name: { type: "string", required: true },
      department: { type: "reference", entity: "Department" }
    },
    operations: {
      create: { action: "create" }, get: { action: "get" },
      list: { action: "list" }, update: { action: "update" },
      delete: { action: "delete" }
    }
  }]
]);

test("declared operations drive CRUD", () => {
  const store = new MemoryStore(entities);
  const department = store.execute("Department", "create", { data: { name: "Engineering" } });
  const employee = store.execute("Employee", "create", { data: { name: "Ada", department: department.departmentId } });
  assert.ok(employee.employeeId);
  assert.equal(store.execute("Employee", "get", { id: employee.employeeId }).name, "Ada");
  store.execute("Employee", "update", { id: employee.employeeId, data: { name: "Grace" } });
  assert.equal(store.execute("Employee", "get", { id: employee.employeeId }).name, "Grace");
});

test("references are validated and navigable", () => {
  const store = new MemoryStore(entities);
  assert.throws(() => store.execute("Employee", "create", { name: "Ada", department: "missing" }), /Reference not found/);
  const department = store.execute("Department", "create", { name: "Engineering" });
  const employee = store.execute("Employee", "create", { name: "Ada", department: department.departmentId });
  assert.equal(store.related("Employee", employee.employeeId, "department").name, "Engineering");
});

test("list operation can query model data", () => {
  const store = new MemoryStore(entities);
  const department = store.execute("Department", "create", { name: "Engineering" });
  store.execute("Employee", "create", { name: "Ada", department: department.departmentId });
  store.execute("Employee", "create", { name: "Grace", department: department.departmentId });
  assert.equal(store.execute("Employee", "list", { where: { department: department.departmentId } }).length, 2);
});


test("custom operations, rules, and state transitions are model driven", () => {
  const behavioral = new Map([["Employee", {
    type:"entity", name:"Employee", key:"employeeId", stateAttribute:"status",
    attributes:{employeeId:{type:"uuid",generated:true},name:{type:"string",required:true},department:{type:"string"},status:{type:"string",default:"Active",readOnly:true}},
    operations:{create:{action:"create"},transfer:{action:"custom",set:{department:"$department"},rules:["active-only"]},terminate:{action:"transition",transition:"terminate"}},
    states:{initial:"Active",values:["Active","Terminated"]},
    transitions:{terminate:{from:["Active"],to:"Terminated",rules:["active-only"]}},
    rules:{"active-only":{description:"Must be active",when:{status:"Active"},message:"Employee must be active."}}
  }]]);
  const store = new MemoryStore(behavioral);
  const e = store.execute("Employee","create",{data:{name:"Ada"}});
  assert.equal(e.status,"Active");
  store.execute("Employee","transfer",{id:e.employeeId,data:{department:"Engineering"}});
  assert.equal(e.department,"Engineering");
  store.execute("Employee","terminate",{id:e.employeeId});
  assert.equal(e.status,"Terminated");
  assert.throws(()=>store.execute("Employee","transfer",{id:e.employeeId,data:{department:"Sales"}}),/must be active/i);
});

test("annotations are available on every Workbench page type", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.equal(workbench.match(/notesHtml\(/g)?.length, 6,
    "the annotation renderer is defined once and used by all five page types");
  assert.match(workbench, /async function list\([^\n]+notesHtml\("entity:"\+name\)/);
  assert.match(workbench, /async function edit\([^\n]+notesHtml\("entity:"\+name\)/);
  assert.match(workbench, /async function show\([^\n]+notesHtml\("entity:"\+name\)/);
  assert.match(workbench, /async function showUseCase\([^\n]+notesHtml\("use-case:"\+name\)/);
  assert.match(workbench, /async function showArchitecture\([^\n]+notesHtml\("architecture:"\+a\.name\)/);
});

test("the Workbench reloads after watched application files change", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  const server = fs.readFileSync(path.join(here, "../src/server.js"), "utf8");
  const packageInfo = JSON.parse(fs.readFileSync(path.join(here, "../package.json"), "utf8"));
  assert.match(packageInfo.scripts.start, /--watch-path=src/);
  assert.match(packageInfo.scripts.start, /--watch-path=public/);
  assert.match(server, /instanceId/);
  assert.match(workbench, /watchForReload\(v\.instanceId\)/);
  assert.match(workbench, /location\.reload\(\)/);
});

test("notes can be managed from the Workbench menu", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  const server = fs.readFileSync(path.join(here, "../src/server.js"), "utf8");
  assert.match(workbench, /<strong>Manage<\/strong><button onclick="showNotes\(\)">Notes<\/button>/);
  assert.match(workbench, /async function showNotes\(\)/);
  assert.match(workbench, /async function addManagedNote\(\)/);
  assert.match(workbench, /async function updateManagedNote\(id\)/);
  assert.match(workbench, /async function deleteManagedNote\(id\)/);
  assert.match(server, /req\.method === "DELETE" && url\.pathname\.startsWith\("\/notes\/"\)/);
});

test("page annotations can be deleted next to Save", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  const renderer = workbench.split("\n").find(line => line.startsWith("async function notesHtml"));
  const saveButton = renderer.indexOf(">Save</button>");
  const deleteButton = renderer.indexOf(">Delete</button>", saveButton);
  assert.ok(saveButton >= 0 && deleteButton > saveButton, "Delete is rendered after Save");
  assert.match(workbench, /async function deleteNote\(id\)/);
});

test("notes persistence uses JSON Lines without a trailing suffix", () => {
  const server = fs.readFileSync(path.join(here, "../src/server.js"), "utf8");
  const saveNotes = server.split("\n").find(line => line.startsWith("function saveNotes"));
  assert.match(server, /sample\/annotations\/notes\.jsonl/);
  assert.match(server, /split\(\/\\r\?\\n\/\)/);
  assert.match(saveNotes, /notes\.map\(note=>JSON\.stringify\(note\)\)\.join\("\\n"\)/);
  assert.doesNotMatch(saveNotes, /join\("\\n"\)\+"\\n"/);
  const jsonl = fs.readFileSync(path.join(here, "../sample/annotations/notes.jsonl"), "utf8");
  for (const line of jsonl.split(/\r?\n/).filter(Boolean)) assert.doesNotThrow(() => JSON.parse(line));
});

test("system keys are hidden and relationships use business labels", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /function visibleAttributes\(e\).*hideGeneratedKeys/);
  assert.match(workbench, /async function businessLabel\(entity,r\)/);
  assert.match(workbench, /async function cell\(e,a,v\).*await refLabel\(s,v\)/);
  assert.match(workbench, /visibleAttributes\(e\)\.map\(async a=>/);
  assert.doesNotMatch(workbench, /\$\{esc\(r\[a\]\)\} →<\/a>/);
});

test("architecture can be edited and is validated before persistence", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  const server = fs.readFileSync(path.join(here, "../src/server.js"), "utf8");
  assert.match(workbench, /onclick="editArchitecture\(\)">Edit<\/button>/);
  assert.match(workbench, /async function editArchitecture\(\)/);
  assert.match(workbench, /async function saveArchitecture\(event\)/);
  assert.match(server, /req\.method === "PATCH" && url\.pathname === "\/architecture"/);
  assert.match(server, /validateArchitecture\(proposed,entities,useCases\)/);
  assert.match(server, /fs\.writeFileSync\(architectureFile,JSON\.stringify\(proposed,null,2\)\)/);
});

test("entity architecture features drive audit stamps and history", () => {
  const designed = new Map([["Thing", {
    type:"entity", name:"Thing", key:"thingId",
    architectureFeatures:{auditStamp:true,trackHistory:true},
    attributes:{thingId:{type:"uuid",generated:true},name:{type:"string",required:true}},
    operations:{create:{action:"create"},update:{action:"update"},delete:{action:"delete"}}
  }]]);
  const store = new MemoryStore(designed), thing=store.execute("Thing","create",{data:{name:"First"}});
  assert.ok(thing._audit.createdAt);
  assert.equal(thing._audit.createdBy,"System");
  store.execute("Thing","update",{id:thing.thingId,data:{name:"Second"},actor:"Ada"});
  assert.equal(thing._audit.updatedBy,"Ada");
  assert.equal(store.history("Thing",thing.thingId).length,2);
  assert.equal(store.history("Thing",thing.thingId)[1].record.name,"Second");
  assert.equal(store.history("Thing",thing.thingId)[1].actor,"Ada");
});

test("every entity exposes generic design options", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  const server = fs.readFileSync(path.join(here, "../src/server.js"), "utf8");
  assert.match(workbench, /class="detail-nav-icons"/);
  assert.doesNotMatch(workbench, /class="entity-nav"/);
  assert.match(workbench, /async function editEntityDesign\(name\)/);
  assert.match(workbench, /auditStamp/);
  assert.match(workbench, /trackHistory/);
  assert.match(server, /url\.pathname\.endsWith\("\/design"\)/);
});

test("records expose system details behind a separate icon", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /aria-label="System details"/);
  assert.match(workbench, /class="detail-nav-icons"/);
  assert.match(workbench, /aria-label="Design options"/);
  assert.match(workbench, /async function toggleSystemDetails\(name,id,open\)/);
  assert.match(workbench, /id="system-details" class="system-panel" hidden/);
  assert.match(workbench, />Close<\/button>/);
  assert.match(workbench, /Created by/);
  assert.match(workbench, /Updated by/);
});

test("instance data and history can be persisted and hydrated", () => {
  const store = new MemoryStore(entities);
  const department = store.execute("Department","create",{data:{name:"Engineering"}});
  store.execute("Employee","create",{data:{name:"Ada",department:department.departmentId}});
  const snapshot = store.snapshot(), restored = new MemoryStore(entities);
  restored.hydrate(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(restored.list("Employee")[0].name,"Ada");
  assert.equal(restored.related("Employee",restored.list("Employee")[0].employeeId,"department").name,"Engineering");
});

test("mutations save instance data to the configured JSON file", () => {
  const server = fs.readFileSync(path.join(here, "../src/server.js"), "utf8");
  assert.match(server, /MDE_DATA/);
  assert.match(server, /sample\/data\/data\.json/);
  assert.match(server, /function saveData\(\)/);
  assert.match(server, /store\.hydrate/);
});

test("read-only attributes are displayed but excluded from edit forms", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /function editableAttributes\(e\).*\.filter\(a=>!e\.attributes\[a\]\.readOnly\)/);
  assert.match(workbench, /fields=await Promise\.all\(editableAttributes\(e\)\.map/);
});

test("enum fields use dropdowns and child collections are editable", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /if\(s\.type==="enum"\)return `<label class="field"/);
  assert.match(workbench, /async function editChild\(parent,parentId,key,raw\)/);
  assert.match(workbench, /async function removeChild\(parent,parentId,key,childId\)/);
  assert.match(workbench, />\+ Add<\/button>/);
  assert.match(workbench, />Remove<\/button>/);
});
