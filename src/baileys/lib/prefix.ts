export const extractPrefix = (
	_prefix: string[],
	text: string
): { prefix: string; command: string } => {
	let command = "";
	const prefix = _prefix.find((prefix) => text.startsWith(prefix));
	if (!prefix) {
		return { prefix: "", command };
	}
	text = text.slice(prefix.length).trim();
	const args = text.split(" ");

	command = args.shift() ?? "";

	return {
		prefix,
		command,
	};
};

export const normalizePrefix = (
	prefix?: string | string[] | null
): string[] => {
	if (!prefix) {
		return [];
	}
	if (Array.isArray(prefix)) {
		return prefix;
	}
	return [prefix];
};
