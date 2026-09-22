import chalk from "chalk";

export const OCTOPUS_INTRO_DURATION_MS = 4_800;
const TAU = Math.PI * 2;
export const OCTOPUS_INTRO_TURNS = 3;
const MANTLE_RADIUS_X = 0.92;
const EYE_X = 0.34;
const EYE_Y = -0.18;
const DOTS = [[1, 8], [2, 16], [4, 32], [64, 128]] as const;
interface Point { x: number; y: number; z: number; face?: boolean; mantle?: boolean; grain?: number }

function facePoint(x: number, y: number): Point {
	const z = Math.sqrt(Math.max(0, 1 - (x / MANTLE_RADIUS_X) ** 2 - ((y + 0.35) / 1.04) ** 2)) * 0.64;
	return { x, y, z: z + 0.035, face: true };
}

/** Leave dark space around the eyes and smile so stippling cannot swallow the expression. */
function facialOpening(x: number, y: number): boolean {
	const eyeX = Math.abs(x) - EYE_X;
	const eye = (eyeX / 0.255) ** 2 + ((y - EYE_Y) / 0.32) ** 2 < 1;
	const smile = (x / 0.30) ** 2 + ((y - 0.29) / 0.19) ** 2 < 1;
	return eye || smile;
}

/** Eight curled arms and a rounded mantle, built as points rather than a flat image. */
function octopusPoints(): readonly Point[] {
	const points: Point[] = [];
	for (let latitude = 0; latitude <= 90; latitude++) {
		const v = latitude / 90 * Math.PI;
		for (let longitude = 0; longitude < 160; longitude++) {
			const u = longitude / 160 * TAU;
			const y = -0.35 - Math.cos(v) * 1.04;
			const x = Math.sin(v) * Math.cos(u) * MANTLE_RADIUS_X;
			const z = Math.sin(v) * Math.sin(u) * 0.64;
			const grain = Math.abs(Math.sin(latitude * 127.1 + longitude * 311.7) * 43758.5453) % 1;
			if (y <= 0.48 && !(z > 0 && facialOpening(x, y))) points.push({ x, y, z, mantle: true, grain });
		}
	}
	for (const side of [-1, 1]) for (let arm = 0; arm < 4; arm++) {
		const startX = 0.12 + arm * 0.17;
		const reach = 0.54 + arm * 0.18;
		const baseY = 0.54 - arm * 0.025;
		for (let sample = 0; sample <= 110; sample++) {
			const t = sample / 110;
			const angle = t * Math.PI;
			const x = startX + reach * Math.sin(angle * 0.66);
			const y = baseY + (0.63 - arm * 0.105) * Math.sin(angle) + t * arm * 0.06;
			const z = (arm - 1.5) * 0.19;
			const radius = 0.105 * (1 - t * 0.85);
			for (let ring = 0; ring < 16; ring += 8) {
				const around = ring / 16 * TAU;
				points.push({ x: side * x, y: y + radius * Math.cos(around), z: z + radius * Math.sin(around) });
			}
		}
	}
	for (const side of [-1, 1]) {
		for (let sample = 0; sample < 130; sample++) {
			const angle = sample / 130 * TAU;
			points.push(facePoint(side * EYE_X + Math.cos(angle) * 0.185, EYE_Y + Math.sin(angle) * 0.235));
		}
		for (let y = -0.10; y <= 0.10; y += 0.015) for (let x = -0.055; x <= 0.055; x += 0.015) {
			if ((x / 0.055) ** 2 + (y / 0.10) ** 2 <= 1) points.push(facePoint(side * EYE_X + x, EYE_Y + y));
		}
	}
	for (let sample = 0; sample <= 90; sample++) {
		const x = (sample / 90 * 2 - 1) * 0.23;
		points.push(facePoint(x, 0.22 + 0.13 * (1 - (x / 0.23) ** 2)));
	}
	return points;
}
const POINTS = octopusPoints();

/** Three full turns with a moving light plane, settling front-on. */
export function octopusScanFrame(elapsedMs: number, requestedWidth: number, requestedHeight: number): string[] {
	const width = Math.max(1, Math.min(80, Math.floor(requestedWidth)));
	const height = Math.max(1, Math.min(29, Math.floor(requestedHeight)));
	const progress = Math.min(1, Math.max(0, elapsedMs / OCTOPUS_INTRO_DURATION_MS));
	const angle = (progress < 1 ? progress * OCTOPUS_INTRO_TURNS : 0) * TAU;
	const cosine = Math.cos(angle), sine = Math.sin(angle);
	const scale = Math.min((width * 2 - 4) / 3.45, (height * 4 - 4) / 2.8);
	const bits = new Uint8Array(width * height);
	const light = new Float32Array(width * height);
	const face = new Uint8Array(width * height);
	const scanY = -1.5 + progress * 3;
	for (const point of POINTS) {
		const rotatedZ = -point.x * sine + point.z * cosine;
		if (point.face && cosine < 0.2) continue;
		// Only the front-facing silhouette is visible; facial arcs are separate points.
		if (point.mantle) {
			const normalZ = -point.x / (MANTLE_RADIUS_X ** 2) * sine + point.z / (0.64 ** 2) * cosine;
			if (normalZ < 0) continue;
			const rim = normalZ < 0.32;
			if (!rim && point.grain! > 0.12 + Math.min(1, normalZ / 1.56) * 0.36) continue;
		}
		const perspective = 1 + rotatedZ * 0.08;
		const x = Math.round((point.x * cosine + point.z * sine) * scale * perspective + width - 0.5);
		const y = Math.round((point.y + 0.12) * scale * perspective + height * 2 - 0.5);
		if (x < 0 || x >= width * 2 || y < 0 || y >= height * 4) continue;
		const cell = Math.floor(y / 4) * width + Math.floor(x / 2);
		bits[cell] = bits[cell]! | DOTS[y % 4]![x % 2]!;
		if (point.face) face[cell] = 1;
		const scan = progress < 1 ? Math.max(0, 1 - Math.abs(point.y - scanY) / 0.2) : 0;
		const rotatedX = point.x * cosine + point.z * sine;
		light[cell] = Math.max(light[cell]!, point.face ? 0.95 : 0.43 + (rotatedZ + 0.8) * 0.2 - rotatedX * 0.10 - point.y * 0.08 + scan * 0.4);
	}
	return Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, column) => {
		const cell = row * width + column;
		if (!bits[cell]) return " ";
		const character = String.fromCodePoint(0x2800 + bits[cell]!);
		if (process.env.NO_COLOR !== undefined) return character;
		const intensity = Math.min(1, light[cell]!);
		if (face[cell]) return chalk.rgb(255, 190, 158)(character);
		return chalk.rgb(Math.round(255 * intensity), Math.round(106 * intensity), Math.round(94 * intensity))(character);
	}).join(""));
}
