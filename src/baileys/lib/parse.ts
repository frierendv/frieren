import { AsYouType } from "libphonenumber-js";

const asYouType = new AsYouType();

export const phoneNumber = (phone: string) => {
	asYouType.reset();
	const phoneNumber = asYouType.input(
		phone.startsWith("+") ? phone : `+${phone}`
	);
	return phoneNumber;
};

export const safeString = (text: string | null | undefined) => {
	if (!text) {
		return "";
	}
	return text.replace(/[\n\t\r]/g, "");
};
