import { downloadMediaMessage, proto } from "@whiskeysockets/baileys";
import { IParsedMessage } from "../types";

export const downloadMedia = async (
	message: proto.IWebMessageInfo
): Promise<Buffer> => downloadMediaMessage(message, "buffer", {});

const getText = (quoted: proto.IContextInfo): string => {
	const textSources = [
		quoted.quotedMessage?.imageMessage?.caption,
		quoted.quotedMessage?.videoMessage?.caption,
		quoted.quotedMessage?.viewOnceMessage?.message?.conversation,
		quoted.quotedMessage?.viewOnceMessage?.message?.imageMessage?.caption,
		quoted.quotedMessage?.viewOnceMessage?.message?.videoMessage?.caption,
		quoted.quotedMessage?.viewOnceMessageV2?.message?.conversation,
		quoted.quotedMessage?.viewOnceMessageV2?.message?.imageMessage?.caption,
		quoted.quotedMessage?.viewOnceMessageV2?.message?.videoMessage?.caption,
		quoted.quotedMessage?.conversation,
	];
	return textSources.find((text) => text) ?? "";
};

const getMedia = (quoted: proto.IContextInfo) => {
	const mediaSources = [
		quoted.quotedMessage?.imageMessage,
		quoted.quotedMessage?.stickerMessage,
		quoted.quotedMessage?.videoMessage,
		quoted.quotedMessage?.viewOnceMessage?.message?.imageMessage,
		quoted.quotedMessage?.viewOnceMessage?.message?.videoMessage,
		quoted.quotedMessage?.viewOnceMessageV2?.message?.imageMessage,
		quoted.quotedMessage?.viewOnceMessageV2?.message?.videoMessage,
	];
	return mediaSources.find((media) => media) ?? null;
};

export const assignQuotedIfExist = <T extends IParsedMessage["quoted"]>(
	quoted: proto.IContextInfo | null | undefined
): T | null => {
	if (!quoted?.participant) {
		return null;
	}

	const text = getText(quoted);
	const media = getMedia(quoted);

	const quotedMessage: Partial<IParsedMessage["quoted"]> = {
		text,
		mentionedJid: quoted.mentionedJid ?? [],
		participant: quoted.participant,
		media: null,
	};

	if (media) {
		quotedMessage.media = {
			mimetype: media.mimetype as string,
			download: async () =>
				downloadMedia({
					message: quoted.quotedMessage,
				} as proto.IWebMessageInfo),
		};
	}

	return quotedMessage as T;
};
