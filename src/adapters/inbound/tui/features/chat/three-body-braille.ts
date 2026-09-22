import type { ThreeBodyInitialBody, ThreeBodySnapshot, Vector2 } from "../../../../../core/domain/work/three-body-simulation";
import chalk from "chalk";
import { colors } from "../../foundation/theme/theme";

export interface ThreeBodyTrail {
	readonly bodyId: ThreeBodyInitialBody["id"];
	readonly points: readonly Vector2[];
	readonly intensities?: readonly number[];
}

export interface ThreeBodyBrailleOptions {
	readonly width: number;
	readonly height: number;
	readonly trails: readonly ThreeBodyTrail[];
	readonly showTrail: boolean;
	readonly recentTrails?: readonly ThreeBodyTrail[];
	readonly trailOnlyHistory?: boolean;
	readonly bodyLabel?: string;
	readonly depthTexture?: boolean;
}

type Ink = (text: string) => string;
type Pixel = readonly [number, number];

type Rgb = readonly [number, number, number];

const ORBIT_STOPS: readonly Rgb[] = [
	[92, 104, 196],
	[144, 119, 205],
	[201, 128, 126],
	[255, 142, 32],
];

const BODY_COLORS: Readonly<Record<ThreeBodyInitialBody["id"], Rgb>> = {
	A: [132, 210, 255],
	B: [221, 171, 255],
	C: [255, 184, 92],
};

function bodyInk(id: ThreeBodyInitialBody["id"], intensity = 1): Ink {
	return text => chalk.rgb(...mix([9, 10, 18], BODY_COLORS[id], intensity))(text);
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
	const value = Math.max(0, Math.min(1, amount));
	return [
		Math.round(from[0] + (to[0] - from[0]) * value),
		Math.round(from[1] + (to[1] - from[1]) * value),
		Math.round(from[2] + (to[2] - from[2]) * value),
	];
}

function orbitInk(position: number, intensity = 1): Ink {
	const wrapped = ((position % 1) + 1) % 1;
	const scaled = wrapped * (ORBIT_STOPS.length - 1);
	const index = Math.min(ORBIT_STOPS.length - 2, Math.floor(scaled));
	const color = mix(ORBIT_STOPS[index]!, ORBIT_STOPS[index + 1]!, scaled - index);
	const shaded = mix([9, 10, 18], color, intensity);
	return text => chalk.rgb(...shaded)(text);
}

const BRAILLE_BITS = [
	[0x01, 0x08],
	[0x02, 0x10],
	[0x04, 0x20],
	[0x40, 0x80],
] as const;

class BrailleCanvas {
	private readonly bits: Uint8Array;
	private readonly ink: Array<Ink | undefined>;
	private readonly priority: Uint8Array;

	constructor(readonly width: number, readonly height: number) {
		this.bits = new Uint8Array(width * height);
		this.ink = new Array<Ink | undefined>(width * height);
		this.priority = new Uint8Array(width * height);
	}

	plot(pixelX: number, pixelY: number, ink: Ink, priority: number): void {
		if (pixelX < 0 || pixelY < 0 || pixelX >= this.width * 2 || pixelY >= this.height * 4) return;
		const cellX = Math.floor(pixelX / 2);
		const cellY = Math.floor(pixelY / 4);
		const index = cellY * this.width + cellX;
		this.bits[index] = (this.bits[index] ?? 0) | BRAILLE_BITS[pixelY % 4]![pixelX % 2]!;
		if (priority >= (this.priority[index] ?? 0)) {
			this.priority[index] = priority;
			this.ink[index] = ink;
		}
	}

	rows(labels: readonly { x: number; y: number; text: string; ink: Ink }[], depthTexture = false): string[] {
		const rows = Array.from({ length: this.height }, (_, y) => Array.from({ length: this.width }, (_, x) => {
			const index = y * this.width + x;
			const bits = this.bits[index] ?? 0;
			if (!bits) return " ";
			const density = bits.toString(2).replaceAll("0", "").length;
			const character = depthTexture && this.priority[index] === 4
				? (density >= 6 ? "#" : density >= 3 ? ":" : ".")
				: String.fromCodePoint(0x2800 + bits);
			return (this.ink[index] ?? colors.muted)(character);
		}));
		const occupied = new Set<string>();
		for (const label of labels) {
			if (label.x < 0 || label.y < 0 || label.x >= this.width || label.y >= this.height) continue;
			const candidates = [label.x, label.x - 1, label.x + 1, label.x - 2, label.x + 2];
			const x = candidates.find(candidate => candidate >= 0 && candidate < this.width && !occupied.has(`${candidate}:${label.y}`));
			if (x === undefined) continue;
			rows[label.y]![x] = label.ink(label.text);
			occupied.add(`${x}:${label.y}`);
		}
		return rows.map(row => row.join(""));
	}
}

