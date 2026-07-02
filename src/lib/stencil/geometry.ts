export type Point = { x: number; y: number };

export type PathNode = {
  id: string;
  points: Point[];
  area?: number;
  isHole?: boolean;
};