import * as THREE from "three";

export interface ConnectedComponentInfo {
  id: number;
  name: string;
  triangleCount: number;
  vertexCount: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  volumeEstimate: number; // in mm³ (or cm³ depending on unit)
  percentage: number;     // 0 to 100%
  isSmall: boolean;       // flagged if below threshold
  triangleIndices: number[]; // indices of triangles in the geometry
}

export interface ConnectivityAnalysisResult {
  geometryUuid: string;
  totalTriangles: number;
  totalVertices: number;
  components: ConnectedComponentInfo[];
  smallComponentsCount: number;
  largestComponentPercentage: number;
  analyzedAt: number;
}

// In-memory cache for expensive analysis (>200k triangles)
const analysisCache = new Map<string, ConnectivityAnalysisResult>();

/**
 * Disjoint Set Union (DSU) with path compression and union by rank
 */
class DSU {
  parent: Int32Array;
  rank: Int32Array;

  constructor(size: number) {
    this.parent = new Int32Array(size);
    this.rank = new Int32Array(size);
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
    }
  }

  find(i: number): number {
    let root = i;
    while (root !== this.parent[root]) {
      root = this.parent[root];
    }
    // Path compression
    let curr = i;
    while (curr !== root) {
      const next = this.parent[curr];
      this.parent[curr] = root;
      curr = next;
    }
    return root;
  }

  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI === rootJ) return;

    if (this.rank[rootI] < this.rank[rootJ]) {
      this.parent[rootI] = rootJ;
    } else if (this.rank[rootI] > this.rank[rootJ]) {
      this.parent[rootJ] = rootI;
    } else {
      this.parent[rootJ] = rootI;
      this.rank[rootI]++;
    }
  }
}

export class TriangleConnectivityAnalyzer {
  /**
   * Analyze connected components of a THREE.BufferGeometry.
   * Tolerant to shared edges and duplicate vertices with spatial welding.
   */
  public static analyze(
    geometry: THREE.BufferGeometry,
    smallThresholdPercent: number = 0.5,
    forceRecompute: boolean = false
  ): ConnectivityAnalysisResult {
    const cacheKey = `${geometry.uuid}_${geometry.attributes.position?.count || 0}_${smallThresholdPercent}`;
    if (!forceRecompute && analysisCache.has(cacheKey)) {
      return analysisCache.get(cacheKey)!;
    }

    const posAttr = geometry.attributes.position;
    if (!posAttr || posAttr.count === 0) {
      return {
        geometryUuid: geometry.uuid,
        totalTriangles: 0,
        totalVertices: 0,
        components: [],
        smallComponentsCount: 0,
        largestComponentPercentage: 0,
        analyzedAt: Date.now(),
      };
    }

    const indexAttr = geometry.index;
    const numTriangles = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;

    if (numTriangles === 0) {
      return {
        geometryUuid: geometry.uuid,
        totalTriangles: 0,
        totalVertices: posAttr.count,
        components: [],
        smallComponentsCount: 0,
        largestComponentPercentage: 0,
        analyzedAt: Date.now(),
      };
    }

    const dsu = new DSU(numTriangles);

    // Map vertex spatial hash to list of triangle IDs
    // Quantize position to 0.05mm grid to weld coplanar/shared vertices across seams
    const vertexToTriangles = new Map<string, number[]>();

    const getHash = (x: number, y: number, z: number): string => {
      // 0.05mm precision
      const qx = Math.round(x * 20);
      const qy = Math.round(y * 20);
      const qz = Math.round(z * 20);
      return `${qx}_${qy}_${qz}`;
    };

    for (let t = 0; t < numTriangles; t++) {
      let i0: number, i1: number, i2: number;
      if (indexAttr) {
        i0 = indexAttr.getX(t * 3);
        i1 = indexAttr.getX(t * 3 + 1);
        i2 = indexAttr.getX(t * 3 + 2);
      } else {
        i0 = t * 3;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }

      const h0 = getHash(posAttr.getX(i0), posAttr.getY(i0), posAttr.getZ(i0));
      const h1 = getHash(posAttr.getX(i1), posAttr.getY(i1), posAttr.getZ(i1));
      const h2 = getHash(posAttr.getX(i2), posAttr.getY(i2), posAttr.getZ(i2));

      const hashes = [h0, h1, h2];
      for (const h of hashes) {
        let triList = vertexToTriangles.get(h);
        if (!triList) {
          triList = [];
          vertexToTriangles.set(h, triList);
        }
        // Union with triangles already sharing this vertex
        for (const otherTri of triList) {
          dsu.union(t, otherTri);
        }
        triList.push(t);
      }
    }

    // Group triangles by DSU root
    const rootToTriangles = new Map<number, number[]>();
    for (let t = 0; t < numTriangles; t++) {
      const root = dsu.find(t);
      let list = rootToTriangles.get(root);
      if (!list) {
        list = [];
        rootToTriangles.set(root, list);
      }
      list.push(t);
    }

    // Convert each group into ConnectedComponentInfo
    const components: ConnectedComponentInfo[] = [];
    let compId = 1;

    for (const [, triIndices] of rootToTriangles.entries()) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      let signedVolume = 0;
      const uniqueVertexIndices = new Set<number>();

      for (const t of triIndices) {
        let i0: number, i1: number, i2: number;
        if (indexAttr) {
          i0 = indexAttr.getX(t * 3);
          i1 = indexAttr.getX(t * 3 + 1);
          i2 = indexAttr.getX(t * 3 + 2);
        } else {
          i0 = t * 3;
          i1 = t * 3 + 1;
          i2 = t * 3 + 2;
        }

        uniqueVertexIndices.add(i0);
        uniqueVertexIndices.add(i1);
        uniqueVertexIndices.add(i2);

        const x0 = posAttr.getX(i0), y0 = posAttr.getY(i0), z0 = posAttr.getZ(i0);
        const x1 = posAttr.getX(i1), y1 = posAttr.getY(i1), z1 = posAttr.getZ(i1);
        const x2 = posAttr.getX(i2), y2 = posAttr.getY(i2), z2 = posAttr.getZ(i2);

        // Update bounds
        minX = Math.min(minX, x0, x1, x2);
        minY = Math.min(minY, y0, y1, y2);
        minZ = Math.min(minZ, z0, z1, z2);

        maxX = Math.max(maxX, x0, x1, x2);
        maxY = Math.max(maxY, y0, y1, y2);
        maxZ = Math.max(maxZ, z0, z1, z2);

        // Signed volume of tetrahedron from origin
        signedVolume += (x0 * (y1 * z2 - z1 * y2) + y0 * (z1 * x2 - x1 * z2) + z0 * (x1 * y2 - y1 * x2)) / 6.0;
      }

      const triCount = triIndices.length;
      const percentage = (triCount / numTriangles) * 100;
      const isSmall = percentage < smallThresholdPercent;

      components.push({
        id: compId++,
        name: `Component #${compId - 1}${isSmall ? " [SMALL]" : ""}`,
        triangleCount: triCount,
        vertexCount: uniqueVertexIndices.size,
        boundingBox: {
          min: [minX, minY, minZ],
          max: [maxX, maxY, maxZ],
          size: [maxX - minX, maxY - minY, maxZ - minZ],
        },
        volumeEstimate: Math.abs(signedVolume),
        percentage: parseFloat(percentage.toFixed(2)),
        isSmall,
        triangleIndices: triIndices,
      });
    }

