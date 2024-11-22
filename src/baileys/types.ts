/* eslint-disable no-unused-vars */
import {
	AnyMediaMessageContent,
	AnyRegularMessageContent,
	proto,
} from "baileys";
import type { WASocket } from "baileys";
import {
	CountryCallingCode,
	CountryCode,
	E164Number,
	NationalNumber,
} from "libphonenumber-js";

export type WASocketType = WASocket & {
	sendFile: (
		/**
		 * The JID of the person/group to send the file to.
		 */
		jid: string,
		/**
		 * The file to send.
		 */
		anyContent: string | Buffer | ArrayBuffer,
		/**
		 * The file name.
		 */
		fileName?: string,
		/**
		 * The file caption.
		 */
		caption?: string,
		/**
		 * The message to quote.
		 */
		quoted?: IContextMessage
	) => Promise<proto.WebMessageInfo | undefined>;
};

/**
 * Represents media associated with a message.
 */
export interface IContextMedia {
	/**
	 * The media type.
	 */
	mimetype: string;
	/**
	 * Size of the media.
	 */
	size: number | Long;
	/**
	 * Download the media.
	 * @returns {Promise<Buffer>} the media buffer.
	 */
	download(): Promise<Buffer>;
}

/**
 * Function types for message operations.
 */

export type EditMsgFunction = (text: string) => Promise<void>;
export type DeleteMsgFunction = () => Promise<void>;
export type ReplyFunction = (
	text: string | "",

	opts?: AnyRegularMessageContent & AnyMediaMessageContent
) => Promise<[EditMsgFunction, DeleteMsgFunction]>;

/**
 * Base interface for parsed messages.
 */
export interface IContextMessageBase {
	/**
	 * Representing who sending this message.
	 * In format JID.
	 *
	 * example: `1234567890@s.whatsapp.net`
	 */
	sender: string;
	/**
	 * Representing where the message is from.
	 * In format JID.
	 *
	 * If the message is from a group, it will be the group id. Else, it will be the sender id.
	 */
	from: string;
	/**
	 * Representing the sender phone number.
	 *
	 * In format INTERNATIONAL.
	 */
	phone: string;
	/**
	 * Representing the sender country code.
	 */
	country: CountryCode;
	/**
	 * Representing the sender country calling code.
	 */
	countryCallingCode: CountryCallingCode;
	/**
	 * Representing the sender national number.
	 */
	nationalNumber: NationalNumber;
	/**
	 * Representing the sender number.
	 */
	number: E164Number;
	/**
	 * Representing the sender name.
	 */
	name: string;
	/**
	 * The message type.
	 */
	type: keyof proto.IMessage;
	/**
	 * The message text/caption.
	 */
	text: string;
	/**
	 * By default it will be split by space.
	 *
	 * example: `"love you" -> ["love", "you"]`
	 */
	args: string[];
	/**
	 * The message media.
	 * If the message is not a media, it will be `null`.
	 */
	media: IContextMedia | null;
	/**
	 * Reply to the message
	 * then return the function to edit the sent message.
	 */
	reply: ReplyFunction;
	/**
	 * Force delete the message.
	 *
	 * If is a group, it will delete the message for everyone.
	 * If is a private chat, it will delete the message only for the sender.
	 *
	 * **Note:** Some permissions are required to delete the message.
	 */
	delete: DeleteMsgFunction;
	/**
	 * If the message contains a mention.
	 */
	mentionedJid: string[] | never[];
	/**
	 * Represents the original message.
	 */
	message: proto.IWebMessageInfo;
}

/**
 * Extended interface for parsed messages with additional properties.
 */
export interface IContextMessage extends IContextMessageBase {
	/**
	 * The socket instance.
	 */
	sock: WASocketType;
	/**
	 * The store instance.
	 */
	store: ReturnType<typeof import("./lib/store").makeInMemoryStore>;
	/**
	 * If the message is from a group.
	 */
	isGroup: boolean;
	/**
	 * Exists if the message is quoting another message.
	 * If not, it will be `null`.
	 */
	quoted: IContextMessageBase | null;
}

/**
 * Supported event types.
 */
export type FDEvent =
	| "message"
	| "text"
	| "media"
	| "image"
	| "video"
	| "audio"
	| "document"
	| "sticker"
	| "contact"
	| "poll.update";

/**
 * Listener type for specific events.
 */
export type FDEventListener<T extends FDEvent> = T extends "message"
	? IContextMessage
	: T extends "text"
		? string
		: T extends
					| "media"
					| "image"
					| "video"
					| "audio"
					| "document"
					| "sticker"
			? IContextMedia
			: T extends "contact"
				? string
				: T extends "poll.update"
					? ReturnType<
							typeof import("baileys").getAggregateVotesInPollMessage
						>
					: never;

/**
 * Mapping of events to their corresponding data types.
 */
export type FDEventMap = {
	[T in FDEvent]: FDEventListener<T>;
};
