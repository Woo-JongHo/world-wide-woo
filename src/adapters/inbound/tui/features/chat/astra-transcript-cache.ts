import type { TranscriptCacheMetrics } from "@/core/domain/observability/cache-telemetry";

export interface TranscriptBlock {
	readonly key          : string               ;
	readonly markdownKeys : readonly string[]    ;
	readonly reuse        : TranscriptBlockReuse ;
	render(width: number): string[];
}

export type TranscriptBlockReuse =
	| { readonly kind: "message"; readonly immutable: boolean; readonly inputs: readonly unknown[] }
	| { readonly kind: "tnote"; readonly immutable: boolean; readonly inputs: readonly unknown[] }
	| { readonly kind: "activity"; readonly immutable: boolean; readonly source: object; readonly expanded: boolean }
	| { readonly kind: "never" };

interface TranscriptWidthIndex {
	readonly width        : number            ;
	readonly counts       : readonly number[] ;
	readonly prefix       : readonly number[] ;
	readonly rowCount     : number            ;
	readonly logicalBytes : number            ;
}

interface TranscriptGeneration {
	readonly id     : number                            ;
	readonly kind   : "durable" | "volatile"            ;
	readonly blocks : readonly TranscriptBlock[]        ;
	readonly widths : Map<number, TranscriptWidthIndex> ;
}

interface DurableTranscriptGeneration<Revision> extends TranscriptGeneration {
	readonly kind            : "durable" ;
	readonly expanded        : boolean   ;
	snapshotVersion          : number    ;
	trustedImmutableRevision : boolean   ;
	revision                 : Revision  ;
}

interface VolatileTranscriptGeneration<Revision> extends TranscriptGeneration {
	readonly kind: "volatile";
	readonly revision: Revision;
}

interface TranscriptRowCacheEntry {
	readonly rows: readonly string[];
	readonly logicalBytes: number;
}

export interface AstraTranscriptCacheInput<DurableRevision, VolatileRevision> {
	readonly snapshotVersion            : number                                                       ;
	readonly expanded                   : boolean                                                      ;
	readonly durableRevision            : DurableRevision                                              ;
	readonly durableRevisionTrusted     : boolean                                                      ;
	readonly sameTrustedDurableRevision : (left: DurableRevision, right: DurableRevision) => boolean   ;
	readonly sameDurableLifetime        : (left: DurableRevision, right: DurableRevision) => boolean   ;
	readonly durableRevisionChanged     : (left: DurableRevision, right: DurableRevision) => boolean   ;
	readonly buildDurableBlocks         : () => readonly TranscriptBlock[]                             ;
	readonly volatileRevision           : (durableEmpty: boolean) => VolatileRevision                  ;
	readonly sameVolatileRevision       : (left: VolatileRevision, right: VolatileRevision) => boolean ;
	readonly buildVolatileBlocks        : (durableEmpty: boolean) => readonly TranscriptBlock[]        ;
	readonly retainMarkdownKeys         : (keys: ReadonlySet<string>) => void                          ;
}

export type AstraTranscriptCacheMetrics = TranscriptCacheMetrics;

const ROW_CACHE_MAX_LOGICAL_BYTES      = 8 * 1024 * 1024 ;
const ROW_CACHE_ENTRY_OVERHEAD         = 64              ;
const WIDTH_STATE_MAX_ENTRIES          = 4               ;
const WIDTH_METADATA_MAX_LOGICAL_BYTES = 2 * 1024 * 1024 ;
const WIDTH_METADATA_ENTRY_OVERHEAD    = 64              ;

function sameReuseInputs(left: readonly unknown[], right: readonly unknown[]): boolean {
	if (left.length !== right.length) return false;
	for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
	return true;
}

function canReuseDurableBlock(left: TranscriptBlock, right: TranscriptBlock): boolean {
	if (left.key !== right.key || left.reuse.kind !== right.reuse.kind) return false;
	if (left.reuse.kind === "never" || right.reuse.kind === "never") return false;
	if (!left.reuse.immutable || !right.reuse.immutable) return false;
	if (left.reuse.kind === "activity" && right.reuse.kind === "activity") {
		return left.reuse.source === right.reuse.source && left.reuse.expanded === right.reuse.expanded;
	}
	if (left.reuse.kind === "message" && right.reuse.kind === "message") return sameReuseInputs(left.reuse.inputs, right.reuse.inputs);
	if (left.reuse.kind === "tnote" && right.reuse.kind === "tnote") return sameReuseInputs(left.reuse.inputs, right.reuse.inputs);
	return false;
}

