import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const path = new URL(
  "../../src/utils/profileCosmeticStorage.ts",
  import.meta.url,
);
const source = ts.createSourceFile(
  path.pathname,
  readFileSync(path, "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) &&
    statement.name?.text === "createProfileCosmeticWrites",
);
assert.ok(declaration);
const { outputText } = ts.transpileModule(
  declaration.getText(source).replace(/^export /, ""),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
);

export const bindProfileCosmeticStorage = new Function(
  "storage",
  "localStorage",
  `${outputText}\nreturn createProfileCosmeticWrites;`,
);
