import { validateComponentEngineering, normalizeEngineeringId } from "../src/shared/meshEngineeringValidation.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const report = validateComponentEngineering({
  componentId: "SEAT-002",
  objectName: "SEAT-002",
  targetSize: { x: 760, y: 690, z: 190 },
  actualSize: { x: 758, y: 686, z: 193 },
  targetPosition: { x: 0, y: 350, z: 450 },
  actualPosition: { x: 1, y: 354, z: 448 },
  targetRotationDeg: { x: 0, y: 0, z: 0 },
  actualRotationDeg: { x: 0.2, y: 0, z: -0.1 },
});

assert(report.status === "PASS", `expected PASS, got ${report.status}`);
assert(report.score > 90, `expected score > 90, got ${report.score}`);
assert(normalizeEngineeringId(" seat_002 ") === "SEAT-002", "id normalization failed");

const fail = validateComponentEngineering({
  componentId: "ARM-R",
  objectName: "ARM-R",
  targetSize: { x: 250, y: 980, z: 470 },
  actualSize: { x: 251, y: 828, z: 465 },
});
assert(fail.status === "FAIL", `expected FAIL, got ${fail.status}`);

console.log("G4-6 engineering validation PASS", { pass: report, fail });
