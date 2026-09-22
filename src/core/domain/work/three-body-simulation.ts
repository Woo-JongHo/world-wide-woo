export interface Vector2 {
	readonly x: number;
	readonly y: number;
}

export interface ThreeBodyInitialBody {
	readonly id: "A" | "B" | "C";
	readonly mass: number;
	readonly position: Vector2;
	readonly velocity: Vector2;
}

export interface ThreeBodyPreset {
	readonly id: string;
	readonly name: string;
	readonly classification: string;
	readonly gravity: number;
	readonly timeStep: number;
	readonly referenceDuration: number;
	readonly bodies: readonly ThreeBodyInitialBody[];
}

export interface ThreeBodyEnergy {
	readonly kinetic: number;
	readonly potential: number;
	readonly total: number;
}

export interface ThreeBodySnapshot {
	readonly presetId: string;
	readonly time: number;
	readonly bodies: readonly ThreeBodyInitialBody[];
	readonly energy: ThreeBodyEnergy;
	readonly relativeEnergyDrift: number;
	readonly momentum: Vector2;
	readonly angularMomentum: number;
	readonly centerOfMass: Vector2;
}

interface MutableBody {
	id: ThreeBodyInitialBody["id"];
	mass: number;
	position: { x: number; y: number };
	velocity: { x: number; y: number };
}

const COLLISION_EPSILON_SQUARED = 1e-18;

export const HIERARCHICAL_TRIPLE_PRESET: ThreeBodyPreset = Object.freeze({
	id: "hierarchical-triple",
	name: "Orbiting Pair / Guardian",
	classification: "Hierarchical triple preset",
	gravity: 1,
	timeStep: 0.001,
	referenceDuration: 53.31459526,
	bodies: Object.freeze([
		Object.freeze({ id: "A", mass: 1, position: Object.freeze({ x: -2, y: 0.5 }), velocity: Object.freeze({ x: -0.70710678, y: -0.23570226 }) }),
		Object.freeze({ id: "B", mass: 1, position: Object.freeze({ x: -2, y: -0.5 }), velocity: Object.freeze({ x: 0.70710678, y: -0.23570226 }) }),
		Object.freeze({ id: "C", mass: 1, position: Object.freeze({ x: 4, y: 0 }), velocity: Object.freeze({ x: 0, y: 0.47140452 }) }),
	]),
});

function cloneBodies(source: readonly ThreeBodyInitialBody[]): MutableBody[] {
	return source.map(body => ({
		id: body.id,
		mass: body.mass,
		position: { x: body.position.x, y: body.position.y },
		velocity: { x: body.velocity.x, y: body.velocity.y },
	}));
}

function accelerations(bodies: readonly MutableBody[], gravity: number): Vector2[] {
	const result = bodies.map(() => ({ x: 0, y: 0 }));
	for (let left = 0; left < bodies.length; left += 1) {
		for (let right = left + 1; right < bodies.length; right += 1) {
			const a = bodies[left]!;
			const b = bodies[right]!;
			const dx = b.position.x - a.position.x;
			const dy = b.position.y - a.position.y;
			const distanceSquared = dx * dx + dy * dy;
			if (distanceSquared <= COLLISION_EPSILON_SQUARED) throw new Error(`Three-body collision singularity: ${a.id}/${b.id}`);
			const inverseDistanceCubed = 1 / (distanceSquared * Math.sqrt(distanceSquared));
			const leftScale = gravity * b.mass * inverseDistanceCubed;
			const rightScale = gravity * a.mass * inverseDistanceCubed;
			result[left]!.x += dx * leftScale;
			result[left]!.y += dy * leftScale;
			result[right]!.x -= dx * rightScale;
			result[right]!.y -= dy * rightScale;
		}
	}
	return result;
}

