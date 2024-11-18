export const wrap = (fn: () => void, cb: (error: any) => void): any => {
	try {
		return fn();
	} catch (error) {
		cb(error);
	}
};
