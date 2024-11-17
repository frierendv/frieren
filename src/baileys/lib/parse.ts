import { AsYouType } from "libphonenumber-js";

const asYouType = new AsYouType();

export const parsePhoneNumber = (phone: string) => {
	asYouType.reset();
	const phoneNumber = asYouType.input(
		phone.startsWith("+") ? phone : `+${phone}`
	);
	return phoneNumber;
};

// safe format the string, remove all unnecessary characters
// like: `\n`, `\t`, `\r`, etc.
export const safeFormat = (text: string | null | undefined) => {
	if (!text) {
		return undefined;
	}
	return text.replace(/[\n\t\r]/g, "");
};
