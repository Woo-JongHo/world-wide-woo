import type { TodoDocument } from "@/core/domain/work/todos";

export interface TodoController {
	readonly snapshot: TodoDocument | null;
	initialize    ()                                                         : Promise<void>;
	create        (title: string, items: readonly string[], storyId?: string): Promise<TodoDocument>;
	add           (content: string, placement: "now" | "after"              ): Promise<TodoDocument>;
	addDetails    (itemId: string, details: readonly string[]               ): Promise<TodoDocument>;
	start         (itemId: string                                           ): Promise<TodoDocument>;
	complete      (itemId: string                                           ): Promise<TodoDocument>;
	block         (itemId: string                                           ): Promise<TodoDocument>;
	reopen        (itemId: string                                           ): Promise<TodoDocument>;
	recordEvidence(evidenceId: string                                       ): Promise<TodoDocument | null>;
	subscribe     (listener: (snapshot: TodoDocument | null) => void        ): () => void;
}
