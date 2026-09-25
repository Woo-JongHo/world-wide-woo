import { truncateToWidth, visibleWidth }                   from "@earendil-works/pi-tui";
import type { Component }                                  from "@earendil-works/pi-tui";
import { HIERARCHICAL_TRIPLE_PRESET, ThreeBodySimulation } from "@/core/domain/work/three-body-simulation";
import type { ThreeBodySnapshot, Vector2 }                 from "@/core/domain/work/three-body-simulation";
import { colors }                                          from "@/adapters/inbound/tui/foundation/theme/theme";
import { renderThreeBodyBrailleFrame }                     from "@/adapters/inbound/tui/features/chat/three-body-braille";
import type { ThreeBodyTrail }                             from "@/adapters/inbound/tui/features/chat/three-body-braille";

export interface ThreeBodyLabOptions {
	readonly viewportHeight?: () => number;
	readonly onClose?: () => void;
}

const FRAME_INTERVAL_MS = 40;
const SPEEDS = [0.25, 0.5, 1, 2, 4, 8] as const;

function fit(text: string, width: number): string {
	const safeWidth = Math.max(0, width);
	const clipped = truncateToWidth(text, safeWidth);
	return clipped + " ".repeat(Math.max(0, safeWidth - visibleWidth(clipped)));
}

function referenceTrail(): readonly ThreeBodyTrail[] {
	const simulation = ThreeBodySimulation.fromPreset(HIERARCHICAL_TRIPLE_PRESET)                               ;
	const points     = new Map<string, Vector2[]>(HIERARCHICAL_TRIPLE_PRESET.bodies.map(body => [body.id, []])) ;
	const sampleStep = 0.02                                                                                     ;
	for (let elapsed = 0; elapsed <= HIERARCHICAL_TRIPLE_PRESET.referenceDuration; elapsed += sampleStep) {
		const snapshot = simulation.snapshot();
		for (const body of snapshot.bodies) {
			const trail = points.get(body.id);
			if (!trail) throw new Error(`Unknown simulation body: ${body.id}`);
			trail.push(body.position);
		}
		simulation.advance(Math.min(sampleStep, Math.max(0, HIERARCHICAL_TRIPLE_PRESET.referenceDuration - elapsed)));
	}
	return HIERARCHICAL_TRIPLE_PRESET.bodies.map(body => ({ bodyId: body.id, points: points.get(body.id) ?? [] }));
}

const HIERARCHICAL_REFERENCE_TRAIL = referenceTrail();

function topRule(width: number): string {
	if (width <= 1) return colors.border("─".repeat(width));
	const prefix = "┌─ ORBIT ";
	return colors.border(prefix + "─".repeat(Math.max(0, width - visibleWidth(prefix) - 1)) + "┐");
}

function bottomRule(width: number): string {
	return width <= 1 ? colors.border("─".repeat(width)) : colors.border("└" + "─".repeat(Math.max(0, width - 2)) + "┘");
}

function metricRows(snapshot: ThreeBodySnapshot, speed: number, width: number): string[] {
	const momentum = Math.hypot(snapshot.momentum.x, snapshot.momentum.y);
	const driftPercent = snapshot.relativeEnergyDrift * 100;
	return [
		fit(` TIME ${snapshot.time.toFixed(3)}   DT ${HIERARCHICAL_TRIPLE_PRESET.timeStep.toFixed(3)}   SPEED ${speed.toFixed(2)}×   ENERGY ${snapshot.energy.total.toFixed(6)}`, width),
		fit(` ΔE ${driftPercent >= 0 ? "+" : ""}${driftPercent.toExponential(3)}%   MOMENTUM ${momentum.toExponential(3)}   ANGULAR ${snapshot.angularMomentum.toExponential(3)}`, width),
	];
}

function bodyRows(snapshot: ThreeBodySnapshot, width: number): string[] {
	return [
		fit(" BODY   MASS          X          Y         VX         VY", width),
		...snapshot.bodies.map(body => fit(
			` ${body.id}      ${body.mass.toFixed(3).padStart(5)}  ${body.position.x.toFixed(6).padStart(10)} ${body.position.y.toFixed(6).padStart(10)} ${body.velocity.x.toFixed(6).padStart(10)} ${body.velocity.y.toFixed(6).padStart(10)}`,
			width,
		)),
	];
}

