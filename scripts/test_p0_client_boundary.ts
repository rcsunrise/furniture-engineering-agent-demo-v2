import fs from "fs";
import path from "path";

console.log("=== P0 Client-Server Boundary Verification Test ===");

const clientDir = path.join(process.cwd(), "src", "client");

function scanDirectory(dir: string): string[] {
  const violations: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      violations.push(...scanDirectory(fullPath));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      lines.forEach((line, lineIdx) => {
        if (/import.*from.*['"].*server\//.test(line) || /import.*from.*['"]\.\.\/server/.test(line)) {
          violations.push(`${fullPath}:${lineIdx + 1}: ${line.trim()}`);
        }
      });
    }
  }
  return violations;
}

const violations = scanDirectory(clientDir);

if (violations.length === 0) {
  console.log("✅ PASS: src/client/ contains zero imports from src/server/.");
} else {
  console.error("❌ FAIL: Found forbidden server imports in client code:");
  violations.forEach((v) => console.error("  ", v));
  process.exit(1);
}
