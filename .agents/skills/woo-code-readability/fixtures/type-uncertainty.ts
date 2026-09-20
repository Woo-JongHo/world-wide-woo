interface SampleContract {
	optionalProperty ?: string;
	optionalMethod   ?(): void;
}

class SampleState {
	declared!: string;
}

type OptionalTuple = [string?];
type NamedOptionalTuple = [item?: string];

export function sample(parameter?: string): SampleContract {
	const missing: undefined = undefined;
	const empty: null = null;
	const asserted = parameter!;
	const cast = parameter as string;
	const angled = <string>parameter;
	const state = new SampleState();

	return !parameter
		? { optionalProperty: missing, optionalMethod: () => undefined }
		: { optionalProperty: empty ?? asserted ?? cast ?? angled ?? state.declared };
}
