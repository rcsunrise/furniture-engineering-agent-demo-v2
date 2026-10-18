import type { GeometryProfileCandidate } from "../../../shared/geometryReconstruction.js";
import {
  validateGeometryProfileCandidate as sharedValidateGeometryProfileCandidate,
} from "../../../shared/profileReconstruction.js";

/**
 * Validates reconstructed profile candidate against engineering sanity rules.
 */
export function validateProfileCandidate(profile: GeometryProfileCandidate) {
  return sharedValidateGeometryProfileCandidate(profile);
}
