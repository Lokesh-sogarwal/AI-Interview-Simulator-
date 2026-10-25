/**
 * Minimal in-memory stand-in for the subset of the MongoDB driver API used by
 * the API routes under test. It supports the query/update operators those
 * routes rely on; anything else throws so tests fail loudly instead of passing
 * by accident.
 */
import { ObjectId } from "mongodb";

type Doc = Record<string, unknown>;

/** Deep clone that keeps ObjectId and Date instances (structuredClone drops ObjectId's prototype). */
function clone<T>(value: T): T {
  if (value instanceof ObjectId) return new ObjectId(value.toHexString()) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map(clone) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clone(v)])) as T;
  }
  return value;
}

function getPath(doc: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (Array.isArray(acc)) return acc.map((item) => (item as Doc)?.[key]);
    return acc && typeof acc === "object" ? (acc as Doc)[key] : undefined;
  }, doc);
}

function eq(a: unknown, b: unknown): boolean {
  if (a instanceof ObjectId || b instanceof ObjectId) return String(a) === String(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

function cmp(a: unknown, b: unknown) {
  const x = a instanceof Date ? a.getTime() : (a as number);
  const y = b instanceof Date ? b.getTime() : (b as number);
  return x < y ? -1 : x > y ? 1 : 0;
}

function matchValue(value: unknown, cond: unknown): boolean {
  // Like MongoDB, `{ field: null }` matches both null and a missing field.
  if (cond === null) return value === null || value === undefined;
  const values = Array.isArray(value) ? [value, ...value] : [value];
  if (cond && typeof cond === "object" && !(cond instanceof ObjectId) && !(cond instanceof Date) && !Array.isArray(cond)) {
    const ops = cond as Doc;
    const keys = Object.keys(ops);
    if (keys.length && keys.every((k) => k.startsWith("$"))) {
      return keys.every((op) => {
        const arg = ops[op];
        switch (op) {
          case "$in":
            return values.some((v) => (arg as unknown[]).some((a) => eq(v, a)));
          case "$nin":
            return !values.some((v) => (arg as unknown[]).some((a) => eq(v, a)));
          case "$ne":
            return !values.some((v) => eq(v, arg));
          case "$exists":
            return (value !== undefined) === Boolean(arg);
          case "$gt":
            return values.some((v) => v !== undefined && v !== null && cmp(v, arg) > 0);
          case "$gte":
            return values.some((v) => v !== undefined && v !== null && cmp(v, arg) >= 0);
          case "$lt":
            return values.some((v) => v !== undefined && v !== null && cmp(v, arg) < 0);
          case "$lte":
            return values.some((v) => v !== undefined && v !== null && cmp(v, arg) <= 0);
          case "$type":
            return arg === "string" ? typeof value === "string" : true;
          case "$elemMatch":
            return Array.isArray(value) && value.some((item) => matches(item as Doc, arg as Doc));
          case "$regex":
            return typeof value === "string" && new RegExp(String(arg), String(ops.$options ?? "")).test(value);
          case "$options":
            return true;
          case "$not":
            return !matchValue(value, arg);
          default:
            throw new Error(`fakeDb: unsupported operator ${op}`);
        }
      });
    }
  }
  return values.some((v) => eq(v, cond));
}

export function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Doc[]).some((f) => matches(doc, f));
    if (key === "$and") return (cond as Doc[]).every((f) => matches(doc, f));
    return matchValue(getPath(doc, key), cond);
  });
}

function setPath(doc: Doc, path: string, value: unknown) {
  const keys = path.split(".");
  let cur: Doc = doc;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k] as Doc;
  }
  cur[keys[keys.length - 1]] = value;
}

/** Resolves "arr.$" using the filter's "arr.<field>" condition (MongoDB positional operator). */
function resolvePositional(doc: Doc, path: string, filter: Doc) {
  if (!path.includes(".$")) return path;
  const [arrPath, rest] = path.split(".$");
  const arr = getPath(doc, arrPath);
  const key = Object.keys(filter).find((k) => k.startsWith(`${arrPath}.`));
  if (!Array.isArray(arr) || !key) throw new Error(`fakeDb: cannot resolve positional path ${path}`);
  const sub = key.slice(arrPath.length + 1);
  const index = arr.findIndex((el) => matchValue(getPath(el, sub), filter[key]));
  return `${arrPath}.${index}${rest}`;
}

