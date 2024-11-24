import { ICommand, IContextMessage } from "../types";

export const extractPrefix = (
	_prefix: string | string[] | null,
	text: string
): ICommand & Pick<IContextMessage, "text" | "args"> => {
	let command = "";
	const prefix =
		(Array.isArray(_prefix)
			? _prefix.find((prefix) => text.startsWith(prefix))
			: _prefix) ?? "";

	text = text.slice(prefix.length).trim();
	const args = text.split(" ");

	command = args.shift()?.toLowerCase() ?? "";
	// remove prefix and command from text
	text = text.replace(command, "").trim();

	return {
		prefix,
		command,
		text,
		args,
	};
};
