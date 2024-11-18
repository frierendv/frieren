import { proto } from "baileys";

export interface IParsedMedia {
	/**
	 * The media type.
	 */
	mimetype: string;
	/**
	 * Download the media.
	 * @returns {Promise<Buffer>} the media buffer.
	 */
	download: () => Promise<Buffer>;
}

export interface IParsedMessageBase {
	/**
	 * Representing who sending this message.
	 *
	 * example: `1234567890@s.whatsapp.net`
	 */
	sender: string;
	/**
	 * Representing where the message is from.
	 * If the message is from a group, it will be the group id. Else, it will be the sender id.
	 */
	from: string;
	/**
	 * Representing the sender phone number.
	 *
	 * In format: `+1234567890`
	 */
	phone: string;
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
	text: string | undefined;
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
	media: IParsedMedia | null;
	/**
	 * Reply to the message.
	 *
	 * @param {String} text the message to reply to.
	 */
	reply: (
		_text: string | ""
	) => Promise<proto.WebMessageInfo | undefined | void>;
	/**
	 * Force delete the message.
	 *
	 * If is a group, it will delete the message for everyone.
	 * If is a private chat, it will delete the message only for the sender.
	 *
	 * **Note:** Some permissions are required to delete the message.
	 */
	delete: () => Promise<void>;
	/**
	 * Represents the original message.
	 */
	message: proto.IWebMessageInfo;
}

export interface IParsedMessage extends IParsedMessageBase {
	/**
	 * If the message is from a group.
	 */
	isGroup: boolean;
	/**
	 * Exists if the message is quoting another message.
	 * If not, it will be `null`.
	 */
	quoted:
		| (Omit<IParsedMessageBase, "name"> & {
				/**
				 * Ids of users mentioned in the quoted message.
				 * If no one is mentioned, it will be an empty array.
				 */
				mentionedJid: string[] | never[];
		  })
		| null;
}
