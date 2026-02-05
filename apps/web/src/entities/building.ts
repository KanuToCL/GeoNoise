/**
 * Building entity for GeoNoise
 * Represents rectangular or polygon buildings that affect sound propagation
 */

export type Point = { x: number; y: number };

export type BuildingData = {
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_height: number;
  color: string;
  /** Optional polygon vertices for non-rectangular buildings (4+ points, CCW order) */
  vertices?: Point[];
};

export const DEFAULT_BUILDING_COLOR = '#9aa3ad';
export const BUILDING_MIN_SIZE = 2;
export const BUILDING_HANDLE_RADIUS = 4;
export const BUILDING_HANDLE_HIT_RADIUS = 10;
export const BUILDING_ROTATION_HANDLE_OFFSET_PX = 20;
export const BUILDING_ROTATION_HANDLE_RADIUS = 5;

export class Building {
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_height: number;
  color: string;
  selected: boolean;
  /** Optional polygon vertices for non-rectangular buildings */
  private _vertices?: Point[];

  constructor(data: Partial<BuildingData> & { id: string }) {
    this.id = data.id;
    this.name = data.name;
    this.x = data.x ?? 0;
    this.y = data.y ?? 0;
    this.width = data.width ?? 10;
    this.height = data.height ?? 10;
    this.rotation = data.rotation ?? 0;
    this.z_height = data.z_height ?? 10;
    this.color = data.color ?? DEFAULT_BUILDING_COLOR;
    this.selected = false;
    this._vertices = data.vertices ? [...data.vertices] : undefined;
  }

  /** Check if this is a polygon building (non-rectangular) */
  isPolygon(): boolean {
    return this._vertices !== undefined && this._vertices.length >= 3;
  }

  toData(): BuildingData {
    const data: BuildingData = {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      z_height: this.z_height,
      color: this.color,
    };
    if (this._vertices) {
      data.vertices = [...this._vertices];
    }
    return data;
  }

  getVertices(): Point[] {
    // For polygon buildings, return stored vertices directly
    if (this._vertices && this._vertices.length >= 3) {
      return [...this._vertices];
    }

    // For rectangular buildings, compute from center/size/rotation
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const corners = [
      { x: -halfWidth, y: halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: -halfWidth, y: -halfHeight },
    ];
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return corners.map((corner) => ({
      x: this.x + corner.x * cos - corner.y * sin,
      y: this.y + corner.x * sin + corner.y * cos,
    }));
  }

  /** Translate the building by dx, dy. For polygon buildings, also translates all vertices. */
  translate(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    if (this._vertices) {
      for (const v of this._vertices) {
        v.x += dx;
        v.y += dy;
      }
    }
  }

  getRotationHandlePosition(handleOffset: number): Point {
    if (this._vertices && this._vertices.length >= 3) {
      // For polygon buildings, find the vertex furthest from center in Y direction
      // and place handle beyond that
      let maxDistFromCenter = 0;
      let furthestVertex = this._vertices[0];
      for (const v of this._vertices) {
        const dist = Math.sqrt((v.x - this.x) ** 2 + (v.y - this.y) ** 2);
        if (dist > maxDistFromCenter) {
          maxDistFromCenter = dist;
          furthestVertex = v;
        }
      }
      // Direction from center to furthest vertex
      const dx = furthestVertex.x - this.x;
      const dy = furthestVertex.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        const normX = dx / dist;
        const normY = dy / dist;
        return {
          x: this.x + normX * (dist + handleOffset),
          y: this.y + normY * (dist + handleOffset),
        };
      }
    }
    // For rectangular buildings, use existing logic
    const localX = 0;
    const localY = this.height / 2 + handleOffset;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: this.x + localX * cos - localY * sin,
      y: this.y + localX * sin + localY * cos,
    };
  }

  renderControls(
    ctx: CanvasRenderingContext2D,
    toCanvas: (point: Point) => Point,
    options: {
      stroke: string;
      lineWidth: number;
      dash: number[];
      handleFill: string;
      handleStroke: string;
      handleRadius: number;
      rotationHandleOffset: number;
      rotationHandleRadius: number;
      rotationHandleStroke: string;
    }
  ): void {
    if (!this.selected) return;
    const vertices = this.getVertices();
    const first = toCanvas(vertices[0]);
    ctx.save();
    ctx.strokeStyle = options.stroke;
    ctx.lineWidth = options.lineWidth;
    ctx.setLineDash(options.dash);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    for (const corner of vertices.slice(1)) {
      const point = toCanvas(corner);
      ctx.lineTo(point.x, point.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = options.handleFill;
    ctx.strokeStyle = options.handleStroke;
    ctx.lineWidth = 1.5;
    for (const corner of vertices) {
      const point = toCanvas(corner);
      ctx.beginPath();
      ctx.arc(point.x, point.y, options.handleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    const handleOffset = options.rotationHandleOffset;
    const handleWorld = this.getRotationHandlePosition(handleOffset);
    const topCenterWorld = this.getRotationHandlePosition(0);
    const handleCanvas = toCanvas(handleWorld);
    const topCenterCanvas = toCanvas(topCenterWorld);
    ctx.strokeStyle = options.rotationHandleStroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(topCenterCanvas.x, topCenterCanvas.y);
    ctx.lineTo(handleCanvas.x, handleCanvas.y);
    ctx.stroke();

    ctx.fillStyle = options.handleFill;
    ctx.strokeStyle = options.handleStroke;
    ctx.beginPath();
    ctx.arc(handleCanvas.x, handleCanvas.y, options.rotationHandleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
