import { AsYouType } from "libphonenumber-js";

const asYouType = new AsYouType();

export const phoneNumber = (phone: string) => {
	asYouType.reset();
	const phoneNumber = asYouType.input(
		phone.startsWith("+") ? phone : `+${phone}`
	);
	return phoneNumber;
};

// safe format the string, remove all unnecessary characters
// like: `\n`, `\t`, `\r`, etc.
export const safeString = (text: string | null | undefined) => {
	if (!text) {
		return undefined;
	}
	return text.replace(/[\n\t\r]/g, "");
};
