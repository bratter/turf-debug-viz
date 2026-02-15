import test from "tape";
import { makeArrayLint, makeObjectLint, makeTypeLint } from "./helpers.ts";
import { GEOMETRY_TYPES } from "./const.ts";
import { Severity } from "./types.ts";

test("makeArrayLint", (t) => {
  const lint = makeArrayLint("features", { ref: "RFC7946 3.3" });

  t.equal(lint.name, "features-is-array", "name");
  t.equal(lint.severity, Severity.Error, "severity");
  t.equal(lint.tag, "Schema", "tag");

  t.test("pass: array", (t) => {
    t.equal(lint.test([]), undefined);
    t.end();
  });

  t.test("fail: undefined", (t) => {
    t.equal(typeof lint.test(undefined), "string");
    t.end();
  });

  t.test("fail: wrong type", (t) => {
    t.equal(typeof lint.test("string"), "string");
    t.end();
  });

  t.end();
});

test("makeObjectLint", (t) => {
  const lint = makeObjectLint("properties");

  t.test("pass: object", (t) => {
    t.equal(lint.test({}), undefined);
    t.end();
  });

  t.test("fail: undefined", (t) => {
    t.equal(typeof lint.test(undefined), "string");
    t.end();
  });

  t.test("fail: array", (t) => {
    t.equal(typeof lint.test([]), "string");
    t.end();
  });

  t.test("fail: primitive", (t) => {
    t.equal(typeof lint.test(42), "string");
    t.end();
  });

  t.test("fail: null without nullable", (t) => {
    t.equal(typeof lint.test(null), "string");
    t.end();
  });

  t.test("pass: null with nullable", (t) => {
    const nullable = makeObjectLint("geometry", { nullable: true });
    t.equal(nullable.test(null), undefined);
    t.end();
  });

  t.end();
});

test("makeTypeLint (single)", (t) => {
  const lint = makeTypeLint("Feature");

  t.test("pass: matching type", (t) => {
    t.equal(lint.test("Feature"), undefined);
    t.end();
  });

  t.test("fail: wrong type string", (t) => {
    t.equal(typeof lint.test("Wrong"), "string");
    t.end();
  });

  t.test("fail: non-string", (t) => {
    t.equal(typeof lint.test(42), "string");
    t.end();
  });

  t.end();
});

test("makeTypeLint (multi)", (t) => {
  const lint = makeTypeLint(GEOMETRY_TYPES, "geometry", "a geometry type");

  t.test("pass: valid geometry type", (t) => {
    t.equal(lint.test("Point"), undefined);
    t.end();
  });

  t.test("fail: non-geometry type", (t) => {
    t.equal(typeof lint.test("Feature"), "string");
    t.end();
  });

  t.end();
});
