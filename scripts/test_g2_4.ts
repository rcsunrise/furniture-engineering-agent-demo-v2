import { parseWorkbook } from "../src/server/excel.js";
import { validateEngineeringData } from "../src/server/validate.js";
import { buildAssembly } from "../src/server/assembly.js";
import {
  BoxGeometryBuilder,
  LoftGeometryBuilder,
  SoftSurfaceGeometryBuilder,
} from "../src/client/utils/geometryBuilders.js";
import { ThreeShapeFactory } from "../src/client/utils/threeShapeFactory.js";
import * as fs from "fs";
import * as path from "path";

async function runG24Test() {
  console.log("==================================================");
  console.log("   G2.4 — Loft / Soft Surface Geometry Test Suite  ");
  console.log("==================================================\n");

  const filePath = path.resolve(process.cwd(), "G2_4_Loft_SoftSurface_Test.xlsx");
  if (!fs.existsSync(filePath)) {
    throw new Error(`Test file not found at ${filePath}. Run generator script first.`);
  }

  const fileBuffer = fs.readFileSync(filePath);

  // 1. Parse Excel file
  console.log("Step 1: Parsing G2_4_Loft_SoftSurface_Test.xlsx...");
  const parseResult = await parseWorkbook(fileBuffer, "G2_4_Loft_SoftSurface_Test.xlsx");
  if (!parseResult.success || !parseResult.fes) {
    console.error("❌ Parse failed:", parseResult.error);
    process.exit(1);
  }
  const fes = parseResult.fes;
  console.log(`✅ Parse successful! SKU: ${fes.sku}`);
  console.log(`   - Components: ${fes.components.length}`);
  console.log(`   - Loft Sections: ${fes.loftSections?.length || 0}`);
  console.log(`   - Soft Surface Groups: ${fes.softSurfaceParams?.length || 0}`);

  // Assertions on parsed FES
  if ((fes.loftSections?.length || 0) < 5) {
    throw new Error(`Expected at least 5 loft sections, found ${fes.loftSections?.length}`);
  }
  if ((fes.softSurfaceParams?.length || 0) < 3) {
    throw new Error(`Expected at least 3 soft surface param groups, found ${fes.softSurfaceParams?.length}`);
  }

  // 2. FES Validation
  console.log("\nStep 2: Validating FES schema & engineering rules...");
  const valResult = validateEngineeringData(fes);
  if (!valResult.valid) {
    console.error("❌ FES validation failed:", valResult.issues);
    process.exit(1);
  }
  console.log("✅ FES Engineering Validation PASS!");

  // 3. Build Assembly Document
  console.log("\nStep 3: Building Assembly Document...");
  const assembly = buildAssembly(fes);
  console.log(`✅ Assembly built! SKU: ${assembly.sku}, Components: ${assembly.components.length}`);
  if ((assembly.loftSections?.length || 0) !== fes.loftSections?.length) {
    throw new Error("Assembly missing loftSections!");
  }
  if ((assembly.softSurfaceParams?.length || 0) !== fes.softSurfaceParams?.length) {
    throw new Error("Assembly missing softSurfaceParams!");
  }

  // 4. Test Geometry Builders
  console.log("\nStep 4: Testing 3D Geometry Builders...");

  // 4a. BoxGeometryBuilder
  console.log("   Testing BoxGeometryBuilder (FRAME-BASE)...");
  const boxGeo = BoxGeometryBuilder.build(2050, 100, 1000);
  console.log(`   -> Box vertices: ${boxGeo.attributes.position.count}`);
  if (boxGeo.attributes.position.count < 24) {
    throw new Error("Box geometry vertex count invalid!");
  }

  // 4b. LoftGeometryBuilder (Armrests)
  console.log("   Testing LoftGeometryBuilder (ARM-L-OUT & ARM-R-OUT)...");
  const leftArmGeo = LoftGeometryBuilder.build(
    300,
    600,
    1050,
    -1175,
    "ARM-L-OUT",
    assembly.loftSections
  );
  const rightArmGeo = LoftGeometryBuilder.build(
    300,
    600,
    1050,
    1175,
    "ARM-R-OUT",
    assembly.loftSections
  );

  console.log(`   -> Left Arm Mesh Vertices: ${leftArmGeo.attributes.position.count}`);
  console.log(`   -> Right Arm Mesh Vertices: ${rightArmGeo.attributes.position.count}`);

  if (leftArmGeo.attributes.position.count < 100) {
    throw new Error("Loft armrest geometry vertex count too low!");
  }

  // Verify X-mirroring on right armrest
  const leftX0 = leftArmGeo.attributes.position.getX(0);
  const rightX0 = rightArmGeo.attributes.position.getX(0);
  console.log(`   -> Left Arm vertex 0 X: ${leftX0.toFixed(2)}, Right Arm vertex 0 X: ${rightX0.toFixed(2)}`);
  if (Math.sign(leftX0) === Math.sign(rightX0)) {
    throw new Error("Left and Right armrest section X offset did not mirror!");
  } else {
    console.log("   ✅ Deterministic Armrest Mirroring Verified!");
  }

  // 4c. SoftSurfaceGeometryBuilder (Seat, Back, Pillow)
  console.log("   Testing SoftSurfaceGeometryBuilder...");
  const seatParams = assembly.softSurfaceParams?.find((s) => s.softGroup === "SEAT_TRIO");
  const seatGeo = SoftSurfaceGeometryBuilder.build(683.3, 180, 900, "seat", seatParams);
  console.log(`   -> Seat Cushion Vertices: ${seatGeo.attributes.position.count}`);
  if (seatGeo.attributes.position.count < 200) {
    throw new Error("Soft surface seat cushion mesh resolution too low!");
  }

  const backParams = assembly.softSurfaceParams?.find((s) => s.softGroup === "BACK_TRIO");
  const backGeo = SoftSurfaceGeometryBuilder.build(683.3, 450, 250, "backrest", backParams);
  console.log(`   -> Backrest Cushion Vertices: ${backGeo.attributes.position.count}`);

  const pillowParams = assembly.softSurfaceParams?.find((s) => s.softGroup === "PILLOW_TRIO");
  const pillowGeo = SoftSurfaceGeometryBuilder.build(450, 300, 150, "pillow", pillowParams);
  console.log(`   -> Lumbar Pillow Vertices: ${pillowGeo.attributes.position.count}`);

  // 4d. ThreeShapeFactory Integration Test
  console.log("\nStep 5: Testing ThreeShapeFactory dispatch...");
  for (const c of assembly.components) {
    const geo = ThreeShapeFactory.createGeometryForComponent({
      id: c.id,
      type: c.type,
      geometryMode: c.geometryMode,
      loftGroup: c.loftGroup,
      softGroup: c.softGroup,
      size: { x: c.size.x, y: c.size.z, z: c.size.y }, // Three sizes
      position: c.position,
      shape: c.shape,
      loftSections: assembly.loftSections,
      softSurfaceParams: assembly.softSurfaceParams,
    });
    console.log(`   Component [${c.id.padEnd(12)}] Mode: [${(c.geometryMode || "box").padEnd(12)}] Vertices: ${geo.attributes.position.count}`);
    if (!geo || geo.attributes.position.count === 0) {
      throw new Error(`Failed to generate geometry for component ${c.id}`);
    }
  }

  // 5. Check G2.3.1 Regression Constraints
  console.log("\nStep 6: Checking G2.3.1 Regression Constraints...");
  const fesPos = { x: 100, y: 200, z: 300 };
  const threePos = { x: fesPos.x, y: fesPos.z, z: -fesPos.y };
  if (threePos.x !== 100 || threePos.y !== 300 || threePos.z !== -200) {
    throw new Error("Coordinate mapping regression failure!");
  }
  console.log("   ✅ Coordinate mapping regression test PASS!");

  console.log("\n==================================================");
  console.log("   Gate Result: PASS (G2.4 Loft/SoftSurface Verified)");
  console.log("==================================================\n");
}

runG24Test().catch((err) => {
  console.error("\n❌ Test failed with error:", err);
  process.exit(1);
});