function bounds(snapshot: ThreeBodySnapshot, trails: readonly ThreeBodyTrail[]): { center: Vector2; rangeX: number; rangeY: number } {
	const points = [
		...snapshot.bodies.map(body => body.position),
		...trails.flatMap(trail => trail.points),
	];
	const xs = points.map(point => point.x);
	const ys = points.map(point => point.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const rawRangeX = Math.max(1e-6, maxX - minX);
	const rawRangeY = Math.max(1e-6, maxY - minY);
	return {
		center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
		rangeX: rawRangeX * 1.12,
		rangeY: rawRangeY * 1.18,
	};
}

function viewDepth(point: Vector2): number {
	return point.x * 0.342 + point.y * 0.94;
}

function projector(snapshot: ThreeBodySnapshot, trails: readonly ThreeBodyTrail[], pixelWidth: number, pixelHeight: number): (point: Vector2) => Pixel {
	// Tilt the physical plane toward the viewer; the simulation itself stays planar.
	const tilt = (point: Vector2): Vector2 => {
		const x = point.x * 0.94 - point.y * 0.342;
		const depth = viewDepth(point);
		const perspective = 1 / Math.max(0.65, Math.min(1.35, 1 + depth * 0.035));
		return { x: x * perspective, y: depth * 0.62 * perspective };
	};
	const world = bounds({ ...snapshot, bodies: snapshot.bodies.map(body => ({ ...body, position: tilt(body.position) })) }, trails.map(trail => ({ ...trail, points: trail.points.map(tilt) })));
	const scale = Math.min((pixelWidth - 1) / world.rangeX, (pixelHeight - 1) / world.rangeY);
	return point => {
		const projected = tilt(point);
		return [
			Math.round((projected.x - world.center.x) * scale + (pixelWidth - 1) / 2),
			Math.round((world.center.y - projected.y) * scale + (pixelHeight - 1) / 2),
		];
	};
}

function line(canvas: BrailleCanvas, from: Pixel, to: Pixel, ink: Ink, priority: number): void {
	let x = from[0];
	let y = from[1];
	const dx = Math.abs(to[0] - x);
	const sx = x < to[0] ? 1 : -1;
	const dy = -Math.abs(to[1] - y);
	const sy = y < to[1] ? 1 : -1;
	let error = dx + dy;
	for (;;) {
		canvas.plot(x, y, ink, priority);
		if (x === to[0] && y === to[1]) break;
		const doubled = error * 2;
		if (doubled >= dy) { error += dy; x += sx; }
		if (doubled <= dx) { error += dx; y += sy; }
	}
}

/** Render a physics snapshot and supplied world-space trails into a 2×4 Braille framebuffer. */
export function renderThreeBodyBrailleFrame(snapshot: ThreeBodySnapshot, options: ThreeBodyBrailleOptions): string[] {
	const width = Math.max(1, Math.floor(options.width));
	const height = Math.max(1, Math.floor(options.height));
	const visibleTrails = options.showTrail && !options.trailOnlyHistory ? options.trails : [];
	const project = projector(snapshot, options.trails, width * 2, height * 4);
	const canvas = new BrailleCanvas(width, height);

	for (const trail of visibleTrails) {
		for (let index = 1; index < trail.points.length; index += 1) {
			const position = index / Math.max(1, trail.points.length - 1);
			const from = project(trail.points[index - 1]!);
			const to = project(trail.points[index]!);
			const depth = viewDepth(trail.points[index]!);
			line(canvas, from, to, orbitInk(position, depth < 0 ? 0.42 : 0.2), 2);
		}
	}
	if (options.showTrail) for (const trail of options.recentTrails ?? []) {
		for (let index = 1; index < trail.points.length; index += 1) {
			const ageIntensity = trail.intensities?.[index] ?? (0.25 + 0.75 * index / Math.max(1, trail.points.length - 1));
			const depthIntensity = viewDepth(trail.points[index]!) < 0 ? 1 : 0.55;
			line(canvas, project(trail.points[index - 1]!), project(trail.points[index]!), bodyInk(trail.bodyId, ageIntensity * depthIntensity), 3);
		}
	}

	const labels = snapshot.bodies.map(body => {
		const [pixelX, pixelY] = project(body.position);
		const radius = viewDepth(body.position) < 0 ? 3 : 2;
		for (let dy = -radius; dy <= radius; dy += 1) {
			for (let dx = -radius; dx <= radius; dx += 1) {
				const distance = Math.hypot(dx, dy);
				if (distance <= radius) canvas.plot(pixelX + dx, pixelY + dy, bodyInk(body.id, 1 - distance / (radius + 1) * 0.6), 4);
			}
		}
		return {
			x: Math.max(0, Math.min(width - 1, Math.floor(pixelX / 2))),
			y: Math.max(0, Math.min(height - 1, Math.floor(pixelY / 4))),
			text: options.bodyLabel ?? body.id,
			ink: (text: string) => chalk.bold.rgb(...BODY_COLORS[body.id])(text),
		};
	});
	return canvas.rows(labels, options.depthTexture);
}
