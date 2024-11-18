export const wrap = (fn: () => void, cb: (_error: unknown) => void): void => {
	try {
		return fn();
	} catch (error) {
		cb(error);
	}
};