/** Owns generation reconciliation, exact width indexes, and the shared bounded row LRU. */
export class AstraTranscriptCache<DurableRevision, VolatileRevision> {
	private nextGenerationId                                                           = 1                                          ;
	private durableGeneration  : DurableTranscriptGeneration<DurableRevision> | null   = null                                       ;
	private volatileGeneration : VolatileTranscriptGeneration<VolatileRevision> | null = null                                       ;
	private readonly rowCache                                                          = new Map<string, TranscriptRowCacheEntry>() ;
	private rowCacheLogicalBytes                                                       = 0                                          ;
	private readonly counters = {
		exactCountBuilds: 0, exactCountBuildMs: 0, requestedRows: 0, requestedMaterializationMs: 0, renderedBlocks: 0,
		durableGraphBuilds: 0, durableGraphBuildMs: 0, durableGenerationNoopReuses: 0,
		durableCountReusedBlocks: 0, durableCountRenderedBlocks: 0,
		rowCacheHits: 0, rowCacheMisses: 0, rowCacheEvictions: 0,
		widthCacheHits: 0, widthCacheMisses: 0,
	};

	invalidate(): void {
		this.durableGeneration = null;
		this.volatileGeneration = null;
		this.rowCache.clear();
		this.rowCacheLogicalBytes = 0;
	}

	metrics(): AstraTranscriptCacheMetrics {
		const generations: TranscriptGeneration[] = [];
		if (this.durableGeneration) generations.push(this.durableGeneration);
		if (this.volatileGeneration) generations.push(this.volatileGeneration);
		return {
			durableBlockCount           : this.durableGeneration?.blocks.length ?? 0,
			volatileBlockCount          : this.volatileGeneration?.blocks.length ?? 0,
			markdownEntries             : 0,
			rowEntries                  : this.rowCache.size,
			rowLogicalBytes             : this.rowCacheLogicalBytes,
			widthStates                 : generations.reduce((sum, generation) => sum + generation.widths.size, 0),
			widthMetadataLogicalBytes   : generations.reduce((sum, generation) => sum + [...generation.widths.values()].reduce((subtotal, state) => subtotal + state.logicalBytes, 0), 0),
			exactCountBuilds            : this.counters.exactCountBuilds,
			exactCountBuildMs           : this.counters.exactCountBuildMs,
			requestedRows               : this.counters.requestedRows,
			requestedMaterializationMs  : this.counters.requestedMaterializationMs,
			renderedBlocks              : this.counters.renderedBlocks,
			durableGraphBuilds          : this.counters.durableGraphBuilds,
			durableGraphBuildMs         : this.counters.durableGraphBuildMs,
			durableGenerationNoopReuses : this.counters.durableGenerationNoopReuses,
			durableCountReusedBlocks    : this.counters.durableCountReusedBlocks,
			durableCountRenderedBlocks  : this.counters.durableCountRenderedBlocks,
			rowCacheHits                : this.counters.rowCacheHits,
			rowCacheMisses              : this.counters.rowCacheMisses,
			rowCacheEvictions           : this.counters.rowCacheEvictions,
			widthCacheHits              : this.counters.widthCacheHits,
			widthCacheMisses            : this.counters.widthCacheMisses,
		};
	}

	scrollRows(width: number, input: AstraTranscriptCacheInput<DurableRevision, VolatileRevision>): { readonly rowCount: number; readonly rows: (start: number, count: number) => string[] } {
		const safeWidth = Math.max(1, Math.floor(width));
		const { durable, volatile } = this.prepareGenerations(input);
		const durableIndex  = this.widthIndex(durable, safeWidth)            ;
		const volatileIndex = this.widthIndex(volatile, safeWidth, true)     ;
		const rowCount      = durableIndex.rowCount + volatileIndex.rowCount ;
		return {
			rowCount,
			rows: (start, count) => this.rowsForRange(durable, durableIndex, volatile, volatileIndex, start, count, rowCount),
		};
	}