function energy(bodies: readonly MutableBody[], gravity: number): ThreeBodyEnergy {
	let kinetic = 0;
	let potential = 0;
	for (const body of bodies) kinetic += 0.5 * body.mass * (body.velocity.x ** 2 + body.velocity.y ** 2);
	for (let left = 0; left < bodies.length; left += 1) {
		for (let right = left + 1; right < bodies.length; right += 1) {
			const a = bodies[left]!;
			const b = bodies[right]!;
			const distance = Math.hypot(b.position.x - a.position.x, b.position.y - a.position.y);
			if (distance * distance <= COLLISION_EPSILON_SQUARED) throw new Error(`Three-body collision singularity: ${a.id}/${b.id}`);
			potential -= gravity * a.mass * b.mass / distance;
		}
	}
	return { kinetic, potential, total: kinetic + potential };
}

export class ThreeBodySimulation {
	private bodies: MutableBody[];
	private timeValue = 0;
	private readonly initialEnergy: number;

	private constructor(private readonly preset: ThreeBodyPreset) {
		this.bodies = cloneBodies(preset.bodies);
		this.initialEnergy = energy(this.bodies, preset.gravity).total;
	}

	static fromPreset(preset: ThreeBodyPreset): ThreeBodySimulation {
		if (preset.bodies.length !== 3) throw new Error("Three-body simulation requires exactly three bodies");
		if (!(preset.gravity > 0) || !(preset.timeStep > 0) || !(preset.referenceDuration > 0)) throw new Error("Three-body preset constants must be positive");
		if (preset.bodies.some(body => !(body.mass > 0))) throw new Error("Three-body masses must be positive");
		return new ThreeBodySimulation(preset);
	}

	reset(): void {
		this.bodies = cloneBodies(this.preset.bodies);
		this.timeValue = 0;
	}

	advance(duration: number): void {
		if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Three-body duration must be a finite non-negative number");
		let remaining = duration;
		while (remaining > 1e-12) {
			const step = Math.min(this.preset.timeStep, remaining);
			this.step(step);
			remaining -= step;
		}
	}

	snapshot(): ThreeBodySnapshot {
		const currentEnergy = energy(this.bodies, this.preset.gravity);
		const totalMass = this.bodies.reduce((sum, body) => sum + body.mass, 0);
		const momentum = this.bodies.reduce((sum, body) => ({
			x: sum.x + body.mass * body.velocity.x,
			y: sum.y + body.mass * body.velocity.y,
		}), { x: 0, y: 0 });
		const centerOfMass = this.bodies.reduce((sum, body) => ({
			x: sum.x + body.mass * body.position.x / totalMass,
			y: sum.y + body.mass * body.position.y / totalMass,
		}), { x: 0, y: 0 });
		const angularMomentum = this.bodies.reduce((sum, body) => sum + body.mass * (
			body.position.x * body.velocity.y - body.position.y * body.velocity.x
		), 0);
		return {
			presetId: this.preset.id,
			time: this.timeValue,
			bodies: this.bodies.map(body => ({
				id: body.id,
				mass: body.mass,
				position: { ...body.position },
				velocity: { ...body.velocity },
			})),
			energy: currentEnergy,
			relativeEnergyDrift: (currentEnergy.total - this.initialEnergy) / Math.abs(this.initialEnergy),
			momentum,
			angularMomentum,
			centerOfMass,
		};
	}

	private step(step: number): void {
		const before = accelerations(this.bodies, this.preset.gravity);
		const halfStepSquared = 0.5 * step * step;
		for (const [index, body] of this.bodies.entries()) {
			const acceleration = before[index]!;
			body.position.x += body.velocity.x * step + acceleration.x * halfStepSquared;
			body.position.y += body.velocity.y * step + acceleration.y * halfStepSquared;
		}
		const after = accelerations(this.bodies, this.preset.gravity);
		for (const [index, body] of this.bodies.entries()) {
			body.velocity.x += 0.5 * (before[index]!.x + after[index]!.x) * step;
			body.velocity.y += 0.5 * (before[index]!.y + after[index]!.y) * step;
		}
		this.timeValue += step;
	}
}
