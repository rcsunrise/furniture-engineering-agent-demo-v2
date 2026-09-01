import * as XLSX from "xlsx";
import { FurnitureEngineeringSchema, type FurnitureEngineeringData } from "../shared/fes.js";

export type ParseResult =
  | { success: true; fes: FurnitureEngineeringData }
  | { success: false; error: string; details?: unknown[] };

function parseRequiredString(val: unknown, fieldName: string): string {
  if (val === undefined || val === null) {
    throw new Error(`Missing required field: '${fieldName}'`);
  }
  const s = String(val).trim();
  if (!s) {
    throw new Error(`Required field '${fieldName}' cannot be empty`);
  }
  return s;
}

function parseNumberField(val: unknown, fieldName: string, required = true): number {
  if (val === undefined || val === null || String(val).trim() === "") {
    if (!required) return 0;
    throw new Error(`Missing required numeric field: '${fieldName}'`);
  }
  if (typeof val === "boolean") {
    throw new Error(`Field '${fieldName}' must be a valid number, received boolean`);
  }
  const s = String(val).trim();
  const num = Number(s);
  if (!Number.isFinite(num)) {
    throw new Error(`Field '${fieldName}' must be a valid number, received "${val}"`);
  }
  return num;
}

export function normalizeComponentType(rawVal: unknown, compId = "", compName = ""): string {
  if (rawVal === undefined || rawVal === null || String(rawVal).trim() === "") {
    const hint = (compId + " " + compName).toLowerCase();
    if (hint.includes("arm") || hint.includes("扶手")) return "armrest";
    if (hint.includes("seat") || hint.includes("座")) return "seat";
    if (hint.includes("back") || hint.includes("靠")) return "backrest";
    if (hint.includes("leg") || hint.includes("foot") || hint.includes("脚") || hint.includes("腿")) return "leg";
    if (hint.includes("pillow") || hint.includes("枕")) return "pillow";
    if (hint.includes("base") || hint.includes("底")) return "base";
    if (hint.includes("frame") || hint.includes("框") || hint.includes("架")) return "frame";
    return "other";
  }

  const s = String(rawVal).trim().toLowerCase();
  const clean = s.replace(/[\s\-_]+/g, "");

  if (["frame", "foam", "fabric", "hardware", "leg", "armrest", "backrest", "seat", "pillow", "base", "base_frame", "cushion", "cushion_seat", "cushion_back", "support", "panel", "structure", "other"].includes(s)) {
    return s;
  }

  if (clean.includes("cushionseat") || clean.includes("seatcushion") || clean === "seat" || clean === "座包" || clean === "座垫" || clean === "主座垫" || clean === "坐垫" || clean === "坐包") {
    return "seat";
  }
  if (clean.includes("cushionback") || clean.includes("backcushion") || clean === "backrest" || clean === "back" || clean === "靠背" || clean === "靠包" || clean === "靠垫" || clean === "拱形靠背" || clean === "椅背") {
    return "backrest";
  }
  if (clean.includes("arm") || clean === "armrest" || clean === "扶手" || clean.includes("左扶手") || clean.includes("右扶手") || clean.includes("圆角扶手")) {
    return "armrest";
  }
  if (clean.includes("baseframe") || clean === "base" || clean === "foundation" || clean === "plinth" || clean === "底座" || clean === "底框" || clean === "底架" || clean === "底座木框" || clean === "基座") {
    return "base";
  }
  if (clean.includes("frame") || clean === "木架" || clean === "框架" || clean === "内框" || clean === "钢架" || clean === "主架") {
    return "frame";
  }
  if (clean.includes("leg") || clean.includes("foot") || clean.includes("feet") || clean === "脚" || clean === "沙发脚" || clean === "木脚" || clean === "金属脚" || clean.includes("脚")) {
    return "leg";
  }
  if (clean.includes("pillow") || clean === "腰枕" || clean === "抱枕" || clean === "枕头" || clean === "靠枕") {
    return "pillow";
  }
  if (clean.includes("cushion") || clean === "软垫" || clean === "垫") {
    return "cushion";
  }
  if (clean.includes("foam") || clean.includes("sponge") || clean === "海绵" || clean === "高回弹海绵" || clean === "乳胶") {
    return "foam";
  }
  if (clean.includes("fabric") || clean.includes("leather") || clean.includes("cloth") || clean === "面料" || clean === "皮" || clean === "布" || clean === "真皮" || clean === "皮革") {
    return "fabric";
  }
  if (clean.includes("hardware") || clean.includes("screw") || clean.includes("bracket") || clean.includes("hinge") || clean === "五金" || clean === "螺丝" || clean === "铰链" || clean === "连接件") {
    return "hardware";
  }
  if (clean.includes("support") || clean.includes("strut") || clean.includes("beam") || clean === "支撑" || clean === "拉条" || clean === "横梁") {
    return "support";
  }
  if (clean.includes("panel") || clean.includes("board") || clean.includes("plywood") || clean === "板件" || clean === "多层板" || clean === "封板") {
    return "panel";
  }
  if (clean.includes("structure") || clean === "结构" || clean === "结构件") {
    return "structure";
  }

  return s.replace(/[\s\-]+/g, "_");
}

