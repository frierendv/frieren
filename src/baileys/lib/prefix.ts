export const extractPrefix = (
	prefixes: string | string[] | null,
	text: string
) => {
	let command = "";
	// should be safe
	const DEFAULT_RETURN = {
		command,
		text,
		args: text.split(" "),
	};
	if (!prefixes) {
		return DEFAULT_RETURN;
	}
	const prefix =
		(Array.isArray(prefixes)
			? prefixes.find((prefix) => text.startsWith(prefix))
			: prefixes) ?? "";

	if (!prefix) {
		return DEFAULT_RETURN;
	}

	text = text.slice(prefix.length).trim();
	const args = text.split(" ");

	command = args.shift()?.toLowerCase() ?? "";
	// remove prefix and command from text
	text = text.replace(command, "").trim();

	return {
		command,
		text,
		args,
	};
};