    // Sort descending by triangle count (largest component first)
    components.sort((a, b) => b.triangleCount - a.triangleCount);

    // Re-index names nicely
    components.forEach((c, idx) => {
      c.id = idx + 1;
      c.name = `Component #${idx + 1}${c.isSmall ? " [SMALL]" : ""}`;
    });

    const smallComponentsCount = components.filter((c) => c.isSmall).length;
    const largestComponentPercentage = components.length > 0 ? components[0].percentage : 0;

    const result: ConnectivityAnalysisResult = {
      geometryUuid: geometry.uuid,
      totalTriangles: numTriangles,
      totalVertices: posAttr.count,
      components,
      smallComponentsCount,
      largestComponentPercentage,
      analyzedAt: Date.now(),
    };

    analysisCache.set(cacheKey, result);
    return result;
  }

  /**
   * Build a new THREE.BufferGeometry from selected triangle indices.
   */
  public static extractSubGeometry(
    sourceGeometry: THREE.BufferGeometry,
    triangleIndices: number[]
  ): THREE.BufferGeometry {
    const subGeom = new THREE.BufferGeometry();
    const posAttr = sourceGeometry.attributes.position;
    const normalAttr = sourceGeometry.attributes.normal;
    const uvAttr = sourceGeometry.attributes.uv;
    const indexAttr = sourceGeometry.index;

    const newPositions: number[] = [];
    const newNormals: number[] = [];
    const newUvs: number[] = [];
    const newIndices: number[] = [];

    // Map old vertex index to new vertex index to maintain shared vertices
    const oldToNewIndex = new Map<number, number>();

    const getOrAddVertex = (oldIdx: number): number => {
      if (oldToNewIndex.has(oldIdx)) {
        return oldToNewIndex.get(oldIdx)!;
      }
      const newIdx = newPositions.length / 3;
      newPositions.push(posAttr.getX(oldIdx), posAttr.getY(oldIdx), posAttr.getZ(oldIdx));

      if (normalAttr) {
        newNormals.push(normalAttr.getX(oldIdx), normalAttr.getY(oldIdx), normalAttr.getZ(oldIdx));
      }
      if (uvAttr) {
        newUvs.push(uvAttr.getX(oldIdx), uvAttr.getY(oldIdx));
      }

      oldToNewIndex.set(oldIdx, newIdx);
      return newIdx;
    };

    for (const t of triangleIndices) {
      let i0: number, i1: number, i2: number;
      if (indexAttr) {
        i0 = indexAttr.getX(t * 3);
        i1 = indexAttr.getX(t * 3 + 1);
        i2 = indexAttr.getX(t * 3 + 2);
      } else {
        i0 = t * 3;
        i1 = t * 3 + 1;
        i2 = t * 3 + 2;
      }

      const ni0 = getOrAddVertex(i0);
      const ni1 = getOrAddVertex(i1);
      const ni2 = getOrAddVertex(i2);
      newIndices.push(ni0, ni1, ni2);
    }

    subGeom.setAttribute("position", new THREE.Float32BufferAttribute(newPositions, 3));
    if (newNormals.length > 0) {
      subGeom.setAttribute("normal", new THREE.Float32BufferAttribute(newNormals, 3));
    } else {
      subGeom.computeVertexNormals();
    }
    if (newUvs.length > 0) {
      subGeom.setAttribute("uv", new THREE.Float32BufferAttribute(newUvs, 2));
    }
    subGeom.setIndex(newIndices);
    subGeom.computeBoundingBox();
    subGeom.computeBoundingSphere();

    return subGeom;
  }

  /**
   * Clear cache for garbage collection
   */
  public static clearCache(): void {
    analysisCache.clear();
  }
}
