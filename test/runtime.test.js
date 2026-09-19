import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { MemoryStore } from "../src/store.js";
import { validateArchitecture } from "../src/knowledge.js";
import { EntityDesignService, EntityDesignError } from "../src/entity-design.js";

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

test("entity design page includes semantic model sections", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /Entity Design<\/h2>/);
  assert.match(workbench, /<h3>Attributes<\/h3>/);
  assert.match(workbench, /<h3>Relationships<\/h3>/);
  assert.match(workbench, /<h3>Operations<\/h3>/);
  assert.match(workbench, /<h3>Rules<\/h3>/);
  assert.match(workbench, /<h3>States & Transitions<\/h3>/);
  assert.match(workbench, /entity\.stateAttribute/);
  assert.match(workbench, /entity\.transitions/);
  assert.match(workbench, /onclick="editEntityModel\('\$\{name\}'\)">Edit Model<\/button>/);
  assert.match(workbench, /async function editEntityModel\(name\)/);
  assert.match(workbench, />Save Entity Design<\/button>/);
  assert.match(workbench, /smartField\("Operations","operations"/);
  assert.match(workbench, /Smart Editor ·/);
  assert.match(workbench, /function addSmartItem\(name\)/);
  assert.match(workbench, /function validateSmartEditor\(\)/);
  assert.match(workbench, /id="save-entity-model"/);
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

test("Employee owns editable Performance Reviews", () => {
  const employee = JSON.parse(fs.readFileSync(path.join(here, "../sample/entities/employee.json"), "utf8"));
  const review = JSON.parse(fs.readFileSync(path.join(here, "../sample/entities/performance-review.json"), "utf8"));
  assert.deepEqual(employee.children.performanceReviews, {
    entity:"PerformanceReview", foreignKey:"employee", ownership:"composition", label:"Performance Reviews"
  });
  assert.equal(review.attributes.employee.entity,"Employee");
  assert.deepEqual(review.attributes.rating.values,["Needs Improvement","Meets Expectations","Exceeds Expectations","Outstanding"]);
  assert.equal(review.operations.create.action,"create");
  assert.equal(review.operations.update.action,"update");
  assert.equal(review.operations.delete.action,"delete");
});

test("Employee owns editable Leave records", () => {
  const employee = JSON.parse(fs.readFileSync(path.join(here, "../sample/entities/employee.json"), "utf8"));
  const leave = JSON.parse(fs.readFileSync(path.join(here, "../sample/entities/leave.json"), "utf8"));
  assert.deepEqual(employee.children.leave, {
    entity:"Leave", foreignKey:"employee", ownership:"composition", label:"Leave"
  });
  assert.equal(leave.attributes.employee.entity,"Employee");
  assert.deepEqual(leave.attributes.status.values,["Requested","Approved","Rejected","Cancelled"]);
  assert.equal(leave.operations.create.action,"create");
  assert.equal(leave.operations.update.action,"update");
  assert.equal(leave.operations.delete.action,"delete");
});

test("architecture validation checks child relationship design", () => {
  const architecture = {constraints:{referencesMustTargetEntity:true}};
  const invalid = new Map(entities);
  invalid.set("Department",{...invalid.get("Department"),children:{missing:{entity:"Missing",foreignKey:"department"}}});
  assert.equal(validateArchitecture(architecture,invalid,new Map()).find(x=>x.subject==="Department.missing").status,"Fail");
});

test("explicit rule kinds separate preconditions from constraints", () => {
  const behavioral = new Map([["Thing",{
    type:"entity",name:"Thing",key:"thingId",
    attributes:{thingId:{type:"uuid",generated:true},status:{type:"string",default:"Open"},owner:{type:"string"}},
    operations:{create:{action:"create"},assign:{action:"custom",set:{owner:"$owner"},rules:["open-only"]},update:{action:"update"}},
    rules:{
      "open-only":{kind:"precondition",when:{status:"Open"},message:"Thing must be open."},
      "closed-no-owner":{kind:"constraint",when:{status:"Closed"},forbid:{owner:"present"},message:"Closed things cannot have an owner."}
    }
  }]]);
  const store = new MemoryStore(behavioral),thing=store.execute("Thing","create",{});
  store.execute("Thing","assign",{id:thing.thingId,owner:"Ada"});
  assert.throws(()=>store.execute("Thing","update",{id:thing.thingId,data:{status:"Closed"}}),/cannot have an owner/);
});

test("architecture validation resolves operation and transition rules", () => {
  const governed = new Map([["Thing",{type:"entity",name:"Thing",key:"thingId",attributes:{thingId:{type:"uuid"}},operations:{run:{action:"custom",rules:["missing"]}},transitions:{finish:{from:["Open"],to:"Done",rules:["also-missing"]}},rules:{}}]]);
  const findings=validateArchitecture({constraints:{rulesMustResolve:true}},governed,new Map()).filter(finding=>finding.status==="Fail");
  assert.deepEqual(findings.map(finding=>finding.message),["Unknown rule Thing.missing.","Unknown rule Thing.also-missing."]);
});

test("Workbench pages have smart URLs and browser back navigation", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /onclick="history\.back\(\)"/);
  assert.match(workbench, /window\.addEventListener\("popstate",renderRoute\)/);
  assert.match(workbench, /async function renderRoute\(\)/);
  assert.match(workbench, /#\/entities\//);
  assert.match(workbench, /\/use-cases\//);
  assert.match(workbench, /\/architecture\/edit/);
  assert.match(workbench, /\/design\/edit/);
});

test("Entity Editor supports inline attribute and relationship CRUD", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /async function structuredEntityEditor\(name\)/);
  assert.match(workbench, /id="attribute-editor-body"/);
  assert.match(workbench, />\+ Add Attribute<\/button>/);
  assert.match(workbench, /id="relationship-editor-body"/);
  assert.match(workbench, />\+ Add Relationship<\/button>/);
  assert.match(workbench, />Delete<\/button>/);
  assert.match(workbench, />Save Entity<\/button>/);
});

