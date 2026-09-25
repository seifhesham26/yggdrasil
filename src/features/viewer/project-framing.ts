import { Vector3 } from "three";

export function projectFramePosition(center: Vector3, distance: number, savedPosition: [number, number, number], savedTarget: [number, number, number]): Vector3 {
  const direction = new Vector3(...savedPosition).sub(new Vector3(...savedTarget));
  if (direction.lengthSq() < 1e-18) direction.set(3, 2, 5);
  return center.clone().addScaledVector(direction.normalize(), distance);
}
