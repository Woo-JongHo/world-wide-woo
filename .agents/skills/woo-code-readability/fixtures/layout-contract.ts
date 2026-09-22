export const centered = {
	long  : (threads) => threads,
	short : ( args  ) => args,
};

export const overPadded = {
	long  : (threads)  => threads,
	short : (  args   ) => args,
};

export const compact = {
	short : () => { return run(); },
	long  : () => { return run("extra"); },
};

export const paddedBeforeClose = {
	bad : () => { return run();    },
};

declare function run(value?: string): string;
