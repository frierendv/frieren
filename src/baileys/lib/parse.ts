import { AsYouType } from "libphonenumber-js";
import Long from "long";

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

export const calculateSize = (size: number | Long | Long.Long) => {
	if (Long.isLong(size)) {
		return size.toNumber();
	}
	return size;
};
