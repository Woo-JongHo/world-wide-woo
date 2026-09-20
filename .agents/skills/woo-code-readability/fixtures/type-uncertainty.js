/** @type {string=} */
let optionalText;

export function choose(value) {
	return !value ? optionalText : value;
}
