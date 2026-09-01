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

// 1. valid.xlsx
const wb1 = XLSX.utils.book_new();
const productData1 = [
  { key: "sku", value: "TEST-SOFA-001" },
  { key: "product_type", value: "sofa" },
  { key: "overall_width", value: 1200 },
  { key: "overall_depth", value: 850 },
  { key: "overall_height", value: 900 },
];
const compData1 = [
  { id: "FRAME-01", name: "Main Frame", type: "frame", material: "oak", size_x: 1100, size_y: 800, size_z: 200, pos_x: 0, pos_y: 0, pos_z: 100, explode_x: 0, explode_y: 0, explode_z: 0 },
  { id: "SEAT-01", name: "Cushion", type: "seat", material: "foam", size_x: 1000, size_y: 700, size_z: 150, pos_x: 0, pos_y: 0, pos_z: 300, explode_x: 0, explode_y: 0, explode_z: 200 },
];
XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(productData1), "Product");
XLSX.utils.book_append_sheet(wb1, XLSX.utils.json_to_sheet(compData1), "Components");
saveWorkbook(wb1, path.join(sampleDir, "valid.xlsx"));

// 2. missing_required.xlsx (missing overall_width)
const wb2 = XLSX.utils.book_new();
const productData2 = [
  { key: "sku", value: "TEST-SOFA-002" },
  { key: "product_type", value: "sofa" },
  // overall_width omitted
  { key: "overall_depth", value: 850 },
  { key: "overall_height", value: 900 },
];
XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(productData2), "Product");
XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(compData1), "Components");
saveWorkbook(wb2, path.join(sampleDir, "missing_required.xlsx"));

// 3. invalid_number.xlsx (size_x = "abc")
const wb3 = XLSX.utils.book_new();
const compData3 = [
  { id: "FRAME-01", name: "Main Frame", type: "frame", material: "oak", size_x: "abc", size_y: 800, size_z: 200, pos_x: 0, pos_y: 0, pos_z: 100, explode_x: 0, explode_y: 0, explode_z: 0 },
];
XLSX.utils.book_append_sheet(wb3, XLSX.utils.json_to_sheet(productData1), "Product");
XLSX.utils.book_append_sheet(wb3, XLSX.utils.json_to_sheet(compData3), "Components");
saveWorkbook(wb3, path.join(sampleDir, "invalid_number.xlsx"));

console.log("Successfully created valid.xlsx, missing_required.xlsx, invalid_number.xlsx in /sample");
