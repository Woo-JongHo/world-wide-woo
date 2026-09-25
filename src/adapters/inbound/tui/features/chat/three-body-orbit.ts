import { HIERARCHICAL_TRIPLE_PRESET, ThreeBodySimulation } from "@/core/domain/work/three-body-simulation";
import type { ThreeBodySnapshot, Vector2 }                 from "@/core/domain/work/three-body-simulation";
import { renderThreeBodyBrailleFrame }                     from "@/adapters/inbound/tui/features/chat/three-body-braille";
import type { ThreeBodyTrail }                             from "@/adapters/inbound/tui/features/chat/three-body-braille";

const CANVAS_HEIGHT                          = 21   ;
export const MAX_ORBIT_WIDTH                 = 126  ;
const PLAYBACK_SPEED                         = 6    ;
const REFERENCE_SAMPLE_STEP                  = 0.02 ;
const REFERENCE_FRAMES : ThreeBodySnapshot[] = []   ;

function referenceTrail(): readonly ThreeBodyTrail[] {
	const simulation = ThreeBodySimulation.fromPreset(HIERARCHICAL_TRIPLE_PRESET);
	const points = new Map<string, Vector2[]>(HIERARCHICAL_TRIPLE_PRESET.bodies.map(body => [body.id, []]));
	for (let elapsed = 0; elapsed <= HIERARCHICAL_TRIPLE_PRESET.referenceDuration; elapsed += REFERENCE_SAMPLE_STEP) {
		const snapshot = simulation.snapshot();
		REFERENCE_FRAMES.push(snapshot);
		for (const body of snapshot.bodies) {
			const trail = points.get(body.id);
			if (!trail) throw new Error(`Unknown simulation body: ${body.id}`);
			trail.push(body.position);
		}
		simulation.advance(Math.min(REFERENCE_SAMPLE_STEP, Math.max(0, HIERARCHICAL_TRIPLE_PRESET.referenceDuration - elapsed)));
	}
	return HIERARCHICAL_TRIPLE_PRESET.bodies.map(body => ({ bodyId: body.id, points: points.get(body.id) ?? [] }));
}

const HIERARCHICAL_REFERENCE_TRAIL = referenceTrail();

/** Cached physics samples keep accelerated welcome playback independent of render cost. */
export function threeBodyOrbitFrame(elapsedMs: number, requestedWidth: number, requestedHeight = CANVAS_HEIGHT): string[] {
	const elapsedSeconds                  = Math.max(0, elapsedMs) / 1_000 * PLAYBACK_SPEED                                         ;
	const duration                        = HIERARCHICAL_TRIPLE_PRESET.referenceDuration                                            ;
	const phaseSeconds                    = elapsedSeconds % duration                                                               ;
	const frameIndex                      = Math.min(REFERENCE_FRAMES.length - 1, Math.floor(phaseSeconds / REFERENCE_SAMPLE_STEP)) ;
	const snapshot                        = REFERENCE_FRAMES[frameIndex]                                                            ;
	const lifetime                        = duration * 1.15                                                                         ;
	const recentTrails : ThreeBodyTrail[] = []                                                                                      ;
	const cycle                           = Math.floor(elapsedSeconds / duration)                                                   ;
	for (let pass = Math.max(0, cycle - 2); pass <= cycle; pass += 1) {
		const start = Math.max(0, Math.ceil((elapsedSeconds - lifetime - pass * duration) / REFERENCE_SAMPLE_STEP));
		const end = pass === cycle ? frameIndex + 1 : REFERENCE_FRAMES.length;
		if (start >= end) continue;
		for (const trail of HIERARCHICAL_REFERENCE_TRAIL) recentTrails.push({
			bodyId: trail.bodyId,
			points: trail.points.slice(start, end),
			intensities: trail.points.slice(start, end).map((_, index) => {
				const age = elapsedSeconds - (pass * duration + (start + index) * REFERENCE_SAMPLE_STEP);
				return Math.pow(Math.max(0, 1 - age / lifetime), 0.65);
			}),
		});
	}
	return renderThreeBodyBrailleFrame(snapshot, {
		width     : Math.max(1, Math.min(MAX_ORBIT_WIDTH, requestedWidth)),
		height    : Math.max(1, Math.min(CANVAS_HEIGHT, requestedHeight)),
		trails    : HIERARCHICAL_REFERENCE_TRAIL,
		showTrail : true,
		recentTrails,
		trailOnlyHistory : true,
		bodyLabel        : "W",
		depthTexture     : true,
	});
}

export function threeBodyOrbitLabel(_width: number): string {
	return "";
}
