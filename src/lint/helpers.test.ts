import test from "tape";
import { makeArrayLint, makeObjectLint, makeTypeLint } from "./helpers.ts";
import { GEOMETRY_TYPES } from "./const.ts";
import { ctx } from "./test/helpers.ts";
import { Severity } from "./types.ts";

/** Extract severity from a test return (handles both bare Severity and tuple) */
function sev(result: Severity | [Severity, string?]): Severity {
  return Array.isArray(result) ? result[0] : result;
}

test("makeArrayLint", (t) => {
  const lint = makeArrayLint("features", { ref: "RFC7946 3.3" });

  t.equal(lint.name, "features-is-array", "name");
  t.equal(lint.tag, "Schema", "tag");

  t.test("pass: array", (t) => {
    t.equal(sev(lint.test([], ctx())), Severity.Ok);
    t.end();
  });

  t.test("fail: undefined", (t) => {
    t.equal(sev(lint.test(undefined, ctx())), Severity.Error);
    t.end();
  });

  t.test("fail: wrong type", (t) => {
    t.equal(sev(lint.test("string", ctx())), Severity.Error);
    t.end();
  });

  t.end();
});

test("makeObjectLint", (t) => {
  const lint = makeObjectLint("properties");

  t.test("pass: object", (t) => {
    t.equal(sev(lint.test({}, ctx())), Severity.Ok);
    t.end();
  });

  t.test("fail: undefined", (t) => {
    t.equal(sev(lint.test(undefined, ctx())), Severity.Error);
    t.end();
  });

  t.test("fail: array", (t) => {
    t.equal(sev(lint.test([], ctx())), Severity.Error);
    t.end();
  });

  t.test("fail: primitive", (t) => {
    t.equal(sev(lint.test(42, ctx())), Severity.Error);
    t.end();
  });

  t.test("fail: null without nullable", (t) => {
    t.equal(sev(lint.test(null, ctx())), Severity.Error);
    t.end();
  });

  t.test("pass: null with nullable", (t) => {
    const nullable = makeObjectLint("geometry", { nullable: true });
    t.equal(sev(nullable.test(null, ctx())), Severity.Ok);
    t.end();
  });

  t.end();
});

test("makeTypeLint (single)", (t) => {
  const lint = makeTypeLint("Feature");

  t.test("pass: matching type", (t) => {
    t.equal(sev(lint.test("Feature", ctx())), Severity.Ok);
    t.end();
  });

  t.test("fail: wrong type string", (t) => {
    t.equal(sev(lint.test("Wrong", ctx())), Severity.Error);
    t.end();
  });

  t.test("fail: non-string", (t) => {
    t.equal(sev(lint.test(42, ctx())), Severity.Error);
    t.end();
  });

  t.end();
});

test("makeTypeLint (multi)", (t) => {
  const lint = makeTypeLint(GEOMETRY_TYPES, "geometry", "a geometry type");

  t.test("pass: valid geometry type", (t) => {
    t.equal(sev(lint.test("Point", ctx())), Severity.Ok);
    t.end();
  });

  t.test("fail: non-geometry type", (t) => {
    t.equal(sev(lint.test("Feature", ctx())), Severity.Error);
    t.end();
  });

  t.end();
});
