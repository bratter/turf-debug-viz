import test from "tape";
import { makeArrayLint, makeObjectLint, makeTypeLint } from "./helpers.ts";
import { GEOMETRY_TYPES } from "./const.ts";
import { Severity } from "./types.ts";
import { createContext } from "./builder.ts";

const ctx = createContext();

test("makeArrayLint", (t) => {
  const lint = makeArrayLint("features", { ref: "RFC7946 3.3" });

  t.equal(lint.name, "features-is-array", "name");
  t.equal(lint.severity, Severity.Error, "severity");
  t.equal(lint.tag, "Schema", "tag");

  t.test("pass: array", (t) => {
    t.equal(lint.test([], ctx), true);
    t.end();
  });

  t.test("fail: undefined", (t) => {
    t.equal(typeof lint.test(undefined, ctx), "string");
    t.end();
  });

  t.test("fail: wrong type", (t) => {
    t.equal(typeof lint.test("string", ctx), "string");
    t.end();
  });

  t.end();
});

test("makeObjectLint", (t) => {
  const lint = makeObjectLint("properties");

  t.test("pass: object", (t) => {
    t.equal(lint.test({}, ctx), true);
    t.end();
  });

  t.test("fail: undefined", (t) => {
    t.equal(typeof lint.test(undefined, ctx), "string");
    t.end();
  });

  t.test("fail: array", (t) => {
    t.equal(typeof lint.test([], ctx), "string");
    t.end();
  });

  t.test("fail: primitive", (t) => {
    t.equal(typeof lint.test(42, ctx), "string");
    t.end();
  });

  t.test("fail: null without nullable", (t) => {
    t.equal(typeof lint.test(null, ctx), "string");
    t.end();
  });

  t.test("pass: null with nullable", (t) => {
    const nullable = makeObjectLint("geometry", { nullable: true });
    t.equal(nullable.test(null, ctx), true);
    t.end();
  });

  t.end();
});

test("makeTypeLint (single)", (t) => {
  const lint = makeTypeLint("Feature");

  t.test("pass: matching type", (t) => {
    t.equal(lint.test("Feature", ctx), true);
    t.end();
  });

  t.test("fail: wrong type string", (t) => {
    t.equal(typeof lint.test("Wrong", ctx), "string");
    t.end();
  });

  t.test("fail: non-string", (t) => {
    t.equal(typeof lint.test(42, ctx), "string");
    t.end();
  });

  t.end();
});

test("makeTypeLint (multi)", (t) => {
  const lint = makeTypeLint(GEOMETRY_TYPES, "geometry", "a geometry type");

  t.test("pass: valid geometry type", (t) => {
    t.equal(lint.test("Point", ctx), true);
    t.end();
  });

  t.test("fail: non-geometry type", (t) => {
    t.equal(typeof lint.test("Feature", ctx), "string");
    t.end();
  });

  t.end();
});
