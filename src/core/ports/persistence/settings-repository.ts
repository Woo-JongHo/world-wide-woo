import type { WwwSettings } from "@/core/domain/execution/model-settings";

export interface SettingsRepository {
	load(): Promise<WwwSettings>;
	save(settings: WwwSettings): Promise<void>;
}

export interface AtomicSettingsRepository extends SettingsRepository {
	/** Replaces expected with next under an interprocess lock; false means another writer won. */
	compareAndSwap(expected: WwwSettings, next: WwwSettings): Promise<boolean>;
}

export interface RouterSettingsController {
	update(settings: WwwSettings): Promise<void>;
	flush(): Promise<void>;
}