	private rowsForRange(
		durable: TranscriptGeneration,
		durableIndex: TranscriptWidthIndex,
		volatile: TranscriptGeneration,
		volatileIndex: TranscriptWidthIndex,
		start: number,
		count: number,
		rowCount: number,
	): string[] {
		if (!Number.isSafeInteger(start)
			|| !Number.isSafeInteger(count)
			|| start < 0
			|| count < 0
			|| start + count > rowCount) {
			throw new RangeError(`Invalid Astra transcript row range ${start}:${count}/${rowCount}`);
		}
		this.counters.requestedRows += count;
		if (count === 0) return [];
		const startedAt       = performance.now()                                           ;
		const rows : string[] = []                                                          ;
		const durableCount    = Math.max(0, Math.min(count, durableIndex.rowCount - start)) ;
		if (durableCount > 0) rows.push(...this.rowsFrom(durable, durableIndex, start, durableCount));
		const volatileStart = Math.max(0, start - durableIndex.rowCount);
		const remaining = count - rows.length;
		if (remaining > 0) rows.push(...this.rowsFrom(volatile, volatileIndex, volatileStart, remaining));
		if (rows.length !== count) throw new Error(`Astra transcript row source returned ${rows.length} rows; expected ${count}`);
		this.counters.requestedMaterializationMs += performance.now() - startedAt;
		return rows;
	}

	private prepareGenerations(input: AstraTranscriptCacheInput<DurableRevision, VolatileRevision>): { durable: DurableTranscriptGeneration<DurableRevision>; volatile: VolatileTranscriptGeneration<VolatileRevision> } {
		if (!this.durableGeneration) {
			this.durableGeneration = this.newDurableGeneration(input, input.buildDurableBlocks(), new Map());
		} else if (this.durableGeneration.expanded === input.expanded && (
			this.durableGeneration.snapshotVersion === input.snapshotVersion
			|| this.durableGeneration.trustedImmutableRevision && input.sameTrustedDurableRevision(this.durableGeneration.revision, input.durableRevision)
		)) {
			if (input.durableRevisionChanged(this.durableGeneration.revision, input.durableRevision)) {
				this.counters.durableGenerationNoopReuses += 1;
			}
			this.durableGeneration.snapshotVersion          = input.snapshotVersion        ;
			this.durableGeneration.revision                 = input.durableRevision        ;
			this.durableGeneration.trustedImmutableRevision = input.durableRevisionTrusted ;
		} else {
			const previous     = this.durableGeneration                                                ;
			const startedAt    = performance.now()                                                     ;
			const candidate    = input.buildDurableBlocks()                                            ;
			const sameLifetime = input.sameDurableLifetime(previous.revision, input.durableRevision)   ;
			const blocks       = this.reconcileDurableBlocks(previous.blocks, candidate, sameLifetime) ;
			const sameGraph = sameLifetime && previous.expanded === input.expanded && blocks.length === previous.blocks.length
				&& blocks.every((block, index) => block === previous.blocks[index]);
			this.counters.durableGraphBuildMs += performance.now() - startedAt;
			if (sameGraph) {
				previous.snapshotVersion          = input.snapshotVersion        ;
				previous.revision                 = input.durableRevision        ;
				previous.trustedImmutableRevision = input.durableRevisionTrusted ;
				this.counters.durableGenerationNoopReuses += 1;
			} else {
				const widths = this.repairDurableWidths(previous, blocks);
				this.pruneGenerationRows(previous.id);
				this.durableGeneration = this.newDurableGeneration(input, blocks, widths);
			}
		}
		const durable          = this.durableGeneration               ;
		const durableEmpty     = durable.blocks.length === 0          ;
		const volatileRevision = input.volatileRevision(durableEmpty) ;
		if (!this.volatileGeneration || !input.sameVolatileRevision(this.volatileGeneration.revision, volatileRevision)) {
			if (this.volatileGeneration) this.pruneGenerationRows(this.volatileGeneration.id);
			this.volatileGeneration = {
				id: this.nextGenerationId++, kind: "volatile", revision: volatileRevision,
				blocks: input.buildVolatileBlocks(durableEmpty), widths: new Map(),
			};
		}
		const volatile = this.volatileGeneration;
		input.retainMarkdownKeys(new Set([...durable.blocks, ...volatile.blocks].flatMap(block => block.markdownKeys)));
		return { durable, volatile };
	}