function assertNoPathConflicts(update: Doc) {
  const paths = Object.values(update).flatMap((fields) => Object.keys(fields as Doc));
  for (let i = 0; i < paths.length; i += 1) {
    for (let j = i + 1; j < paths.length; j += 1) {
      const [a, b] = [paths[i], paths[j]];
      if (a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`)) {
        throw Object.assign(new Error(`Updating the path '${a}' would create a conflict at '${b}'`), { code: 40 });
      }
    }
  }
}

function applyUpdate(doc: Doc, update: Doc, filter: Doc = {}) {
  assertNoPathConflicts(update);
  for (const [op, fields] of Object.entries(update)) {
    for (const [rawPath, value] of Object.entries(fields as Doc)) {
      const path = resolvePositional(doc, rawPath, filter);
      switch (op) {
        case "$set":
          setPath(doc, path, value);
          break;
        case "$unset": {
          const keys = path.split(".");
          const parent = keys.length > 1 ? (getPath(doc, keys.slice(0, -1).join(".")) as Doc) : doc;
          if (parent) delete parent[keys[keys.length - 1]];
          break;
        }
        case "$inc":
          setPath(doc, path, (Number(getPath(doc, path)) || 0) + Number(value));
          break;
        case "$max": {
          const cur = getPath(doc, path);
          if (cur === undefined || cmp(value, cur) > 0) setPath(doc, path, value);
          break;
        }
        case "$push": {
          const list = Array.isArray(getPath(doc, path)) ? [...(getPath(doc, path) as unknown[])] : [];
          const spec = value as Doc;
          if (spec && typeof spec === "object" && "$each" in spec) {
            list.push(...(spec.$each as unknown[]));
            const slice = spec.$slice as number | undefined;
            setPath(doc, path, typeof slice === "number" ? list.slice(slice) : list);
          } else {
            list.push(value);
            setPath(doc, path, list);
          }
          break;
        }
        case "$addToSet": {
          const list = Array.isArray(getPath(doc, path)) ? [...(getPath(doc, path) as unknown[])] : [];
          if (!list.some((v) => eq(v, value))) list.push(value);
          setPath(doc, path, list);
          break;
        }
        default:
          throw new Error(`fakeDb: unsupported update operator ${op}`);
      }
    }
  }
}

function sortDocs(docs: Doc[], sort?: Record<string, 1 | -1>) {
  if (!sort) return docs;
  return [...docs].sort((a, b) => {
    for (const [k, dir] of Object.entries(sort)) {
      const c = cmp(getPath(a, k) ?? 0, getPath(b, k) ?? 0);
      if (c !== 0) return c * dir;
    }
    return 0;
  });
}

class Cursor {
  private sortSpec?: Record<string, 1 | -1>;
  private limitN?: number;
  private skipN = 0;
  constructor(private readonly docs: Doc[]) {}
  sort(spec: Record<string, 1 | -1>) {
    this.sortSpec = spec;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  skip(n: number) {
    this.skipN = n;
    return this;
  }
  project() {
    return this;
  }
  async toArray() {
    const sorted = sortDocs(this.docs, this.sortSpec).slice(this.skipN);
    return clone(this.limitN ? sorted.slice(0, this.limitN) : sorted);
  }
  async next() {
    return (await this.toArray())[0] ?? null;
  }
}

export class FakeCollection {
  docs: Doc[] = [];
  uniqueKeys: string[][] = [];

  async findOne(filter: Doc = {}) {
    const found = this.docs.find((d) => matches(d, filter));
    return found ? clone(found) : null;
  }
  find(filter: Doc = {}) {
    return new Cursor(this.docs.filter((d) => matches(d, filter)));
  }
  async insertOne(doc: Doc) {
    const withId = { _id: new ObjectId(), ...doc };
    for (const keys of this.uniqueKeys) {
      if (this.docs.some((d) => keys.every((k) => eq(getPath(d, k), getPath(withId, k))))) {
        throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      }
    }
    this.docs.push(withId);
    return { insertedId: withId._id };
  }
  async insertMany(docs: Doc[]) {
    const ids = [];
    for (const d of docs) ids.push((await this.insertOne(d)).insertedId);
    return { insertedIds: ids };
  }
  async updateOne(filter: Doc, update: Doc) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (!doc) return { matchedCount: 0, modifiedCount: 0 };
    applyUpdate(doc, update, filter);
    return { matchedCount: 1, modifiedCount: 1 };
  }
  async deleteOne(filter: Doc) {
    const index = this.docs.findIndex((d) => matches(d, filter));
    if (index >= 0) this.docs.splice(index, 1);
    return { deletedCount: index >= 0 ? 1 : 0 };
  }
  async deleteMany(filter: Doc = {}) {
    const before = this.docs.length;
    this.docs = this.docs.filter((d) => !matches(d, filter));
    return { deletedCount: before - this.docs.length };
  }
  async countDocuments(filter: Doc = {}) {
    return this.docs.filter((d) => matches(d, filter)).length;
  }
  async distinct(field: string, filter: Doc = {}) {
    const out: unknown[] = [];
    for (const d of this.docs.filter((x) => matches(x, filter))) {
      const v = getPath(d, field);
      if (!out.some((o) => eq(o, v))) out.push(v);
    }
    return out;
  }
  async createIndex() {
    return "ok";
  }
  aggregate() {
    throw new Error("fakeDb: aggregate is not supported");
  }
}

export class FakeDb {
  private collections = new Map<string, FakeCollection>();
  collection(name: string) {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection());
    return this.collections.get(name)!;
  }
}
