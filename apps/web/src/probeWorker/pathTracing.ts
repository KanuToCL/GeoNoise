/**
 * Path Tracing for Probe Worker
 */

import type { ProbeRequest } from '@geonoise/engine';
import type { Point2D, Point3D, WallSegment, RayPath, BuildingFootprint, BuildingDiffractionPath, BarrierDiffractionResult, ProbeConfig, BarrierSideDiffractionMode } from './types';
import { distance2D, distance3D, cross2D, segmentIntersection, mirrorPoint2D, isPathBlocked, pointInPolygon, segmentIntersectsPolygon, findBlockingBuilding, findVisibleCorners, EPSILON } from './geometry';

export interface WallReflectionPath extends RayPath { reflectionPoint2D: Point2D; }

export function extractWallSegments(walls: ProbeRequest['walls']): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const wall of walls) {
    const verts = wall.vertices;
    if (wall.type === 'barrier') {
      for (let i = 0; i < verts.length - 1; i++) {
        segments.push({ p1: verts[i], p2: verts[i + 1], height: wall.height, type: 'barrier', id: wall.id });
      }
    } else {
      for (let i = 0; i < verts.length; i++) {
        segments.push({ p1: verts[i], p2: verts[(i + 1) % verts.length], height: wall.height, type: 'building', id: wall.id });
      }
    }
  }
  return segments;
}

export function extractBuildingFootprints(walls: ProbeRequest['walls']): BuildingFootprint[] {
  const buildings: BuildingFootprint[] = [];
  for (const wall of walls) {
    if (wall.type === 'building' && wall.vertices.length >= 3) {
      buildings.push({ id: wall.id, vertices: wall.vertices, height: wall.height, groundElevation: 0 });
    }
  }
  return buildings;
}

export function traceDirectPath(source: Point3D, receiver: Point3D, barriers: WallSegment[]): RayPath {
  const s2d = { x: source.x, y: source.y };
  const r2d = { x: receiver.x, y: receiver.y };
  const dist = distance3D(source, receiver);
  const blocked = isPathBlocked(s2d, r2d, barriers);
  return { type: 'direct', totalDistance: dist, directDistance: dist, pathDifference: 0, reflectionPhaseChange: 0, absorptionFactor: 1, valid: !blocked };
}

export function traceWallReflectionPaths(source: Point3D, receiver: Point3D, segments: WallSegment[], barriers: WallSegment[], buildings: BuildingFootprint[]): WallReflectionPath[] {
  const paths: WallReflectionPath[] = [];
  const buildingSegments = segments.filter((s) => s.type === 'building');

  for (const segment of buildingSegments) {
    const imagePos2D = mirrorPoint2D({ x: source.x, y: source.y }, segment);
    const r2d = { x: receiver.x, y: receiver.y };
    const reflPoint = segmentIntersection(r2d, imagePos2D, segment.p1, segment.p2);
    if (!reflPoint) continue;

    const segLen = distance2D(segment.p1, segment.p2);
    const d1 = distance2D(reflPoint, segment.p1);
    const d2 = distance2D(reflPoint, segment.p2);
    if (d1 > segLen + EPSILON || d2 > segLen + EPSILON) continue;

    const reflPoint3D: Point3D = { x: reflPoint.x, y: reflPoint.y, z: Math.min(segment.height, Math.max(source.z, receiver.z)) };
    const s2d = { x: source.x, y: source.y };

    if (isPathBlocked(s2d, reflPoint, barriers, segment.id) || isPathBlocked(reflPoint, r2d, barriers, segment.id)) continue;

    const otherBuildings = buildings.filter((b) => b.id !== segment.id);
    const leg1Block = findBlockingBuilding(source, reflPoint3D, otherBuildings);
    const leg2Block = findBlockingBuilding(reflPoint3D, receiver, otherBuildings);

    const sameBuilding = buildings.find((b) => b.id === segment.id);
    let blockedBySameBuilding = false;
    if (sameBuilding) {
      if (pointInPolygon({ x: source.x, y: source.y }, sameBuilding.vertices) || pointInPolygon({ x: receiver.x, y: receiver.y }, sameBuilding.vertices)) {
        blockedBySameBuilding = true;
      } else {
        const wallDx = segment.p2.x - segment.p1.x, wallDy = segment.p2.y - segment.p1.y;
        const wallLen = Math.sqrt(wallDx * wallDx + wallDy * wallDy);
        if (wallLen > EPSILON) {
          const nx = -wallDy / wallLen, ny = wallDx / wallLen;
          const toSrcX = source.x - reflPoint.x, toSrcY = source.y - reflPoint.y;
          const sign = (toSrcX * nx + toSrcY * ny) >= 0 ? 1 : -1;
          const checkPoint: Point3D = { x: reflPoint.x + sign * nx * 0.01, y: reflPoint.y + sign * ny * 0.01, z: reflPoint3D.z };
          blockedBySameBuilding = findBlockingBuilding(source, checkPoint, [sameBuilding]).blocked || findBlockingBuilding(checkPoint, receiver, [sameBuilding]).blocked;
        }
      }
    }

    if (leg1Block.blocked || leg2Block.blocked || blockedBySameBuilding) continue;

    const totalDist = distance3D(source, reflPoint3D) + distance3D(reflPoint3D, receiver);
    paths.push({ type: 'wall', totalDistance: totalDist, directDistance: distance3D(source, receiver), pathDifference: totalDist - distance3D(source, receiver), reflectionPhaseChange: 0, absorptionFactor: 0.9, valid: reflPoint3D.z <= segment.height, reflectionPoint2D: reflPoint });
  }
  return paths;
}

