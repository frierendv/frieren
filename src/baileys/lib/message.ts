import { proto } from "baileys";
import type { MiscMessageGenerationOptions } from "baileys";
import type { WASocket as WASocketType } from "baileys";
import { IParsedMessage } from "../types";
import {
	createMediaObject,
	deleteQuotedMessage,
	extractMessageText,
	findMessage,
	getQuotedMessageType,
	replyToQuotedMessage,
} from "./message-utils";
import * as Parse from "./parse";

export const assignQuotedIfExist = <T extends IParsedMessage["quoted"]>(
	{
		contextInfo,
		messageInfo,
	}: {
		contextInfo: proto.IContextInfo | null | undefined;
		messageInfo: proto.IWebMessageInfo;
	},
	sock: WASocketType
): T | null => {
	if (!contextInfo?.participant || !contextInfo.quotedMessage) {
		return null;
	}

	const type = getQuotedMessageType(contextInfo.quotedMessage);
	const msg = findMessage(contextInfo.quotedMessage);
	if (!msg) {
		return null;
	}

	const text = extractMessageText(msg);
	const media = createMediaObject(msg, contextInfo.quotedMessage);

	const quotedMessage: Partial<IParsedMessage["quoted"]> = {
		type,
		text,
		mentionedJid: contextInfo.mentionedJid ?? [],
		sender: contextInfo.participant,
		phone: Parse.phoneNumber(contextInfo.participant),
		from: messageInfo.key.remoteJid!,
		media,
	};

	quotedMessage.delete = async () =>
		deleteQuotedMessage(quotedMessage, messageInfo, sock, contextInfo);
	quotedMessage.reply = async (
		text: string,
		opts?: MiscMessageGenerationOptions
	) =>
		replyToQuotedMessage(
			messageInfo.key.remoteJid!,
			text,
			opts,
			sock,
			quotedMessage.message!
		);

	return { ...quotedMessage, message: messageInfo } as T;
};
