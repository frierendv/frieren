type Callback<T = unknown> = (_error: T) => void;

export const wrap = <T>(fn: () => T, cb?: Callback): T => {
	try {
		return fn();
	} catch (error) {
		if (cb && typeof cb === "function") {
			cb(error);
		}
		return error as T;
	}
};