/** Interactive TUI surface backed by the actual nonlinear three-body ODE. */
export class ThreeBodyLabView implements Component {
	private simulation                                                      = ThreeBodySimulation.fromPreset(HIERARCHICAL_TRIPLE_PRESET) ;
	private paused                                                          = false                                                      ;
	private showTrail                                                       = true                                                       ;
	private speedIndex                                                      = SPEEDS.indexOf(4)                                          ;
	private timer                   : ReturnType<typeof setInterval> | null = null                                                       ;
	private previousFrameAt                                                 = 0                                                          ;
	private requestRender           : (() => void) | null                   = null                                                       ;
	private readonly viewportHeight : () => number                                                                                       ;
	private readonly onClose        : () => void                                                                                         ;

	constructor(options: ThreeBodyLabOptions = {}) {
		this.viewportHeight = options.viewportHeight ?? (() => 24);
		this.onClose = options.onClose ?? (() => undefined);
	}

	activate(requestRender: () => void): void {
		this.requestRender = requestRender;
		if (this.timer) return;
		this.previousFrameAt = performance.now();
		this.timer = setInterval(() => {
			const now = performance.now();
			const elapsed = Math.min(200, Math.max(0, now - this.previousFrameAt));
			this.previousFrameAt = now;
			this.advanceElapsed(elapsed);
			this.requestRender?.();
		}, FRAME_INTERVAL_MS);
		this.timer.unref?.();
		requestRender();
	}

	deactivate(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.requestRender = null;
	}

	dispose(): void {
		this.deactivate();
	}

	invalidate(): void {}

	advanceElapsed(elapsedMs: number): void {
		if (this.paused || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
		this.simulation.advance(elapsedMs / 1_000 * SPEEDS[this.speedIndex]);
	}

	handleInput(data: string): boolean {
		const key = data.toLowerCase();
		if (data === " ") this.paused = !this.paused;
		else if (key === "r") this.simulation.reset();
		else if (data === "+" || data === "=") this.speedIndex = Math.min(SPEEDS.length - 1, this.speedIndex + 1);
		else if (data === "-") this.speedIndex = Math.max(0, this.speedIndex - 1);
		else if (key === "t") this.showTrail = !this.showTrail;
		else if (data === "1") this.simulation.reset();
		else if (key === "q") { this.deactivate(); this.onClose(); }
		else return false;
		this.requestRender?.();
		return true;
	}

	render(requestedWidth: number): string[] {
		const width       = Math.max(1, Math.floor(requestedWidth))                                            ;
		const height      = Math.max(10, Math.floor(this.viewportHeight()))                                    ;
		const wide        = width >= 64 && height >= 20                                                        ;
		const fixedRows   = wide ? 12 : 8                                                                      ;
		const orbitHeight = Math.max(3, height - fixedRows)                                                    ;
		const snapshot    = this.simulation.snapshot()                                                         ;
		const state       = this.paused ? colors.warning("PAUSED") : colors.success("RUNNING")                 ;
		const title       = fit(` THREE BODY LAB  ·  ORBITING PAIR / GUARDIAN  ·  ${state}`, width)            ;
		const subtitle    = fit(" r̈ᵢ = G Σⱼ≠ᵢ mⱼ(rⱼ−rᵢ)/|rⱼ−rᵢ|³  ·  Velocity Verlet  ·  Braille 2×4", width) ;
		const frame = renderThreeBodyBrailleFrame(snapshot, {
			width     : Math.max(1, width - 4),
			height    : orbitHeight,
			trails    : HIERARCHICAL_REFERENCE_TRAIL,
			showTrail : this.showTrail,
		});
		const rows = [
			colors.accent(title),
			colors.muted(subtitle),
			fit(`[SPACE] ${this.paused ? "Resume" : "Pause"}   [R] Reset   [+/-] Speed   [T] Trail ${this.showTrail ? "on" : "off"}`, width),
			fit("[1] Hierarchical triple preset   [Q/Esc] Back", width),
			topRule(width),
			...frame.map(row => width < 4 ? fit(row, width) : `${colors.border("│")} ${fit(row, width - 4)} ${colors.border("│")}`),
			bottomRule(width),
			...metricRows(snapshot, SPEEDS[this.speedIndex], width),
			...(wide ? bodyRows(snapshot, width) : []),
		];
		return rows.slice(0, height);
	}
}
