import * as THREE from "three";

export class DimensionRulerHelper extends THREE.Group {
  public visibleRulers: boolean = true;
  private currentObject: THREE.Object3D | null = null;
  private lineMesh: THREE.LineSegments | null = null;
  private sprites: THREE.Sprite[] = [];
  private textures: THREE.Texture[] = [];
  private lineMaterial: THREE.LineBasicMaterial;

  constructor() {
    super();
    this.name = "DimensionRulerHelper";
    this.renderOrder = 998;

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
    });
  }

  public setVisible(visible: boolean): void {
    this.visibleRulers = visible;
    this.visible = visible && this.currentObject !== null;
  }

  public attachTarget(object: THREE.Object3D | null): void {
    this.currentObject = object;
    this.update();
  }

  public detachTarget(): void {
    this.currentObject = null;
    this.clearRulers();
    this.visible = false;
  }

  public clearRulers(): void {
    if (this.lineMesh) {
      this.remove(this.lineMesh);
      this.lineMesh.geometry.dispose();
      this.lineMesh = null;
    }
    for (const sprite of this.sprites) {
      this.remove(sprite);
      sprite.material.dispose();
    }
    this.sprites = [];
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures = [];
  }

  public update(): void {
    if (!this.visibleRulers || !this.currentObject) {
      this.clearRulers();
      this.visible = false;
      return;
    }

    const box = new THREE.Box3().setFromObject(this.currentObject);
    if (box.isEmpty() || !isFinite(box.min.x) || !isFinite(box.max.x)) {
      this.clearRulers();
      this.visible = false;
      return;
    }

    this.clearRulers();
    this.visible = true;

    const min = box.min;
    const max = box.max;

    const sizeX = Math.max(0.1, max.x - min.x);
    const sizeY = Math.max(0.1, max.y - min.y);
    const sizeZ = Math.max(0.1, max.z - min.z);

    // Dimension offset distances based on object bounds (between 20mm and 100mm)
    const offsetX = Math.max(25, Math.min(80, sizeY * 0.1));
    const offsetY = Math.max(25, Math.min(80, sizeX * 0.1));
    const offsetZ = Math.max(25, Math.min(80, sizeX * 0.1));
    const tickLen = 15;

    const points: number[] = [];

    // --- 1. X Axis Dimension (Length / Width across front) ---
    // Dimension line along front bottom (min.y, min.z) offset in -z or -y
    const xLineY = min.y;
    const xLineZ = min.z - offsetZ;
    // Main dimension line
    points.push(min.x, xLineY, xLineZ, max.x, xLineY, xLineZ);
    // Extension witness lines from corners to dimension line
    points.push(min.x, min.y, min.z, min.x, xLineY, xLineZ - tickLen);
    points.push(max.x, min.y, min.z, max.x, xLineY, xLineZ - tickLen);
    // End tick lines
    points.push(min.x - tickLen / 2, xLineY, xLineZ + tickLen / 2, min.x + tickLen / 2, xLineY, xLineZ - tickLen / 2);
    points.push(max.x - tickLen / 2, xLineY, xLineZ + tickLen / 2, max.x + tickLen / 2, xLineY, xLineZ - tickLen / 2);

    // --- 2. Y Axis Dimension (Depth along side) ---
    const yLineX = max.x + offsetX;
    const yLineZ = min.z;
    // Main dimension line
    points.push(yLineX, min.y, yLineZ, yLineX, max.y, yLineZ);
    // Extension witness lines
    points.push(max.x, min.y, min.z, yLineX + tickLen, min.y, yLineZ);
    points.push(max.x, max.y, min.z, yLineX + tickLen, max.y, yLineZ);
    // End tick lines
    points.push(yLineX - tickLen / 2, min.y - tickLen / 2, yLineZ, yLineX + tickLen / 2, min.y + tickLen / 2, yLineZ);
    points.push(yLineX - tickLen / 2, max.y - tickLen / 2, yLineZ, yLineX + tickLen / 2, max.y + tickLen / 2, yLineZ);

    // --- 3. Z Axis Dimension (Height vertical) ---
    const zLineX = min.x - offsetX;
    const zLineY = min.y;
    // Main dimension line
    points.push(zLineX, zLineY, min.z, zLineX, zLineY, max.z);
    // Extension witness lines
    points.push(min.x, min.y, min.z, zLineX - tickLen, zLineY, min.z);
    points.push(min.x, min.y, max.z, zLineX - tickLen, zLineY, max.z);
    // End tick lines
    points.push(zLineX, zLineY - tickLen / 2, min.z - tickLen / 2, zLineX, zLineY + tickLen / 2, min.z + tickLen / 2);
    points.push(zLineX, zLineY - tickLen / 2, max.z - tickLen / 2, zLineX, zLineY + tickLen / 2, max.z + tickLen / 2);

    // Create line segments
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    this.lineMesh = new THREE.LineSegments(geom, this.lineMaterial);
    this.add(this.lineMesh);

    // Add Label Sprites
    const labelScale = Math.max(80, Math.min(220, Math.max(sizeX, sizeY, sizeZ) * 0.18));

    // X Label
    const xText = `X: ${Math.round(sizeX)} mm`;
    const xSprite = this.createTextSprite(xText, "#ef4444", labelScale);
    xSprite.position.set((min.x + max.x) / 2, xLineY, xLineZ - 18);
    this.add(xSprite);
    this.sprites.push(xSprite);

    // Y Label
    const yText = `Y: ${Math.round(sizeY)} mm`;
    const ySprite = this.createTextSprite(yText, "#10b981", labelScale);
    ySprite.position.set(yLineX + 18, (min.y + max.y) / 2, yLineZ);
    this.add(ySprite);
    this.sprites.push(ySprite);

    // Z Label
    const zText = `Z: ${Math.round(sizeZ)} mm`;
    const zSprite = this.createTextSprite(zText, "#38bdf8", labelScale);
    zSprite.position.set(zLineX - 18, zLineY, (min.z + max.z) / 2);
    this.add(zSprite);
    this.sprites.push(zSprite);
  }

  private createTextSprite(text: string, color: string, baseScale: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 72;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Rounded background pill
      ctx.fillStyle = "rgba(18, 20, 26, 0.88)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;

      const r = 12;
      const x = 6;
      const y = 6;
      const w = canvas.width - 12;
      const h = canvas.height - 12;

      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Small accent tag
      ctx.fillStyle = color;
      ctx.fillText(text.split(":")[0] + ":", canvas.width / 2 - 40, canvas.height / 2);

      ctx.fillStyle = "#f8fafc";
      ctx.fillText(text.split(":")[1] || "", canvas.width / 2 + 25, canvas.height / 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    this.textures.push(texture);

    const mat = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 999;
    sprite.scale.set(baseScale, (baseScale * 72) / 256, 1);
    return sprite;
  }

  public dispose(): void {
    this.clearRulers();
    this.lineMaterial.dispose();
  }
}