	private newDurableGeneration(input: AstraTranscriptCacheInput<DurableRevision, VolatileRevision>, blocks: readonly TranscriptBlock[], widths: Map<number, TranscriptWidthIndex>): DurableTranscriptGeneration<DurableRevision> {
		const startedAt = performance.now();
		this.counters.durableGraphBuilds += 1;
		const generation: DurableTranscriptGeneration<DurableRevision> = {
			id: this.nextGenerationId++, kind: "durable", expanded: input.expanded,
			snapshotVersion: input.snapshotVersion, revision: input.durableRevision,
			trustedImmutableRevision: input.durableRevisionTrusted, blocks, widths,
		};
		this.counters.durableGraphBuildMs += performance.now() - startedAt;
		return generation;
	}

	private pruneGenerationRows(generationId: number): void {
		const prefix = `${generationId}:`;
		for (const [key, entry] of this.rowCache) if (key.startsWith(prefix)) {
			this.rowCache.delete(key);
			this.rowCacheLogicalBytes -= entry.logicalBytes;
		}
	}

	private retainWidthIndex(widths: Map<number, TranscriptWidthIndex>, state: TranscriptWidthIndex): void {
		let retainedBytes = [...widths.values()].reduce((sum, value) => sum + value.logicalBytes, 0);
		while (widths.size > 0 && (widths.size >= WIDTH_STATE_MAX_ENTRIES || retainedBytes + state.logicalBytes > WIDTH_METADATA_MAX_LOGICAL_BYTES)) {
			const oldestWidth = widths.keys().next().value;
			if (oldestWidth === undefined) break;
			const oldest = widths.get(oldestWidth);
			if (!oldest) break;
			retainedBytes -= oldest.logicalBytes;
			widths.delete(oldestWidth);
		}
		if (state.logicalBytes <= WIDTH_METADATA_MAX_LOGICAL_BYTES) widths.set(state.width, state);
	}

	private durableCount(block: TranscriptBlock, width: number): number {
		this.counters.renderedBlocks += 1;
		this.counters.durableCountRenderedBlocks += 1;
		return block.render(width).length;
	}

	private repairDurableWidths(previous: DurableTranscriptGeneration<DurableRevision>, blocks: readonly TranscriptBlock[]): Map<number, TranscriptWidthIndex> {
		const widths = new Map<number, TranscriptWidthIndex>();
		if (previous.widths.size === 0) return widths;
		const startedAt = performance.now();
		const previousIndex = new Map<TranscriptBlock, number>();
		for (const [index, block] of previous.blocks.entries()) previousIndex.set(block, index);
		for (const [width, prior] of previous.widths) {
			const counts = blocks.map(block => {
				const index = previousIndex.get(block);
				if (index === undefined) return this.durableCount(block, width);
				const count = prior.counts[index];
				if (count === undefined) return this.durableCount(block, width);
				this.counters.durableCountReusedBlocks += 1;
				return count;
			});
			const prefix = [0];
			for (const count of counts) prefix.push((prefix.at(-1) ?? 0) + count);
			this.retainWidthIndex(widths, {
				width, counts, prefix, rowCount: prefix.at(-1) ?? 0,
				logicalBytes: WIDTH_METADATA_ENTRY_OVERHEAD + (counts.length + prefix.length) * 8,
			});
		}
		this.counters.exactCountBuildMs += performance.now() - startedAt;
		return widths;
	}

	private reconcileDurableBlocks(previous: readonly TranscriptBlock[], candidate: readonly TranscriptBlock[], allowReuse: boolean): readonly TranscriptBlock[] {
		if (!allowReuse || previous.length === 0 || candidate.length === 0) return candidate;
		const buckets = new Map<string, { blocks: TranscriptBlock[]; cursor: number }>();
		for (const block of previous) {
			const bucket = buckets.get(block.key) ?? { blocks: [], cursor: 0 };
			bucket.blocks.push(block);
			buckets.set(block.key, bucket);
		}
		return candidate.map(block => {
			const bucket = buckets.get(block.key);
			const prior = bucket ? bucket.blocks[bucket.cursor++] : undefined;
			return prior && canReuseDurableBlock(prior, block) ? prior : block;
		});
	}

