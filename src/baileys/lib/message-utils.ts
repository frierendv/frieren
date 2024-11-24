import { downloadMediaMessage, proto } from "baileys";
import type {
	AnyRegularMessageContent,
	MessageUpsertType,
	WAMessage,
	WASocket as WASocketType,
} from "baileys";
import { MESSAGES_TYPES } from "../resource/message";
import {
	DeleteMsgFunction,
	EditMsgFunction,
	IContextMedia,
	IContextMessage,
} from "../types";
import * as Parse from "./parse";
import * as Wrapper from "./wrapper";

export const findMessage = (
	message: proto.IMessage,
	parentKey?: keyof proto.IMessage
): IFindMessage => {
	const msg = parentKey ? message[parentKey] : message;
	if (!msg) {
		return message as IFindMessage;
	}

	for (const mtype of MESSAGES_TYPES) {
		const content = (msg as proto.IMessage)[mtype] as IFindMessage;
		if (content) {
			return content?.message ? findMessage(content.message) : content;
		}
	}
	return message as IFindMessage;
};

/**
 * Becareful when downloading media, it can be a large file.
 * Always check the file size before downloading.
 */
export const downloadMedia = async (
	message: proto.IWebMessageInfo
): Promise<Buffer> => downloadMediaMessage(message, "buffer", {});

/**
 * Get the quoted message type.
 */
export const getQuotedMessageType = (
	quotedMessage: proto.IMessage
): keyof proto.IMessage => {
	return Object.keys(quotedMessage)[0] as keyof proto.IMessage;
};

/**
 * Extract the message text.
 */
export const extractMessageText = (msg: IFindMessage): string => {
	return msg.conversation ?? msg.caption ?? msg.text ?? "";
};

/**
 * Create a media object.
 */
export const createMediaObject = (
	msg: IFindMessage,
	message: proto.IMessage
): IContextMedia | null => {
	if (!msg.mimetype) {
		return null;
	}
	return {
		mimetype: msg.mimetype,
		size: Parse.calculateSize(msg.fileLength),
		download: async () =>
			downloadMedia({
				message,
			} as proto.IWebMessageInfo),
	};
};

/**
 * Delete the quoted message.
 */
export const deleteQuotedMessage = async (
	parsedMessage:
		| Partial<IContextMessage>
		| Partial<NonNullable<IContextMessage["quoted"]>>,
	messageInfo: proto.IWebMessageInfo,
	sock: WASocketType,
	contextInfo?: proto.IContextInfo
): Promise<void> =>
	await Wrapper.wrap(
		() =>
			sock
				.sendMessage(parsedMessage.from!, {
					delete: {
						...messageInfo.key,
						remoteJid: parsedMessage.from!,
						fromMe: parsedMessage.sender! === sock.user!.id,
						...(contextInfo && {
							id: contextInfo.stanzaId,
							...(parsedMessage.from?.endsWith("@g.us") && {
								participant: contextInfo.participant,
							}),
						}),
					},
				})
				.then(() => {}),
		(error) => sock.logger.error("Delete failed:", error)
	);

const editMessage = async (
	sock: WASocketType,
	jid: string,
	text = "",
	edit: proto.IMessageKey
): Promise<void> =>
	Wrapper.wrap(
		() => sock.sendMessage(jid, { text, edit }).then(() => {}),
		(error) => sock.logger.error("Update failed:", error)
	);

/**
 * Reply to the quoted message.
 */
export const replyToQuotedMessage = async (
	jid: string,
	text = "",
	sock: WASocketType,
	message: proto.IWebMessageInfo,
	opts?: AnyRegularMessageContent
): Promise<[EditMsgFunction, DeleteMsgFunction]> =>
	await Wrapper.wrap(
		async () => {
			const msgOptions = {
				text,
			};
			const replyMsg = await sock.sendMessage(
				jid,
				{
					...msgOptions,
					...opts,
				},
				{
					quoted: message,
				}
			);
			if (!replyMsg) {
				throw new Error("Failed to reply to the message.");
			}
			return [
				(text: string) => editMessage(sock, jid, text, replyMsg.key),
				() =>
					deleteQuotedMessage(
						{
							from: replyMsg.key.remoteJid!,
							sender: sock.user!.id,
						},
						replyMsg,
						sock
					),
			];
		},
		(error) => sock.logger.error("Reply failed:", error)
	);

/**
 * Prepare the message.
 */
export const prepareMessage = (update: {
	messages: WAMessage[];
	type: MessageUpsertType;
	requestId?: string;
}): {
	mtype: keyof proto.IMessage;
	message: proto.IMessage;
	messageInfo: proto.IWebMessageInfo;
} | null => {
	const { messages, type } = update;
	if (type !== "notify" || !messages[0]?.message) {
		return null;
	}

	const { message } = messages[0];
	for (const mtype of ["conversation", ...MESSAGES_TYPES]) {
		if (message[mtype as keyof proto.IMessage]) {
			return {
				mtype: mtype as keyof proto.IMessage,
				message,
				messageInfo: messages[0],
			};
		}
	}
	return null;
};

export type IFindMessage = proto.Message.ExtendedTextMessage &
	proto.Message.FutureProofMessage &
	proto.Message.AudioMessage &
	proto.Message.ImageMessage &
	proto.Message.VideoMessage &
	proto.Message.StickerMessage &
	proto.Message.DocumentMessage &
	proto.IMessage;
