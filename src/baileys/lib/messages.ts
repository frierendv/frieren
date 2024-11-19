import { proto } from "baileys/WAProto";
import makeWASocket from "baileys/lib/Socket";
import { MessageUpsertType, WAMessage } from "baileys/lib/Types";
import { downloadMediaMessage } from "baileys/lib/Utils";
import { MESSAGES_TYPES } from "../resource/message";
import { IParsedMessage } from "../types";
import * as Parse from "./parse";
import * as Wrapper from "./wrapper";

/**
 * Becareful when downloading media, it can be a large file.
 * Always check the file size before downloading.
 */
export const downloadMedia = async (
	message: proto.IWebMessageInfo
): Promise<Buffer> => downloadMediaMessage(message, "buffer", {});

export const findMessage = (
	message: proto.IMessage,
	parentKey?: keyof proto.IMessage
): IFindMessage => {
	for (const mtype of MESSAGES_TYPES) {
		const msg = parentKey ? message[parentKey] : message;
		if (msg && (msg as proto.IMessage)[mtype]) {
			const final = msg as proto.IWebMessageInfo;
			if ((final as proto.IWebMessageInfo)?.message?.[mtype]) {
				return (((final as proto.IWebMessageInfo)?.message?.[
					mtype
				] as proto.IMessage) ||
					(final as proto.IMessage)) as IFindMessage;
			}
			return (((final as proto.IMessage)[mtype] as proto.IMessage) ||
				(final as proto.IMessage)) as IFindMessage;
		}
	}
	return message as IFindMessage;
};

export const assignQuotedIfExist = <T extends IParsedMessage["quoted"]>(
	{
		contextInfo,
		messageInfo,
	}: {
		contextInfo: proto.IContextInfo | null | undefined;
		messageInfo: proto.IWebMessageInfo;
	},
	sock: ReturnType<typeof makeWASocket>
): T | null => {
	if (!contextInfo?.participant || !contextInfo.quotedMessage) {
		return null;
	}

	const type = Object.keys(
		contextInfo.quotedMessage
	)[0] as keyof proto.IMessage;
	const msg = findMessage(contextInfo.quotedMessage);
	if (!msg) {
		return null;
	}

	const quotedMessage: Partial<IParsedMessage["quoted"]> = {
		type,
		text: msg?.conversation ?? msg?.caption ?? msg?.text ?? "",
		mentionedJid: contextInfo.mentionedJid ?? [],
		sender: contextInfo.participant,
		phone: Parse.phoneNumber(contextInfo.participant),
		from: messageInfo.key.remoteJid!,
		media: null,
	};

	if (msg?.mimetype) {
		quotedMessage.media = {
			mimetype: msg.mimetype,
			size: Parse.calculateSize(msg.fileLength),
			download: async () =>
				downloadMedia({
					message: contextInfo.quotedMessage,
				} as proto.IWebMessageInfo),
		};
	}

	quotedMessage.delete = async () =>
		Wrapper.wrap(
			() =>
				sock.sendMessage(quotedMessage.from!, {
					delete: {
						...messageInfo.key,
						id: contextInfo.stanzaId,
					},
				}),
			(error) => sock.logger.error("Delete failed:", error)
		);

	quotedMessage.reply = async (text: string) =>
		Wrapper.wrap(
			() =>
				sock.sendMessage(
					quotedMessage.from!,
					{ text: text || "" },
					{
						quoted: quotedMessage.message,
					}
				),
			(error) => sock.logger.error("Delete failed:", error)
		);

	return { ...quotedMessage, message: messageInfo } as T;
};

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
	if (type === "notify") {
		if (!messages[0]?.message) {
			return null;
		}
		const { message } = messages[0];

		if (message?.conversation) {
			return {
				mtype: "conversation",
				message: message,
				messageInfo: messages[0],
			};
		}
		for (const mtype of MESSAGES_TYPES) {
			if (message[mtype]) {
				return { mtype, message, messageInfo: messages[0] };
			}
		}
	}
	return null;
};

type IFindMessage = proto.Message.ExtendedTextMessage &
	proto.Message.FutureProofMessage &
	proto.Message.AudioMessage &
	proto.Message.ImageMessage &
	proto.Message.VideoMessage &
	proto.Message.StickerMessage &
	proto.Message.DocumentMessage &
	proto.IMessage;
