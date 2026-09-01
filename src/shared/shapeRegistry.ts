import type { GeometrySource } from "./geometry.js";
import type {
  ComponentShape,
  ComponentRotation,
  ComponentProfiles,
  ShapeProfilePoint,
  CadProfileCommand,
} from "./fes.js";
import type { PathCommand, PathRole, CadLayerId } from "./cad.js";

export interface ComponentCadPathResult {
  pathRole: PathRole;
  layer: CadLayerId;
  commands: PathCommand[];
  profileFallback: boolean;
  geometrySource?: GeometrySource;
  matchedProfileId?: string;
  missingProfiles?: string[];
}

export interface ShapeRegistryComponentInput {
  id: string;
  name?: string;
  type?: string;
  position: { x: number; y: number; z: number };
  size: { x: number; y: number; z: number };
  rotation?: ComponentRotation;
  profiles?: ComponentProfiles;
  shape?: ComponentShape;
  geometryMode?: string;
  loftGroup?: string;
  softGroup?: string;
}

/**
 * ShapeRegistry: Profile-Driven CAD Geometry Builder Engine.
 *
 * Converts normalized (0.0 - 1.0) CAD Profile Commands into engineering mm coordinates.
 */
export class ShapeRegistry {
  public static buildCadPathsForComponent(
    component: ShapeRegistryComponentInput,
    cadProfiles: CadProfileCommand[] = [],
    shapeProfiles: ShapeProfilePoint[] = [],
    view: "front" | "side" | "top" = "front"
  ): ComponentCadPathResult[] {
    const compId = component.id;
    const compType = component.type || "";
    const symGroup = component.shape?.symmetryGroup || "";
    const profs = component.profiles || {};
    const shapeRef = component.shape?.shapeRef || "";

    // Candidate profile IDs to search for
    const candidateProfileIds = new Set<string>();
    const expectedProfileIds: string[] = [];

    if (shapeRef) {
      candidateProfileIds.add(shapeRef);
      expectedProfileIds.push(shapeRef);
    }

    if (view === "front") {
      if (profs.front) { candidateProfileIds.add(profs.front); expectedProfileIds.push(profs.front); }
      if (profs.outer) { candidateProfileIds.add(profs.outer); expectedProfileIds.push(profs.outer); }
      if (profs.inner) candidateProfileIds.add(profs.inner);
      if (profs.seam) candidateProfileIds.add(profs.seam);
    } else if (view === "side") {
      if (profs.side) { candidateProfileIds.add(profs.side); expectedProfileIds.push(profs.side); }
      if (profs.outer) { candidateProfileIds.add(profs.outer); expectedProfileIds.push(profs.outer); }
      if (profs.inner) candidateProfileIds.add(profs.inner);
      if (profs.seam) candidateProfileIds.add(profs.seam);
    } else if (view === "top") {
      if (profs.top) { candidateProfileIds.add(profs.top); expectedProfileIds.push(profs.top); }
      if (profs.outer) { candidateProfileIds.add(profs.outer); expectedProfileIds.push(profs.outer); }
      if (profs.inner) candidateProfileIds.add(profs.inner);
      if (profs.seam) candidateProfileIds.add(profs.seam);
    }

    // Filter matching CAD profiles for this view
    const matchingCadProfiles = cadProfiles.filter((cp) => {
      if (cp.view !== view) return false;
      if (candidateProfileIds.has(cp.profileId)) return true;
      if (cp.profileId === compId) return true;
      const cpIdLower = cp.profileId.toLowerCase();
      const compIdLower = compId.toLowerCase();
      const baseCompId = compIdLower.split("-")[0]; // "arm", "seat", "back", "pillow"
      if (cpIdLower.includes(compIdLower) || cpIdLower.includes(baseCompId)) return true;
      if (cp.componentFamily && (cp.componentFamily === compType || cp.componentFamily === symGroup)) {
        return true;
      }
      return false;
    });

    if (matchingCadProfiles.length > 0) {
      // Group by (profileId, pathRole)
      const groups = new Map<string, CadProfileCommand[]>();
      for (const cmd of matchingCadProfiles) {
        const key = `${cmd.profileId}:${cmd.pathRole || "outer"}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(cmd);
      }

      const results: ComponentCadPathResult[] = [];

      for (const [groupKey, cmds] of groups) {
        cmds.sort((a, b) => a.sequence - b.sequence);
        const role: PathRole = cmds[0].pathRole || "outer";
        const mirrorAllowed = cmds.some((c) => c.mirrorAllowed);
        const matchedProfileId = cmds[0].profileId;

        const isRightSide =
          (symGroup === "ARM_PAIR" && component.position.x > 0) ||
          compId.toUpperCase().endsWith("-R") ||
          compId.toUpperCase().includes("RIGHT") ||
          (component.position.x > 0 && compType === "armrest");

        const isMirrored = mirrorAllowed && isRightSide;

        // View-specific dimensions and offsets
        let wH = component.size.x;
        let wV = component.size.z;
        let minH = component.position.x - wH / 2;
        let minV = component.position.z - wV / 2;
        let centerH = component.position.x;
        let centerV = component.position.z;
        let rotDeg = 0;

        if (view === "front") {
          wH = component.size.x;
          wV = component.size.z;
          minH = component.position.x - wH / 2;
          minV = component.position.z - wV / 2;
          centerH = component.position.x;
          centerV = component.position.z;
          rotDeg = component.rotation?.y || 0;
        } else if (view === "side") {
          wH = component.size.y;
          wV = component.size.z;
          minH = component.position.y - wH / 2;
          minV = component.position.z - wV / 2;
          centerH = component.position.y;
          centerV = component.position.z;
          rotDeg = component.rotation?.x || 0;
        } else if (view === "top") {
          wH = component.size.x;
          wV = component.size.y;
          minH = component.position.x - wH / 2;
          minV = component.position.y - wV / 2;
          centerH = component.position.x;
          centerV = component.position.y;
          rotDeg = component.rotation?.z || 0;
        }

        const angleRad = (rotDeg * Math.PI) / 180;

        const mapCoord = (u?: number, v?: number): { x: number; y: number } => {
          let uNum = u ?? 0;
          let vNum = v ?? 0;

          // If u/v are in engineering mm scale rather than normalized [0,1], convert
          if (Math.abs(uNum) > 2.0 && wH > 0) {
            uNum = (uNum - minH) / wH;
          }
          if (Math.abs(vNum) > 2.0 && wV > 0) {
            vNum = (vNum - minV) / wV;
          }

          const effectiveU = isMirrored ? 1.0 - uNum : uNum;
          let h = minH + effectiveU * wH;
          let vVal = minV + vNum * wV;

          if (angleRad !== 0) {
            const dh = h - centerH;
            const dv = vVal - centerV;
            const hRot = centerH + dh * Math.cos(angleRad) - dv * Math.sin(angleRad);
            const vRot = centerV + dh * Math.sin(angleRad) + dv * Math.cos(angleRad);
            h = hRot;
            vVal = vRot;
          }

          return { x: h, y: vVal };
        };

        const pathCommands: PathCommand[] = [];

        for (const c of cmds) {
          if (c.command === "moveTo") {
            const pt = mapCoord(c.x, c.y);
            pathCommands.push({ type: "moveTo", x: pt.x, y: pt.y });
          } else if (c.command === "lineTo") {
            const pt = mapCoord(c.x, c.y);
            pathCommands.push({ type: "lineTo", x: pt.x, y: pt.y });
          } else if (c.command === "quadraticTo") {
            const cp = mapCoord(c.cp1x, c.cp1y);
            const pt = mapCoord(c.x, c.y);
            pathCommands.push({ type: "quadraticTo", cpx: cp.x, cpy: cp.y, x: pt.x, y: pt.y });
          } else if (c.command === "cubicTo") {
            const cp1 = mapCoord(c.cp1x, c.cp1y);
            const cp2 = mapCoord(c.cp2x, c.cp2y);
            const pt = mapCoord(c.x, c.y);
            pathCommands.push({
              type: "cubicTo",
              cp1x: cp1.x,
              cp1y: cp1.y,
              cp2x: cp2.x,
              cp2y: cp2.y,
              x: pt.x,
              y: pt.y,
            });
          } else if (c.command === "close") {
            pathCommands.push({ type: "close" });
          }
        }

        if (pathCommands.length > 0) {
          const layer: CadLayerId =
            role === "outer"
              ? "COMPONENT_OUTLINE"
              : role === "inner"
              ? "INNER_CONTOUR"
              : role === "seam"
              ? "SEAM"
              : role === "piping"
              ? "PIPING"
              : role === "divider"
              ? "MODULE_DIVIDER"
              : "COMPONENT_OUTLINE";

          results.push({
            pathRole: role,
            layer,
            commands: pathCommands,
            profileFallback: false,
            geometrySource: component.geometryMode === "loft_shell" ? "workbook_loft" : "workbook_profile",
            matchedProfileId,
          });
        }
      }

      if (results.length > 0) return results;
    }

    // Check shapeProfiles
    if (shapeProfiles.length > 0) {
      for (const candId of candidateProfileIds) {
        const matchingPoints = shapeProfiles
          .filter((p) => p.profileId === candId && p.view === view)
          .sort((a, b) => a.pointIndex - b.pointIndex);

        if (matchingPoints.length >= 3) {
          let wH = component.size.x;
          let wV = component.size.z;
          let minH = component.position.x - wH / 2;
          let minV = component.position.z - wV / 2;
          if (view === "side") {
            wH = component.size.y;
            wV = component.size.z;
            minH = component.position.y - wH / 2;
            minV = component.position.z - wV / 2;
          } else if (view === "top") {
            wH = component.size.x;
            wV = component.size.y;
            minH = component.position.x - wH / 2;
            minV = component.position.y - wV / 2;
          }

          const isRightSide =
            (symGroup === "ARM_PAIR" && component.position.x > 0) ||
            compId.toUpperCase().endsWith("-R") ||
            compId.toUpperCase().includes("RIGHT") ||
            (component.position.x > 0 && compType === "armrest");

          const commands: PathCommand[] = [];
          matchingPoints.forEach((pt, idx) => {
            const uVal = isRightSide ? 1 - pt.u : pt.u;
            const px = minH + uVal * wH;
            const pz = minV + pt.v * wV;

            if (idx === 0) {
              commands.push({ type: "moveTo", x: px, y: pz });
            } else {
              commands.push({ type: "lineTo", x: px, y: pz });
            }
          });
          commands.push({ type: "close" });

          return [
            {
              pathRole: "outer",
              layer: "COMPONENT_OUTLINE",
              commands,
              profileFallback: false,
              geometrySource: "workbook_profile",
              matchedProfileId: candId,
            },
          ];
        }
      }
    }

    // Missing profile warnings if expectedProfileIds specified
    const missingProfiles = expectedProfileIds.filter((pid) => !candidateProfileIds.has(pid));

    // Fallback to ShapeRegistry built-in proxy geometry
    const fallbackCommands = ShapeRegistry.buildCadPathForShape(component, shapeProfiles, view);
    return [
      {
        pathRole: "outer",
        layer: "COMPONENT_OUTLINE",
        commands: fallbackCommands,
        profileFallback: true,
        geometrySource: "proxy_fallback",
        missingProfiles,
      },
    ];
  }

  public static buildCadPathForShape(
    component: ShapeRegistryComponentInput,
    shapeProfiles: ShapeProfilePoint[] = [],
    view: "front" | "side" | "top" = "front"
  ): PathCommand[] {
    const proxy = component.shape?.proxy || "box";
    const shapeRef = component.shape?.shapeRef;
    const shape = component.shape || { proxy: "box" };

    let w = component.size.x;
    let h = component.size.z;
    let minH = component.position.x - w / 2;
    let maxH = component.position.x + w / 2;
    let minV = component.position.z - h / 2;
    let maxV = component.position.z + h / 2;
    let centerH = component.position.x;
    let centerV = component.position.z;

    if (view === "side") {
      w = component.size.y;
      h = component.size.z;
      minH = component.position.y - w / 2;
      maxH = component.position.y + w / 2;
      minV = component.position.z - h / 2;
      maxV = component.position.z + h / 2;
      centerH = component.position.y;
      centerV = component.position.z;
    } else if (view === "top") {
      w = component.size.x;
      h = component.size.y;
      minH = component.position.x - w / 2;
      maxH = component.position.x + w / 2;
      minV = component.position.y - h / 2;
      maxV = component.position.y + h / 2;
      centerH = component.position.x;
      centerV = component.position.y;
    }

    // Check if custom profile in shapeProfiles matches shapeRef
    if (shapeRef && shapeProfiles.length > 0) {
      const matchingPoints = shapeProfiles
        .filter((p) => p.profileId === shapeRef && p.view === view)
        .sort((a, b) => a.pointIndex - b.pointIndex);

      if (matchingPoints.length >= 3) {
        const isRightMirrored = shape.symmetryGroup === "ARM_PAIR" && component.position.x > 0;
        const commands: PathCommand[] = [];

        matchingPoints.forEach((pt, idx) => {
          const uVal = isRightMirrored ? 1 - pt.u : pt.u;
          const px = minH + uVal * w;
          const pz = minV + pt.v * h;

          if (idx === 0) {
            commands.push({ type: "moveTo", x: px, y: pz });
          } else {
            commands.push({ type: "lineTo", x: px, y: pz });
          }
        });
        commands.push({ type: "close" });
        return commands;
      }
    }

    // Built-in Proxy Paths for views
    if (proxy === "rounded_box" || proxy === "soft_cushion" || proxy === "pillow") {
      const r = Math.min(shape.cornerRadius || 25, w / 3, h / 3);
      return [
        { type: "moveTo", x: minH + r, y: minV },
        { type: "lineTo", x: maxH - r, y: minV },
        { type: "quadraticTo", cpx: maxH, cpy: minV, x: maxH, y: minV + r },
        { type: "lineTo", x: maxH, y: maxV - r },
        { type: "quadraticTo", cpx: maxH, cpy: maxV, x: maxH - r, y: maxV },
        { type: "lineTo", x: minH + r, y: maxV },
        { type: "quadraticTo", cpx: minH, cpy: maxV, x: minH, y: maxV - r },
        { type: "lineTo", x: minH, y: minV + r },
        { type: "quadraticTo", cpx: minH, cpy: minV, x: minH + r, y: minV },
        { type: "close" },
      ];
    }

    if (proxy === "rounded_shell") {
      const r = Math.min(shape.cornerRadius || 35, w / 2, h / 2);
      const isLeft = component.position.x < 0 || component.id.toUpperCase().includes("L");

      if (isLeft) {
        return [
          { type: "moveTo", x: minH, y: minV },
          { type: "lineTo", x: maxH, y: minV },
          { type: "lineTo", x: maxH, y: maxV - 10 },
          { type: "quadraticTo", cpx: maxH, cpy: maxV, x: maxH - 10, y: maxV },
          { type: "lineTo", x: minH + r, y: maxV },
          { type: "quadraticTo", cpx: minH, cpy: maxV, x: minH, y: maxV - r },
          { type: "lineTo", x: minH, y: minV },
          { type: "close" },
        ];
      } else {
        return [
          { type: "moveTo", x: minH, y: minV },
          { type: "lineTo", x: maxH, y: minV },
          { type: "lineTo", x: maxH, y: maxV - r },
          { type: "quadraticTo", cpx: maxH, cpy: maxV, x: maxH - r, y: maxV },
          { type: "lineTo", x: minH + 10, y: maxV },
          { type: "quadraticTo", cpx: minH, cpy: maxV, x: minH, y: maxV - 10 },
          { type: "lineTo", x: minH, y: minV },
          { type: "close" },
        ];
      }
    }

    // Default: Box rectangle path
    return [
      { type: "moveTo", x: minH, y: minV },
      { type: "lineTo", x: maxH, y: minV },
      { type: "lineTo", x: maxH, y: maxV },
      { type: "lineTo", x: minH, y: maxV },
      { type: "close" },
    ];
  }
}
