import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

const sampleDir = path.join(process.cwd(), "sample");
if (!fs.existsSync(sampleDir)) {
  fs.mkdirSync(sampleDir, { recursive: true });
}

function saveWorkbook(wb: XLSX.WorkBook, filePath: string) {
  XLSX.writeFile(wb, filePath);
}

function makeProductSheet(width = 1000, depth = 900, height = 800, sku = "SOFA-TEST") {
  return XLSX.utils.json_to_sheet([
    { key: "sku", value: sku },
    { key: "product_type", value: "sofa" },
    { key: "overall_width", value: width },
    { key: "overall_depth", value: depth },
    { key: "overall_height", value: height },
  ]);
}

// 1. engineering_valid.xlsx
const wb1 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb1, makeProductSheet(1000, 900, 800, "VALID-01"), "Product");
XLSX.utils.book_append_sheet(
  wb1,
  XLSX.utils.json_to_sheet([
    { id: "FRAME-1", name: "Frame", type: "frame", size_x: 900, size_y: 700, size_z: 100, pos_x: 0, pos_y: 0, pos_z: 50, explode_x: 0, explode_y: 0, explode_z: 0 },
    { id: "SEAT-1", name: "Seat Cushion", type: "seat", size_x: 800, size_y: 600, size_z: 150, pos_x: 0, pos_y: -20, pos_z: 175, explode_x: 0, explode_y: 0, explode_z: 0 },
  ]),
  "Components"
);
saveWorkbook(wb1, path.join(sampleDir, "engineering_valid.xlsx"));

// 2. out_of_bounds_x.xlsx
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, makeProductSheet(1000, 900, 800, "OOB-X"), "Product");
XLSX.utils.book_append_sheet(
  wb2,
  XLSX.utils.json_to_sheet([
    { id: "ARM-L", name: "Left Arm", type: "armrest", size_x: 200, size_y: 700, size_z: 400, pos_x: -450, pos_y: 0, pos_z: 300, explode_x: 0, explode_y: 0, explode_z: 0 },
  ]),
  "Components"
);
saveWorkbook(wb2, path.join(sampleDir, "out_of_bounds_x.xlsx"));

// 3. out_of_bounds_z.xlsx
const wb3 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb3, makeProductSheet(1000, 900, 800, "OOB-Z"), "Product");
XLSX.utils.book_append_sheet(
  wb3,
  XLSX.utils.json_to_sheet([
    { id: "BACK-1", name: "Backrest", type: "backrest", size_x: 800, size_y: 200, size_z: 500, pos_x: 0, pos_y: 200, pos_z: 600, explode_x: 0, explode_y: 0, explode_z: 0 },
  ]),
  "Components"
);
saveWorkbook(wb3, path.join(sampleDir, "out_of_bounds_z.xlsx"));

// 4. duplicate_id.xlsx
const wb4 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb4, makeProductSheet(1000, 900, 800, "DUP-ID"), "Product");
XLSX.utils.book_append_sheet(
  wb4,
  XLSX.utils.json_to_sheet([
    { id: "LEG-1", name: "Leg 1", type: "leg", size_x: 50, size_y: 50, size_z: 100, pos_x: -400, pos_y: -350, pos_z: 50, explode_x: 0, explode_y: 0, explode_z: 0 },
    { id: "LEG-1", name: "Leg 2", type: "leg", size_x: 50, size_y: 50, size_z: 100, pos_x: 400, pos_y: -350, pos_z: 50, explode_x: 0, explode_y: 0, explode_z: 0 },
  ]),
  "Components"
);
saveWorkbook(wb4, path.join(sampleDir, "duplicate_id.xlsx"));

// 5. zero_size.xlsx
const wb5 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb5, makeProductSheet(1000, 900, 800, "ZERO-SZ"), "Product");
XLSX.utils.book_append_sheet(
  wb5,
  XLSX.utils.json_to_sheet([
    { id: "HARDWARE-1", name: "Bracket", type: "hardware", size_x: 10, size_y: 10, size_z: 0, pos_x: 0, pos_y: 0, pos_z: 50, explode_x: 0, explode_y: 0, explode_z: 0 },
  ]),
  "Components"
);
saveWorkbook(wb5, path.join(sampleDir, "zero_size.xlsx"));

console.log("Created 5 G1-2 test excel files in /sample");
