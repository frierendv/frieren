type Callback<T = unknown> = (_error: T) => void;

export const wrap = async <T>(fn: () => T, cb?: Callback): Promise<T> => {
	try {
		return await fn();
	} catch (error) {
		if (cb && typeof cb === "function") {
			cb(error);
		}
		return error as T;
	}
};