function computeBarrierLength(barrier: WallSegment): number { return distance2D(barrier.p1, barrier.p2); }

function shouldUseSideDiffraction(barrier: WallSegment, mode: BarrierSideDiffractionMode, lengthThreshold = 50): boolean {
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  return computeBarrierLength(barrier) < lengthThreshold;
}

function computeSidePathDifference(source: Point3D, receiver: Point3D, edgePoint: Point2D, edgeHeight: number): { pathDiff: number; totalDistance: number; edge3D: Point3D } {
  const edge3D: Point3D = { x: edgePoint.x, y: edgePoint.y, z: Math.min(edgeHeight, Math.max(source.z, receiver.z)) };
  const totalDistance = distance3D(source, edge3D) + distance3D(edge3D, receiver);
  return { pathDiff: totalDistance - distance3D(source, receiver), totalDistance, edge3D };
}

export function traceBarrierDiffractionPaths(source: Point3D, receiver: Point3D, barrier: WallSegment, config: ProbeConfig): BarrierDiffractionResult {
  const result: BarrierDiffractionResult = { topPath: null, leftPath: null, rightPath: null };
  const s2d = { x: source.x, y: source.y }, r2d = { x: receiver.x, y: receiver.y };
  const directDist = distance3D(source, receiver);

  const intersection = segmentIntersection(s2d, r2d, barrier.p1, barrier.p2);
  if (intersection) {
    const diffPoint: Point3D = { x: intersection.x, y: intersection.y, z: barrier.height };
    const totalDist = distance3D(source, diffPoint) + distance3D(diffPoint, receiver);
    result.topPath = { type: 'diffracted', totalDistance: totalDist, directDistance: directDist, pathDifference: totalDist - directDist, reflectionPhaseChange: -Math.PI / 4, absorptionFactor: 1, valid: true };
  }

  if (shouldUseSideDiffraction(barrier, config.barrierSideDiffraction)) {
    const leftResult = computeSidePathDifference(source, receiver, barrier.p1, barrier.height);
    result.leftPath = { type: 'diffracted', totalDistance: leftResult.totalDistance, directDistance: directDist, pathDifference: leftResult.pathDiff, reflectionPhaseChange: -Math.PI / 4, absorptionFactor: 1, valid: leftResult.pathDiff >= 0 };
    const rightResult = computeSidePathDifference(source, receiver, barrier.p2, barrier.height);
    result.rightPath = { type: 'diffracted', totalDistance: rightResult.totalDistance, directDistance: directDist, pathDifference: rightResult.pathDiff, reflectionPhaseChange: -Math.PI / 4, absorptionFactor: 1, valid: rightResult.pathDiff >= 0 };
  }
  return result;
}

export function traceBuildingDiffractionPaths(source: Point3D, receiver: Point3D, building: BuildingFootprint, entryPoint: Point2D, exitPoint: Point2D): BuildingDiffractionPath[] {
  const paths: BuildingDiffractionPath[] = [];
  const buildingTop = building.groundElevation + building.height;
  const directDist = distance3D(source, receiver);

  const roofEntry: Point3D = { x: entryPoint.x, y: entryPoint.y, z: buildingTop };
  const roofExit: Point3D = { x: exitPoint.x, y: exitPoint.y, z: buildingTop };
  const roofDist = distance3D(source, roofEntry) + distance3D(roofEntry, roofExit) + distance3D(roofExit, receiver);
  paths.push({ type: 'roof', waypoints: [source, roofEntry, roofExit, receiver], totalDistance: roofDist, pathDifference: roofDist - directDist, valid: true, diffractionPoints: 2 });

  const s2d = { x: source.x, y: source.y }, r2d = { x: receiver.x, y: receiver.y };
  const visibleFromSource = findVisibleCorners(s2d, building);
  const visibleFromReceiver = findVisibleCorners(r2d, building);

  for (const corner of visibleFromSource) {
    if (visibleFromReceiver.some((c) => Math.abs(c.x - corner.x) < EPSILON && Math.abs(c.y - corner.y) < EPSILON)) {
      const cornerResult1 = segmentIntersectsPolygon(s2d, corner, building.vertices);
      const cornerResult2 = segmentIntersectsPolygon(corner, r2d, building.vertices);
      const leg1Valid = !cornerResult1.intersects || (cornerResult1.entryPoint !== null && distance2D(cornerResult1.entryPoint, corner) < EPSILON);
      const leg2Valid = !cornerResult2.intersects || (cornerResult2.entryPoint !== null && distance2D(cornerResult2.entryPoint, corner) < EPSILON);

      if (leg1Valid && leg2Valid) {
        const cornerZ = Math.min(source.z, receiver.z, buildingTop);
        const corner3D: Point3D = { x: corner.x, y: corner.y, z: cornerZ };
        const cornerDist = distance3D(source, corner3D) + distance3D(corner3D, receiver);
        const crossProd = cross2D({ x: r2d.x - s2d.x, y: r2d.y - s2d.y }, { x: corner.x - s2d.x, y: corner.y - s2d.y });
        paths.push({ type: crossProd > 0 ? 'corner-left' : 'corner-right', waypoints: [source, corner3D, receiver], totalDistance: cornerDist, pathDifference: cornerDist - directDist, valid: true, diffractionPoints: 1 });
      }
    }
  }
  return paths;
}
