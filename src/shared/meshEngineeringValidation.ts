export type EngineeringMatchStatus = "PASS" | "WARNING" | "FAIL" | "UNBOUND";

export interface AxisTolerance {
  warningPercent: number;
  failPercent: number;
  warningMm: number;
  failMm: number;
}

export interface EngineeringValidationTolerance {
  dimension: AxisTolerance;
  position: AxisTolerance;
  rotationWarningDeg: number;
  rotationFailDeg: number;
}

export const DEFAULT_ENGINEERING_VALIDATION_TOLERANCE: EngineeringValidationTolerance = {
  dimension: {
    warningPercent: 3,
    failPercent: 8,
    warningMm: 15,
    failMm: 40,
  },
  position: {
    warningPercent: 2,
    failPercent: 5,
    warningMm: 10,
    failMm: 30,
  },
  rotationWarningDeg: 2,
  rotationFailDeg: 5,
};

export interface Vec3Measurement {
  x: number;
  y: number;
  z: number;
}

export interface DimensionTarget {
  x: number;
  y: number;
  z: number;
}

export interface AxisResidual {
  target: number;
  actual: number;
  delta: number;
  absDelta: number;
  errorPercent: number;
  status: EngineeringMatchStatus;
}

export interface ComponentEngineeringValidation {
  componentId: string;
  objectName: string;
  status: EngineeringMatchStatus;
  score: number;
  dimensions: {
    x: AxisResidual;
    y: AxisResidual;
    z: AxisResidual;
  };
  position?: {
    x: AxisResidual;
    y: AxisResidual;
    z: AxisResidual;
  };
  rotation?: {
    x: AxisResidual;
    y: AxisResidual;
    z: AxisResidual;
  };
  notes: string[];
}

function safePercent(delta: number, target: number): number {
  if (!Number.isFinite(delta) || !Number.isFinite(target)) return 100;
  const denom = Math.max(Math.abs(target), 1e-6);
  return Math.abs(delta) / denom * 100;
}

function residualStatus(
  target: number,
  actual: number,
  tolerance: AxisTolerance,
): AxisResidual {
  const delta = actual - target;
  const absDelta = Math.abs(delta);
  const errorPercent = safePercent(delta, target);

  const percentApplicable = Math.abs(target) >= 100;
  let status: EngineeringMatchStatus = "PASS";
  if (absDelta > tolerance.failMm || (percentApplicable && errorPercent > tolerance.failPercent)) {
    status = "FAIL";
  } else if (absDelta > tolerance.warningMm || (percentApplicable && errorPercent > tolerance.warningPercent)) {
    status = "WARNING";
  }

  return { target, actual, delta, absDelta, errorPercent, status };
}

function rotationResidual(target: number, actual: number, warningDeg: number, failDeg: number): AxisResidual {
  let delta = actual - target;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  const absDelta = Math.abs(delta);
  const errorPercent = safePercent(delta, Math.max(Math.abs(target), 1));
  const status: EngineeringMatchStatus = absDelta > failDeg ? "FAIL" : absDelta > warningDeg ? "WARNING" : "PASS";
  return { target, actual, delta, absDelta, errorPercent, status };
}

function worstStatus(statuses: EngineeringMatchStatus[]): EngineeringMatchStatus {
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("WARNING")) return "WARNING";
  if (statuses.includes("UNBOUND")) return "UNBOUND";
  return "PASS";
}

function scoreFromResiduals(residuals: AxisResidual[]): number {
  if (residuals.length === 0) return 0;
  const penalties = residuals.map((r) => {
    if (r.status === "FAIL") return Math.min(100, 55 + r.errorPercent * 2);
    if (r.status === "WARNING") return Math.min(50, 20 + r.errorPercent * 2);
    return Math.min(20, r.errorPercent * 2);
  });
  const avgPenalty = penalties.reduce((a, b) => a + b, 0) / penalties.length;
  return Math.max(0, Math.round((100 - avgPenalty) * 10) / 10);
}

export function validateComponentEngineering(params: {
  componentId: string;
  objectName: string;
  targetSize: DimensionTarget;
  actualSize: Vec3Measurement;
  targetPosition?: Vec3Measurement;
  actualPosition?: Vec3Measurement;
  targetRotationDeg?: Vec3Measurement;
  actualRotationDeg?: Vec3Measurement;
  tolerance?: EngineeringValidationTolerance;
}): ComponentEngineeringValidation {
  const tolerance = params.tolerance || DEFAULT_ENGINEERING_VALIDATION_TOLERANCE;

  const dimensions = {
    x: residualStatus(params.targetSize.x, params.actualSize.x, tolerance.dimension),
    y: residualStatus(params.targetSize.y, params.actualSize.y, tolerance.dimension),
    z: residualStatus(params.targetSize.z, params.actualSize.z, tolerance.dimension),
  };

  const position = params.targetPosition && params.actualPosition ? {
    x: residualStatus(params.targetPosition.x, params.actualPosition.x, tolerance.position),
    y: residualStatus(params.targetPosition.y, params.actualPosition.y, tolerance.position),
    z: residualStatus(params.targetPosition.z, params.actualPosition.z, tolerance.position),
  } : undefined;

  const rotation = params.targetRotationDeg && params.actualRotationDeg ? {
    x: rotationResidual(params.targetRotationDeg.x, params.actualRotationDeg.x, tolerance.rotationWarningDeg, tolerance.rotationFailDeg),
    y: rotationResidual(params.targetRotationDeg.y, params.actualRotationDeg.y, tolerance.rotationWarningDeg, tolerance.rotationFailDeg),
    z: rotationResidual(params.targetRotationDeg.z, params.actualRotationDeg.z, tolerance.rotationWarningDeg, tolerance.rotationFailDeg),
  } : undefined;

  const allResiduals = [
    ...Object.values(dimensions),
    ...(position ? Object.values(position) : []),
    ...(rotation ? Object.values(rotation) : []),
  ];

  const status = worstStatus(allResiduals.map((r) => r.status));
  const notes: string[] = [];
  if (!position) notes.push("Position validation skipped: no comparable engineering origin supplied.");
  if (!rotation) notes.push("Rotation validation skipped: no comparable engineering rotation supplied.");

  return {
    componentId: params.componentId,
    objectName: params.objectName,
    status,
    score: scoreFromResiduals(allResiduals),
    dimensions,
    position,
    rotation,
    notes,
  };
}

export function normalizeEngineeringId(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