	private renderBlock(generation: TranscriptGeneration, blockIndex: number, width: number, retain: boolean, countBuild = false): readonly string[] {
		const key = `${generation.id}:${width}:${blockIndex}`;
		const cached = this.rowCache.get(key);
		if (cached) {
			this.counters.rowCacheHits += 1;
			this.rowCache.delete(key);
			this.rowCache.set(key, cached);
			return cached.rows;
		}
		this.counters.rowCacheMisses += 1;
		this.counters.renderedBlocks += 1;
		if (countBuild && generation.kind === "durable") this.counters.durableCountRenderedBlocks += 1;
		const block = generation.blocks[blockIndex];
		if (!block) throw new RangeError(`Missing Astra transcript block ${blockIndex}`);
		const rows = block.render(width);
		if (!retain) return rows;
		const logicalBytes = rows.reduce((sum, row) => sum + row.length * 2, ROW_CACHE_ENTRY_OVERHEAD);
		while (this.rowCache.size > 0 && this.rowCacheLogicalBytes + logicalBytes > ROW_CACHE_MAX_LOGICAL_BYTES) {
			const oldestKey = this.rowCache.keys().next().value;
			if (oldestKey === undefined) break;
			const oldest = this.rowCache.get(oldestKey);
			if (!oldest) break;
			this.rowCache.delete(oldestKey);
			this.rowCacheLogicalBytes -= oldest.logicalBytes;
			this.counters.rowCacheEvictions += 1;
		}
		if (logicalBytes <= ROW_CACHE_MAX_LOGICAL_BYTES) {
			const entry = { rows: [...rows], logicalBytes };
			this.rowCache.set(key, entry);
			this.rowCacheLogicalBytes += logicalBytes;
			return entry.rows;
		}
		return rows;
	}

	private widthIndex(generation: TranscriptGeneration, width: number, retainRows = false): TranscriptWidthIndex {
		const cached = generation.widths.get(width);
		if (cached) {
			this.counters.widthCacheHits += 1;
			generation.widths.delete(width);
			generation.widths.set(width, cached);
			return cached;
		}
		this.counters.widthCacheMisses += 1;
		this.counters.exactCountBuilds += 1;
		const startedAt = performance.now()                                                                                        ;
		const counts    = generation.blocks.map((_, index) => this.renderBlock(generation, index, width, retainRows, true).length) ;
		const prefix    = [0]                                                                                                      ;
		for (const count of counts) prefix.push((prefix.at(-1) ?? 0) + count);
		const state = {
			width, counts, prefix, rowCount: prefix.at(-1) ?? 0,
			logicalBytes: WIDTH_METADATA_ENTRY_OVERHEAD + (counts.length + prefix.length) * 8,
		};
		this.retainWidthIndex(generation.widths, state);
		this.counters.exactCountBuildMs += performance.now() - startedAt;
		return state;
	}

	private rowsFrom(generation: TranscriptGeneration, index: TranscriptWidthIndex, start: number, count: number): string[] {
		if (count === 0 || start >= index.rowCount) return [];
		const end = Math.min(index.rowCount, start + count);
		let low = 0, high = generation.blocks.length;
		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			if ((index.prefix[middle + 1] ?? index.rowCount) <= start) low = middle + 1;
			else high = middle;
		}
		const rows: string[] = [];
		for (let blockIndex = low; blockIndex < generation.blocks.length && (index.prefix[blockIndex] ?? end) < end; blockIndex += 1) {
			const blockRows     = this.renderBlock(generation, blockIndex, index.width, true) ;
			const block         = generation.blocks[blockIndex]                               ;
			const expectedCount = index.counts[blockIndex]                                    ;
			const blockStart    = index.prefix[blockIndex]                                    ;
			if (!block || expectedCount === undefined || blockStart === undefined) throw new RangeError(`Missing Astra transcript index ${blockIndex}`);
			if (blockRows.length !== expectedCount) throw new Error(`Astra transcript block ${block.key} changed row count at width ${index.width}`);
			rows.push(...blockRows.slice(Math.max(0, start - blockStart), Math.min(blockRows.length, end - blockStart)));
		}
		if (rows.length !== end - start) throw new Error(`Astra transcript row source returned ${rows.length} rows; expected ${end - start}`);
		return rows;
	}
}