export function normalizeShapeProxy(val: unknown): string {
  if (val === undefined || val === null || String(val).trim() === "") return "box";
  const s = String(val).trim().toLowerCase();
  const clean = s.replace(/[\s\-_]+/g, "");

  if (["box", "rounded_box", "soft_cushion", "rounded_shell", "tapered_cushion", "arched_back", "pillow", "base", "cylinder", "sphere"].includes(s)) {
    return s;
  }
  if (clean.includes("roundbox") || clean.includes("roundedbox") || clean === "圆角盒") return "rounded_box";
  if (clean.includes("softcushion") || clean.includes("cushion") || clean === "软包" || clean === "软垫" || clean === "座包") return "soft_cushion";
  if (clean.includes("roundedshell") || clean.includes("shell") || clean === "圆角壳" || clean === "扶手壳") return "rounded_shell";
  if (clean.includes("taperedcushion") || clean.includes("taper") || clean === "锥形垫") return "tapered_cushion";
  if (clean.includes("archedback") || clean.includes("arch") || clean === "拱形背" || clean === "拱形靠背") return "arched_back";
  if (clean.includes("pillow") || clean === "抱枕" || clean === "腰枕" || clean === "枕头") return "pillow";
  if (clean.includes("base") || clean === "底座" || clean === "底框") return "base";
  if (clean.includes("cylinder") || clean === "圆柱" || clean === "圆柱体") return "cylinder";
  if (clean.includes("sphere") || clean === "球体") return "sphere";

  return "box";
}

