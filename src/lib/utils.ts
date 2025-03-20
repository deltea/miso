export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function lerpAngle(a: number, b: number, t: number) {
  // const diff = Math.abs(b - a) % (2 * Math.PI);
  // const shortest = 2 * diff % (2 * Math.PI) - diff;
  // return a + shortest * t;

  const difference = (b - a) % (Math.PI * 2)
	const short_angle_dist = (2 * difference) % (Math.PI * 2) - difference
	return a + short_angle_dist * t;
}

export function radToDeg(n: number) {
  return n * (180 / Math.PI);
}
