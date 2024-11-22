export const extractPrefix = (
	prefixs: string | string[] | null,
	text: string
) => {
	let command = "";
	if (!prefixs) {
		return {
			command,
			text,
		};
	}
	const prefix =
		(Array.isArray(prefixs)
			? prefixs.find((prefix) => text.startsWith(prefix))
			: prefixs) ?? "";

	let _text = text.slice(prefix.length).trim();
	const args = text.split(" ");

	command = args.shift()?.toLowerCase() ?? "";
	_text = text.replace(command, "").trim();
	return {
		command,
		text: _text,
	};
};