export function parseWorkbook(inputData: Buffer | ArrayBuffer | Uint8Array, filename = "upload.xlsx"): ParseResult {
  let wb: XLSX.WorkBook | null = null;
  let lastReadError = "";

  // Safe Uint8Array conversion preserving byteOffset and byteLength
  let uint8: Uint8Array;
  if (inputData instanceof Uint8Array) {
    uint8 = inputData;
  } else if (inputData instanceof ArrayBuffer) {
    uint8 = new Uint8Array(inputData);
  } else {
    const b = Buffer.from(inputData as any);
    uint8 = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }

  // Strategy 1: Buffer read if Node Buffer environment
  if (typeof Buffer !== "undefined" && (Buffer.isBuffer(inputData) || (inputData as any)?.buffer)) {
    try {
      const buf = Buffer.isBuffer(inputData) ? inputData : Buffer.from(uint8);
      wb = XLSX.read(buf, { type: "buffer", cellDates: true, raw: false });
    } catch (e1: any) {
      lastReadError = e1?.message || String(e1);
    }
  }

  // Strategy 2: Array type for Uint8Array (Isomorphic)
  if (!wb) {
    try {
      wb = XLSX.read(uint8, { type: "array", cellDates: true, dense: false, raw: false });
    } catch (e2: any) {
      lastReadError = lastReadError || (e2?.message || String(e2));
    }
  }

  // Strategy 3: Text / string decoding for CSV/text
  if (!wb) {
    try {
      const decoder = new TextDecoder("utf-8");
      wb = XLSX.read(decoder.decode(uint8), { type: "string", cellDates: true });
    } catch (e3: any) {
      lastReadError = lastReadError || (e3?.message || String(e3));
    }
  }

  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) {
    return {
      success: false,
      error: `Excel 文件读取失败 (${lastReadError || "无法识别的工作簿结构"})。文件可能已损坏或采用了不支持的加密压缩。建议在 Excel 或 WPS 中重新【另存为】标准的 .xlsx 格式。`,
    };
  }

  const sheetNames = wb.SheetNames;
  let productSheetName = sheetNames.find(n => {
    const s = n.trim().toLowerCase();
    return s === "product" || s === "product_info" || s === "productinfo" || s === "产品" || s === "产品信息";
  });
  let componentSheetName = sheetNames.find(n => {
    const s = n.trim().toLowerCase();
    return s === "components" || s === "component" || s === "components_list" || s === "部件" || s === "部件表" || s === "部件清单";
  });

  // Content-based inspection fallback if named sheets are not found directly
  if (!productSheetName || !componentSheetName) {
    for (const name of sheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (rows.length === 0) continue;

      // Check if this sheet looks like a Components sheet (has headers id, name, size_x, etc.)
      const firstRowKeys = Object.keys(rows[0] || {}).map(k => k.trim().toLowerCase().replace(/[\s\-_]+/g, ""));
      const isComponents = firstRowKeys.some(k => k === "id" || k === "componentid" || k === "部件id" || k === "部件编号") &&
        firstRowKeys.some(k => k === "name" || k === "componentname" || k === "部件名称") &&
        firstRowKeys.some(k => k === "sizex" || k === "width" || k === "尺寸x" || k === "x");

      if (isComponents && !componentSheetName) {
        componentSheetName = name;
        continue;
      }

      // Check if this sheet looks like a Product key-value sheet (contains sku, overall_width, product_type)
      const allTextInSheet = rows.map(r => Object.values(r).join(" ").toLowerCase()).join(" ");
      const isProduct = (allTextInSheet.includes("sku") || allTextInSheet.includes("产品编码")) &&
        (allTextInSheet.includes("width") || allTextInSheet.includes("宽度") || allTextInSheet.includes("product_type") || allTextInSheet.includes("产品类型"));

      if (isProduct && !productSheetName) {
        productSheetName = name;
      }
    }
  }

  // Index-based fallback if content search still didn't resolve
  if (!productSheetName && sheetNames.length >= 1) {
    productSheetName = sheetNames[0];
  }
  if (!componentSheetName && sheetNames.length >= 2) {
    componentSheetName = sheetNames[1];
  } else if (!componentSheetName && sheetNames.length === 1) {
    componentSheetName = sheetNames[0];
  }

  if (!productSheetName || !wb.Sheets[productSheetName]) {
    return {
      success: false,
      error: "工作簿缺少 'Product' (产品信息) 数据页",
    };
  }
  if (!componentSheetName || !wb.Sheets[componentSheetName]) {
    return {
      success: false,
      error: "工作簿缺少 'Components' (部件清单) 数据页",
    };
  }

  const productSheet = wb.Sheets[productSheetName];
  const componentSheet = wb.Sheets[componentSheetName];

  // Parse Product sheet key-value table or horizontal table
  const productRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(productSheet, { defval: "" });
  const productData: Record<string, unknown> = {};

  if (productRows.length > 0) {
    const firstRow = productRows[0];
    const keys = Object.keys(firstRow).map((k) => k.toLowerCase().replace(/[\s\-_]+/g, "_"));
    const isHorizontal = keys.includes("sku") || keys.includes("product_type") || keys.includes("overall_width");

    if (isHorizontal) {
      for (const [k, v] of Object.entries(firstRow)) {
        const normK = k.trim().toLowerCase().replace(/[\s\-_]+/g, "_");
        productData[normK] = v;
      }
    } else {
      for (const r of productRows) {
        const keyCandidate = r.key ?? r.Key ?? r["Key"] ?? r["key"] ?? r["键"] ?? r["属性"] ?? Object.values(r)[0];
        const valCandidate = r.value ?? r.Value ?? r["Value"] ?? r["value"] ?? r["值"] ?? r["属性值"] ?? Object.values(r)[1];
        const key = String(keyCandidate ?? "").trim().toLowerCase().replace(/[\s\-_]+/g, "_");
        if (key) {
          productData[key] = valCandidate;
        }
      }
    }
  }

  function getProductVal(data: Record<string, unknown>, keys: string[]): unknown {
    for (const k of keys) {
      const normalizedKey = k.toLowerCase().replace(/[\s\-_]+/g, "_");
      if (data[normalizedKey] !== undefined && data[normalizedKey] !== null && String(data[normalizedKey]).trim() !== "") {
        return data[normalizedKey];
      }
    }
    return undefined;
  }

  let sku: string;
  let productType: string;
  let width: number;
  let depth: number;
  let height: number;

  try {
    const skuVal = getProductVal(productData, ["sku", "product_sku", "产品编码", "产品编号", "编号"]);
    sku = parseRequiredString(skuVal, "sku");

    const typeVal = getProductVal(productData, ["product_type", "producttype", "type", "产品类型", "品类"]);
    productType = parseRequiredString(typeVal, "product_type");

    const wVal = getProductVal(productData, ["overall_width", "width", "w", "外形宽度", "整体宽度", "宽度"]);
    width = parseNumberField(wVal, "overall_width", true);

    const dVal = getProductVal(productData, ["overall_depth", "depth", "d", "外形深度", "整体深度", "深度"]);
    depth = parseNumberField(dVal, "overall_depth", true);

    const hVal = getProductVal(productData, ["overall_height", "height", "h", "外形高度", "整体高度", "高度"]);
    height = parseNumberField(hVal, "overall_height", true);
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Product sheet parsing error",
    };
  }

  // Parse optional CAD_Profiles / Profiles sheet
  let cadProfileSheetName = sheetNames.find((n) => {
    const s = n.trim().toLowerCase().replace(/[\s\-_]+/g, "");
    return (
      s === "cadprofiles" ||
      s === "cadprofile" ||
      s === "cad轮廓" ||
      s === "轮廓表" ||
      s === "profiles" ||
      s === "profile" ||
      s === "profiles2d" ||
      s === "轮廓"
    );
  });

  const cadProfiles: any[] = [];
  if (cadProfileSheetName && wb.Sheets[cadProfileSheetName]) {
    const profileRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[cadProfileSheetName],
      { defval: "" }
    );
    for (const pr of profileRows) {
      const pid = getRowVal(pr, ["profile_id", "profileid", "id", "轮廓id"]);
      const family = getRowVal(pr, ["component_family", "componentfamily", "family", "族", "部件族"]);
      const viewVal = getRowVal(pr, ["view", "视图", "方向"]) || "front";
      const roleVal = getRowVal(pr, ["path_role", "pathrole", "role", "路径角色", "角色"]) || "outer";
      const seq = getRowVal(pr, ["sequence", "seq", "index", "point_index", "pointindex", "序号"]);
      const cmd = getRowVal(pr, ["command", "cmd", "指令"]);

      const xVal = getRowVal(pr, ["x", "u", "x_mm", "u_val"]);
      const yVal = getRowVal(pr, ["y", "v", "y_mm", "v_val"]);
      const cp1xVal = getRowVal(pr, ["cp1_x", "cp1x", "cp1u"]);
      const cp1yVal = getRowVal(pr, ["cp1_y", "cp1y", "cp1v"]);
      const cp2xVal = getRowVal(pr, ["cp2_x", "cp2x", "cp2u"]);
      const cp2yVal = getRowVal(pr, ["cp2_y", "cp2y", "cp2v"]);

      const closedVal = getRowVal(pr, ["closed", "是否闭合"]);
      let closed = false;
      if (closedVal !== undefined && closedVal !== null && String(closedVal).trim() !== "") {
        const s = String(closedVal).trim().toLowerCase();
        closed = !(s === "false" || s === "0" || s === "no" || s === "否");
      }

      const mirrorVal = getRowVal(pr, ["mirror_allowed", "mirrorallowed", "可镜像"]);
      let mirrorAllowed = false;
      if (mirrorVal !== undefined && mirrorVal !== null && String(mirrorVal).trim() !== "") {
        const s = String(mirrorVal).trim().toLowerCase();
        mirrorAllowed = !(s === "false" || s === "0" || s === "no" || s === "否");
      }

      const note = getRowVal(pr, ["note", "备注"]);

      const seqNum = Number(seq ?? 0) || 0;
      const effectiveCmd = cmd ? String(cmd).trim() : seqNum === 0 ? "moveTo" : "lineTo";

      if (pid !== undefined && (xVal !== undefined || yVal !== undefined || cmd !== undefined)) {
        cadProfiles.push({
          profileId: String(pid).trim(),
          componentFamily: family ? String(family).trim() : undefined,
          view: (String(viewVal).trim().toLowerCase() as "front" | "side" | "top") || "front",
          pathRole: (String(roleVal).trim().toLowerCase() as any) || "outer",
          sequence: seqNum,
          command: effectiveCmd as any,
          x: xVal !== undefined && xVal !== "" ? Number(xVal) : undefined,
          y: yVal !== undefined && yVal !== "" ? Number(yVal) : undefined,
          cp1x: cp1xVal !== undefined && cp1xVal !== "" ? Number(cp1xVal) : undefined,
          cp1y: cp1yVal !== undefined && cp1yVal !== "" ? Number(cp1yVal) : undefined,
          cp2x: cp2xVal !== undefined && cp2xVal !== "" ? Number(cp2xVal) : undefined,
          cp2y: cp2yVal !== undefined && cp2yVal !== "" ? Number(cp2yVal) : undefined,
          closed,
          mirrorAllowed,
          note: note ? String(note).trim() : undefined,
        });
      }
    }
  }

  // Parse optional ShapeProfiles sheet
  let shapeProfileSheetName = sheetNames.find((n) => {
    const s = n.trim().toLowerCase().replace(/[\s\-_]+/g, "");
    return s === "shapeprofiles" || s === "shapeprofile" || s === "轮廓点表";
  });

  const shapeProfiles: any[] = [];
  if (shapeProfileSheetName && wb.Sheets[shapeProfileSheetName]) {
    const spRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[shapeProfileSheetName],
      { defval: "" }
    );
    for (const pr of spRows) {
      const pid = getRowVal(pr, ["profile_id", "profileid", "id", "轮廓id"]);
      const viewVal = getRowVal(pr, ["view", "视图"]) || "front";
      const idx = getRowVal(pr, ["point_index", "pointindex", "index", "序号"]);
      const uVal = getRowVal(pr, ["u", "x"]);
      const vVal = getRowVal(pr, ["v", "y"]);

      if (pid !== undefined && idx !== undefined && uVal !== undefined && vVal !== undefined) {
        shapeProfiles.push({
          profileId: String(pid).trim(),
          view: (String(viewVal).trim().toLowerCase() as "front" | "side" | "top") || "front",
          pointIndex: Number(idx) || 0,
          u: Number(uVal) || 0,
          v: Number(vVal) || 0,
        });
      }
    }
  }

  // Parse optional Loft_Sections sheet
  let loftSectionsSheetName = sheetNames.find((n) => {
    const s = n.trim().toLowerCase().replace(/[\s\-_]+/g, "");
    return s === "loftsections" || s === "loftsection" || s === "loft_sections" || s === "截面表";
  });

  const loftSections: any[] = [];
  if (loftSectionsSheetName && wb.Sheets[loftSectionsSheetName]) {
    const lsRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[loftSectionsSheetName],
      { defval: "" }
    );
    for (const lsr of lsRows) {
      const group = getRowVal(lsr, ["loft_group", "loftgroup", "group", "放样组"]);
      const secId = getRowVal(lsr, ["section_id", "sectionid", "id", "截面id"]);
      const secT = getRowVal(lsr, ["section_t", "sectiont", "t", "截面t", "位置t"]);

      if (group !== undefined && secT !== undefined) {
        const mirrorVal = getRowVal(lsr, ["mirror_allowed", "mirrorallowed", "可镜像"]);
        let mirrorAllowed = true;
        if (mirrorVal !== undefined && mirrorVal !== null && String(mirrorVal).trim() !== "") {
          const s = String(mirrorVal).trim().toLowerCase();
          mirrorAllowed = !(s === "false" || s === "0" || s === "no" || s === "否");
        }

        const wScale = parseNumberField(getRowVal(lsr, ["width_scale", "widthscale", "宽缩放"]), "width_scale", false) || 1.0;
        const hScale = parseNumberField(getRowVal(lsr, ["height_scale", "heightscale", "高缩放"]), "height_scale", false) || 1.0;
        const dScale = parseNumberField(getRowVal(lsr, ["depth_scale", "depthscale", "深缩放"]), "depth_scale", false) || 1.0;

        const offX = parseNumberField(getRowVal(lsr, ["offset_x", "offsetx", "偏移x"]), "offset_x", false) || 0;
        const offY = parseNumberField(getRowVal(lsr, ["offset_y", "offsety", "偏移y"]), "offset_y", false) || 0;
        const offZ = parseNumberField(getRowVal(lsr, ["offset_z", "offsetz", "偏移z"]), "offset_z", false) || 0;

        const bulge = parseNumberField(getRowVal(lsr, ["bulge", "鼓包", "膨胀"]), "bulge", false) || 0;

        const fProf = getRowVal(lsr, ["front_profile", "frontprofile", "正视轮廓"]);
        const sProf = getRowVal(lsr, ["side_profile", "sideprofile", "侧视轮廓"]);
        const tProf = getRowVal(lsr, ["top_profile", "topprofile", "俯视轮廓"]);

        loftSections.push({
          loftGroup: String(group).trim(),
          sectionId: secId ? String(secId).trim() : undefined,
          sectionT: Number(secT) || 0,
          mirrorAllowed,
          widthScale: wScale,
          heightScale: hScale,
          depthScale: dScale,
          offsetX: offX,
          offsetY: offY,
          offsetZ: offZ,
          bulge,
          frontProfile: fProf ? String(fProf).trim() : undefined,
          sideProfile: sProf ? String(sProf).trim() : undefined,
          topProfile: tProf ? String(tProf).trim() : undefined,
        });
      }
    }
  }

  // Parse optional SoftSurface_Params sheet
  let softSurfaceSheetName = sheetNames.find((n) => {
    const s = n.trim().toLowerCase().replace(/[\s\-_]+/g, "");
    return s === "softsurfaceparams" || s === "softsurfaces" || s === "softsurface" || s === "soft_surface_params" || s === "软包参数";
  });

  const softSurfaceParams: any[] = [];
  if (softSurfaceSheetName && wb.Sheets[softSurfaceSheetName]) {
    const ssRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets[softSurfaceSheetName],
      { defval: "" }
    );
    for (const ssr of ssRows) {
      const group = getRowVal(ssr, ["soft_group", "softgroup", "group", "软包组"]);
      if (group !== undefined) {
        const compType = getRowVal(ssr, ["component_type", "componenttype", "部件类型"]);
        const surfMode = getRowVal(ssr, ["surface_mode", "surfacemode", "曲面模式"]) || "default";

        const gridU = parseNumberField(getRowVal(ssr, ["grid_u", "gridu", "网格u"]), "grid_u", false) || 16;
        const gridV = parseNumberField(getRowVal(ssr, ["grid_v", "gridv", "网格v"]), "grid_v", false) || 16;
        const subdiv = parseNumberField(getRowVal(ssr, ["subdiv_level", "subdivlevel", "细分级别"]), "subdiv_level", false) || 2;

        const crownX = parseNumberField(getRowVal(ssr, ["crown_x", "crownx", "隆起x"]), "crown_x", false) || 0.1;
        const crownY = parseNumberField(getRowVal(ssr, ["crown_y", "crowny", "隆起y"]), "crown_y", false) || 0.1;

        const frontDrop = parseNumberField(getRowVal(ssr, ["front_drop", "frontdrop", "前缘软垂", "下垂"]), "front_drop", false) || 0.0;
        const sideRound = parseNumberField(getRowVal(ssr, ["side_roundness", "sideroundness", "侧圆角"]), "side_roundness", false) || 0.1;
        const cornerFall = parseNumberField(getRowVal(ssr, ["corner_falloff", "cornerfalloff", "角衰减"]), "corner_falloff", false) || 0.1;
        const edgeSoft = parseNumberField(getRowVal(ssr, ["edge_softness", "edgesoftness", "边缘柔软"]), "edge_softness", false) || 0.1;
        const seamPull = parseNumberField(getRowVal(ssr, ["seam_pull", "seampull", "缝线牵引"]), "seam_pull", false) || 0.0;
        const supportBias = parseNumberField(getRowVal(ssr, ["support_bias", "supportbias", "支撑偏移"]), "support_bias", false) || 0.5;

        const normSmoothVal = getRowVal(ssr, ["normal_smooth", "normalsmooth", "法线平滑"]);
        let normalSmooth = true;
        if (normSmoothVal !== undefined && normSmoothVal !== null && String(normSmoothVal).trim() !== "") {
          const s = String(normSmoothVal).trim().toLowerCase();
          normalSmooth = !(s === "false" || s === "0" || s === "no" || s === "否");
        }

        const validModes = ["seat", "back", "pillow", "cushion", "default"];
        const modeClean = validModes.includes(String(surfMode).trim().toLowerCase())
          ? String(surfMode).trim().toLowerCase()
          : "default";

        softSurfaceParams.push({
          softGroup: String(group).trim(),
          componentType: compType ? String(compType).trim() : undefined,
          surfaceMode: modeClean,
          gridU,
          gridV,
          subdivLevel: subdiv,
          crownX,
          crownY,
          frontDrop,
          sideRoundness: sideRound,
          cornerFalloff: cornerFall,
          edgeSoftness: edgeSoft,
          seamPull,
          supportBias,
          normalSmooth,
        });
      }
    }
  }

  // Parse Components sheet
  const compRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(componentSheet, { defval: "" });
  if (compRows.length === 0) {
    return {
      success: false,
      error: "Components sheet must contain at least one component",
    };
  }

  function getRowVal(r: Record<string, unknown>, keys: string[]): unknown {
    for (const key of Object.keys(r)) {
      const normalizedKey = key.trim().toLowerCase().replace(/[\s\-_]+/g, "");
      for (const targetKey of keys) {
        if (normalizedKey === targetKey.toLowerCase().replace(/[\s\-_]+/g, "")) {
          const val = r[key];
          if (val !== undefined && val !== null && String(val).trim() !== "") {
            return val;
          }
        }
      }
    }
    return undefined;
  }

  const components = [];
  for (let i = 0; i < compRows.length; i++) {
    const r = compRows[i];
    const rowIdx = i + 1;
    try {
      const idVal = getRowVal(r, ["id", "component_id", "componentid", "部件id", "部件编号", "编号"]);
      const id = parseRequiredString(idVal, `Components row ${rowIdx} 'id'`);

      const nameVal = getRowVal(r, ["name", "component_name", "componentname", "部件名称", "名称"]) || id;
      const name = String(nameVal).trim() || id;

      const typeVal = getRowVal(r, [
        "type",
        "component_type",
        "componenttype",
        "semantic_type",
        "semantictype",
        "category",
        "部件类型",
        "类型",
        "类别",
        "部件类别",
      ]);
      const typeStr = normalizeComponentType(typeVal, id, name);

      const materialVal = getRowVal(r, ["material", "component_material", "componentmaterial", "材质", "材料"]);
      const material = materialVal !== undefined && String(materialVal).trim() !== "" ? String(materialVal).trim() : undefined;

      const sizeXVal = getRowVal(r, ["size_x", "sizex", "width", "x", "尺寸x", "宽度", "外形x"]);
      const sizeX = parseNumberField(sizeXVal, `Components row ${rowIdx} 'size_x'`, true);

      const sizeYVal = getRowVal(r, ["size_y", "sizey", "depth", "y", "尺寸y", "深度", "外形y"]);
      const sizeY = parseNumberField(sizeYVal, `Components row ${rowIdx} 'size_y'`, true);

      const sizeZVal = getRowVal(r, ["size_z", "sizez", "height", "z", "尺寸z", "高度", "外形z"]);
      const sizeZ = parseNumberField(sizeZVal, `Components row ${rowIdx} 'size_z'`, true);

      const posXVal = getRowVal(r, ["pos_x", "posx", "x_pos", "position_x", "positionx", "位置x", "坐标x"]);
      const posX = parseNumberField(posXVal, `Components row ${rowIdx} 'pos_x'`, false);

      const posYVal = getRowVal(r, ["pos_y", "posy", "y_pos", "position_y", "positiony", "位置y", "坐标y"]);
      const posY = parseNumberField(posYVal, `Components row ${rowIdx} 'pos_y'`, false);

      const posZVal = getRowVal(r, ["pos_z", "posz", "z_pos", "position_z", "positionz", "位置z", "坐标z"]);
      const posZ = parseNumberField(posZVal, `Components row ${rowIdx} 'pos_z'`, false);

      const explodeXVal = getRowVal(r, ["explode_x", "explodex", "x_explode", "爆炸x", "爆炸向量x"]);
      const explodeX = parseNumberField(explodeXVal, `Components row ${rowIdx} 'explode_x'`, false);

      const explodeYVal = getRowVal(r, ["explode_y", "explodey", "y_explode", "爆炸y", "爆炸向量y"]);
      const explodeY = parseNumberField(explodeYVal, `Components row ${rowIdx} 'explode_y'`, false);

      const explodeZVal = getRowVal(r, ["explode_z", "explodez", "z_explode", "爆炸z", "爆炸向量z"]);
      const explodeZ = parseNumberField(explodeZVal, `Components row ${rowIdx} 'explode_z'`, false);

      // Rotation (rotation_x, rotation_y, rotation_z)
      const rotXVal = getRowVal(r, ["rotation_x", "rotationx", "rot_x", "旋转x"]);
      const rotX = parseNumberField(rotXVal, `Components row ${rowIdx} 'rotation_x'`, false) || 0;

      const rotYVal = getRowVal(r, ["rotation_y", "rotationy", "rot_y", "旋转y"]);
      const rotY = parseNumberField(rotYVal, `Components row ${rowIdx} 'rotation_y'`, false) || 0;

      const rotZVal = getRowVal(r, ["rotation_z", "rotationz", "rot_z", "旋转z"]);
      const rotZ = parseNumberField(rotZVal, `Components row ${rowIdx} 'rotation_z'`, false) || 0;

      const rotation = { x: rotX, y: rotY, z: rotZ };

      // Component Profiles
      const frontProf = getRowVal(r, ["front_profile", "frontprofile", "正视轮廓"]);
      const sideProf = getRowVal(r, ["side_profile", "sideprofile", "侧视轮廓"]);
      const topProf = getRowVal(r, ["top_profile", "topprofile", "俯视轮廓"]);
      const outerProf = getRowVal(r, ["outer_profile", "outerprofile", "外轮廓"]);
      const innerProf = getRowVal(r, ["inner_profile", "innerprofile", "内轮廓"]);
      const seamProf = getRowVal(r, ["seam_profile", "seamprofile", "缝线轮廓"]);

      const profilesObj = {
        ...(frontProf && { front: String(frontProf).trim() }),
        ...(sideProf && { side: String(sideProf).trim() }),
        ...(topProf && { top: String(topProf).trim() }),
        ...(outerProf && { outer: String(outerProf).trim() }),
        ...(innerProf && { inner: String(innerProf).trim() }),
        ...(seamProf && { seam: String(seamProf).trim() }),
      };
      const profiles = Object.keys(profilesObj).length > 0 ? profilesObj : undefined;

      // Shape Attributes
      const shapeProxyVal = getRowVal(r, ["shape_proxy", "shapeproxy", "proxy_shape", "proxyshape", "proxy", "形状代理"]);
      const proxy = normalizeShapeProxy(shapeProxyVal);

      const shapeRefVal = getRowVal(r, ["shape_ref", "shaperef", "形状引用"]);
      const shapeRef = shapeRefVal ? String(shapeRefVal).trim() : undefined;

      const cornerRadiusVal = getRowVal(r, ["corner_radius", "cornerradius", "圆角半径"]);
      const cornerRadius = parseNumberField(cornerRadiusVal, `Components row ${rowIdx} 'corner_radius'`, false) || undefined;

      const softnessVal = getRowVal(r, ["softness_level", "softnesslevel", "softness", "柔软度"]);
      const softness = parseNumberField(softnessVal, `Components row ${rowIdx} 'softness'`, false) || undefined;

      const frontBulgeVal = getRowVal(r, ["front_bulge", "frontbulge", "前膨胀"]);
      const frontBulge = parseNumberField(frontBulgeVal, `Components row ${rowIdx} 'front_bulge'`, false) || undefined;

      const sideBulgeVal = getRowVal(r, ["side_bulge", "sidebulge", "侧膨胀"]);
      const sideBulge = parseNumberField(sideBulgeVal, `Components row ${rowIdx} 'side_bulge'`, false) || undefined;

      const topBulgeVal = getRowVal(r, ["top_bulge", "topbulge", "顶膨胀"]);
      const topBulge = parseNumberField(topBulgeVal, `Components row ${rowIdx} 'top_bulge'`, false) || undefined;

      const topTaperVal = getRowVal(r, ["top_taper", "toptaper", "顶锥度"]);
      const topTaper = parseNumberField(topTaperVal, `Components row ${rowIdx} 'top_taper'`, false) || undefined;

      const bottomTaperVal = getRowVal(r, ["bottom_taper", "bottomtaper", "底锥度"]);
      const bottomTaper = parseNumberField(bottomTaperVal, `Components row ${rowIdx} 'bottom_taper'`, false) || undefined;

      const symmetryVal = getRowVal(r, ["symmetry_group", "symmetrygroup", "对称组"]);
      const symmetryGroup = symmetryVal ? String(symmetryVal).trim() : undefined;

      const sourceVal = getRowVal(r, ["shape_source", "shapesource", "truth_level", "truthlevel", "数据来源", "source"]);
      let sourceStr: "provided" | "ai_estimated" | "library" | undefined = undefined;
      if (sourceVal) {
        const sv = String(sourceVal).trim().toLowerCase();
        if (sv === "provided" || sv === "user" || sv === "manual") sourceStr = "provided";
        else if (sv === "ai_estimated" || sv === "ai" || sv === "solver_resolved" || sv === "estimated") sourceStr = "ai_estimated";
        else if (sv === "library" || sv === "standard") sourceStr = "library";
      }

      const prodTruthVal = getRowVal(r, ["production_truth", "productiontruth", "生产真实"]);
      let productionTruth: boolean | undefined = undefined;
      if (prodTruthVal !== undefined && prodTruthVal !== null && String(prodTruthVal).trim() !== "") {
        const s = String(prodTruthVal).trim().toLowerCase();
        productionTruth = !(s === "false" || s === "0" || s === "no" || s === "否");
      }

      // Geometry mode, loft group, soft group
      const geomModeVal = getRowVal(r, ["geometry_mode", "geometrymode", "mode", "几何模式"]);
      let geometryMode: "box" | "soft_surface" | "loft_shell" = "box";
      if (geomModeVal) {
        const s = String(geomModeVal).trim().toLowerCase();
        if (s === "soft_surface" || s === "softsurface" || s === "soft" || s.includes("软包") || s.includes("曲面")) geometryMode = "soft_surface";
        else if (s === "loft_shell" || s === "loftshell" || s === "loft" || s.includes("放样") || s.includes("外壳")) geometryMode = "loft_shell";
      }

      const loftGroupVal = getRowVal(r, ["loft_group", "loftgroup", "放样组"]);
      const loftGroup = loftGroupVal ? String(loftGroupVal).trim() : undefined;

      const softGroupVal = getRowVal(r, ["soft_group", "softgroup", "软包组"]);
      const softGroup = softGroupVal ? String(softGroupVal).trim() : undefined;

      const shape: Record<string, any> = { proxy };
      if (shapeRef) shape.shapeRef = shapeRef;
      if (cornerRadius !== undefined) shape.cornerRadius = cornerRadius;
      if (softness !== undefined) shape.softness = softness;
      if (frontBulge !== undefined || sideBulge !== undefined || topBulge !== undefined) {
        shape.bulge = {
          ...(frontBulge !== undefined && { front: frontBulge }),
          ...(sideBulge !== undefined && { side: sideBulge }),
          ...(topBulge !== undefined && { top: topBulge }),
        };
      }
      if (topTaper !== undefined || bottomTaper !== undefined) {
        shape.taper = {
          ...(topTaper !== undefined && { top: topTaper }),
          ...(bottomTaper !== undefined && { bottom: bottomTaper }),
        };
      }
      if (symmetryGroup) shape.symmetryGroup = symmetryGroup;
      if (sourceStr === "ai_estimated" || sourceStr === "provided" || sourceStr === "library") {
        shape.source = sourceStr as any;
      }
      if (productionTruth !== undefined) shape.productionTruth = productionTruth;

      components.push({
        id,
        name,
        type: typeStr,
        material,
        geometryMode,
        loftGroup,
        softGroup,
        size: { x: sizeX, y: sizeY, z: sizeZ },
        position: { x: posX, y: posY, z: posZ },
        explode: { x: explodeX, y: explodeY, z: explodeZ },
        rotation,
        profiles,
        shape,
      });
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || `Error parsing Components row ${rowIdx}`,
      };
    }
  }

  const rawFes = {
    schemaVersion: "1.0",
    sku,
    units: "mm",
    productType,
    overall: { width, depth, height },
    components,
    shapeProfiles,
    cadProfiles,
    loftSections,
    softSurfaceParams,
    geometry: {
      profiles: [...cadProfiles, ...shapeProfiles],
      loftSections,
      softSurfaceParams,
    },
    source: { kind: "excel", filename },
    warnings: [],
  };

  const validation = FurnitureEngineeringSchema.safeParse(rawFes);
  if (!validation.success) {
    const issues = validation.error.issues.map(issue => {
      const pathStr = issue.path.join(".");
      return pathStr ? `${pathStr}: ${issue.message}` : issue.message;
    });
    return {
      success: false,
      error: `Workbook schema validation failed: ${issues.join("; ")}`,
      details: validation.error.issues,
    };
  }

  return {
    success: true,
    fes: validation.data,
  };
}

