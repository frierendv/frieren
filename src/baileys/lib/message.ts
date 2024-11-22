import { proto } from "baileys";
import type {
	AnyRegularMessageContent,
	WASocket as WASocketType,
} from "baileys";
import { createReadStream } from "node:fs";
import { IContextMessage } from "../types";
import {
	createMediaObject,
	deleteQuotedMessage,
	extractMessageText,
	findMessage,
	getQuotedMessageType,
	replyToQuotedMessage,
} from "./message-utils";
import * as Parse from "./parse";
import { getSendFileOptions } from "./socket-utils";
import { makeInMemoryStore } from "./store";
import { wrap } from "./wrapper";

export const assignQuotedIfExist = <T extends IContextMessage["quoted"]>(
	{
		contextInfo,
		messageInfo,
	}: {
		contextInfo: proto.IContextInfo | null | undefined;
		messageInfo: proto.IWebMessageInfo;
	},
	sock: WASocketType,
	store: ReturnType<typeof makeInMemoryStore>
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

	const quotedMessage: Partial<IContextMessage["quoted"]> = {
		type,
		text,
		name: store.contacts[contextInfo.participant]?.name ?? "",
		mentionedJid: msg?.contextInfo?.mentionedJid ?? [],
		sender: contextInfo.participant,
		...Parse.phoneNumber(contextInfo.participant),
		from: messageInfo.key.remoteJid!,
		media,
	};

	quotedMessage.delete = async () =>
		deleteQuotedMessage(quotedMessage, messageInfo, sock, contextInfo);
	quotedMessage.reply = async (
		text: string,
		opts?: AnyRegularMessageContent
	) =>
		replyToQuotedMessage(
			messageInfo.key.remoteJid!,
			text,
			sock,
			quotedMessage.message!,
			opts
		);

	return { ...quotedMessage, message: messageInfo } as T;
};

export const sendFile = async (
	sock: WASocketType,
	jid: string,
	anyContent: string | Buffer | ArrayBuffer,
	fileName?: string,
	caption?: string,
	quoted?: IContextMessage
) => {
	const { path, type, unlink, ...rest } = await getSendFileOptions(
		anyContent,
		fileName,
		caption
	);
	const message = await wrap(() =>
		sock.sendMessage(
			jid,
			// eslint-disable-next-line @typescript-eslint/ban-ts-comment
			// @ts-expect-error
			{
				[type]: {
					stream: createReadStream(path),
				},
				...rest,
			},
			{
				quoted: quoted?.message,
			}
		)
	);

	unlink();
	return message;
};
