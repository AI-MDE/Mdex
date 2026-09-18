import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStore } from "../src/store.js";

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