test("entity design behavior is encapsulated in a service class", () => {
  const server = fs.readFileSync(path.join(here, "../src/server.js"), "utf8");
  assert.match(server, /new EntityDesignService/);
  assert.match(server, /result=entityDesign\.update\(name,await body\(req\)\)/);
});

test("EntityDesignService validates completely and commits atomically", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mdex-design-"));
  try {
    const file = path.join(directory, "thing.json");
    const entity = {type:"entity",name:"Thing",key:"thingId",attributes:{thingId:{type:"uuid",generated:true},status:{type:"string"}},operations:{create:{action:"create"}}};
    fs.writeFileSync(file,JSON.stringify(entity));
    const entities = new Map([["Thing",entity]]);
    entities.sourceFiles = new Map([["Thing",file]]);
    const architecture = {entityDesign:{sections:{attributes:"object",children:"object",operations:"object",rules:"object",states:"object",transitions:"object",elementOrder:"array"},features:["auditStamp","trackHistory"]},constraints:{entitiesRequireKey:true,operationsMustDeclareAction:true}};
    const service = new EntityDesignService({entities,useCases:new Map(),architecture:()=>architecture});
    assert.throws(() => service.update("Thing",{stateAttribute:"missing",architectureFeatures:{auditStamp:"yes",trackHistory:false}}), error => {
      assert.ok(error instanceof EntityDesignError);
      assert.deepEqual(error.violations.map(value=>value.field).sort(),["auditStamp","stateAttribute"]);
      return true;
    });
    assert.throws(() => service.update("Thing",{rules:{broken:{kind:"mystery",when:{missing:true}}},architectureFeatures:{auditStamp:false,trackHistory:false}}), error => {
      assert.deepEqual(error.violations.map(value=>value.field).sort(),["broken.kind","broken.message","broken.when.missing"]);
      return true;
    });
    const original = entities.get("Thing");
    const result = service.update("Thing",{stateAttribute:"status",architectureFeatures:{auditStamp:true,trackHistory:false}});
    assert.notEqual(result.entity,original);
    assert.equal(result.entity.stateAttribute,"status");
    assert.ok(result.findings.every(value=>value.status==="Pass"));
    assert.deepEqual(JSON.parse(fs.readFileSync(file,"utf8")),result.entity);
    assert.equal(fs.readdirSync(directory).filter(name=>name.endsWith(".tmp")).length,0);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

test("Entity Editor supports inline operation, rule, state, and transition CRUD", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /async function fullStructuredEntityEditor\(name\)/);
  assert.match(workbench, /id="operation-editor-body"/);
  assert.match(workbench, />\+ Add Operation<\/button>/);
  assert.match(workbench, /id="rule-editor-body"/);
  assert.match(workbench, />\+ Add Rule<\/button>/);
  assert.match(workbench, /id="state-editor-body"/);
  assert.match(workbench, />\+ Add State<\/button>/);
  assert.match(workbench, /id="transition-editor-body"/);
  assert.match(workbench, />\+ Add Transition<\/button>/);
});

test("Entity Editor merges attributes and relations into an ordered design list", () => {
  const workbench = fs.readFileSync(path.join(here, "../public/index.html"), "utf8");
  assert.match(workbench, /id="design-element-body"/);
  assert.match(workbench, />\+ Add Attribute<\/button>/);
  assert.match(workbench, />\+ Add Relation<\/button>/);
  assert.match(workbench, /function setupDesignBlocks\(\)/);
  assert.match(workbench, /row\.draggable=true/);
  assert.match(workbench, /dragover/);
  assert.match(workbench, /foreignKey\.type="hidden"/);
  assert.match(workbench, /class="re-entity"/);
  assert.match(workbench, /class="re-label"/);
  assert.match(workbench, /spec\.type==="reference"/);
  assert.match(workbench, /data-kind="reference"/);
  assert.match(workbench, /class="ae-label"/);
  assert.match(workbench, /options\.body=\{\.\.\.options\.body,elementOrder\}/);
});

test("EntityDesignService persists mixed element order", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mdex-order-"));
  try {
    const file = path.join(directory, "thing.json");
    const entity = {type:"entity",name:"Thing",key:"thingId",attributes:{thingId:{type:"uuid",generated:true},name:{type:"string"}},children:{parts:{entity:"Thing",foreignKey:"thingId",label:"Parts"}},operations:{create:{action:"create"}}};
    fs.writeFileSync(file,JSON.stringify(entity));
    const entities = new Map([["Thing",entity]]);
    entities.sourceFiles = new Map([["Thing",file]]);
    const architecture = {entityDesign:{sections:{attributes:"object",children:"object",operations:"object",rules:"object",states:"object",transitions:"object",elementOrder:"array"},features:["auditStamp","trackHistory"]},constraints:{entitiesRequireKey:true,operationsMustDeclareAction:true}};
    const service = new EntityDesignService({entities,useCases:new Map(),architecture:()=>architecture});
    const elementOrder = [{kind:"attribute",name:"thingId"},{kind:"relationship",name:"parts"},{kind:"attribute",name:"name"}];
    const result = service.update("Thing",{elementOrder,architectureFeatures:{auditStamp:false,trackHistory:false}});
    assert.deepEqual(result.entity.elementOrder,elementOrder);
    assert.deepEqual(JSON.parse(fs.readFileSync(file,"utf8")).elementOrder,elementOrder);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
