export interface Row {
	id   : string;
	name : string;
	tag  : string;
}

declare const flag: boolean;
declare const left: string;
declare const right: string;
export const picked = flag ? left : right;

declare const value: string;
export const first = {
	id   : "a",
	name : value,
	tag  : "x",
};

declare const a: string;
declare const b: string;
declare const c: string;
export const arr = [a, b, c];

declare function call(...args: string[]): void;
call(a, b, c);

declare function pick(...args: string[]): void;
pick(flag ? a : b, flag ? b : c, flag ? c : a);
