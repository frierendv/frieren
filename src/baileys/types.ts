import { proto } from "@whiskeysockets/baileys";

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
export interface IParsedMessage {
	/**
	 * Representing who sending this message.
	 *
	 * example: `1234567890@s.whatsapp.net`
	 */
	sender: string;
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
	reply: (text: string | "") => Promise<proto.WebMessageInfo | undefined>;
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
	 * If the message is from a group.
	 */
	isGroup: boolean;
	/**
	 * If the message is quoting another message.
	 * If not, it will be `null`.
	 */
	quoted: {
		/**
		 * The quoted message text/caption. If exists.
		 */
		text: string | undefined;
		/**
		 * The quoted message media. If exists.
		 */
		media: IParsedMedia | null;
		/**
		 * The sender of the quoted message.
		 */
		participant: string;
		/**
		 * Ids of users mentioned in the quoted message.
		 * If no one is mentioned, it will be an empty array.
		 */
		mentionedJid: string[] | never[];
	} | null;
}
