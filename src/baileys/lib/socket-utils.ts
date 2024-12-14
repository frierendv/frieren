import { AnyMediaMessageContent } from "baileys";
import { fromBuffer } from "file-type";
import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { fetch } from "undici";
import { SUPPORTED_MEDIA_TYPES } from "../resource/message";

export const downloadFile = async (content: AnyContent): Promise<Buffer> => {
	if (isBuffer(content)) {
		return content as Buffer;
	}
	if (isDataURL(content as string)) {
		return Buffer.from(
			(content as string).split("base64,").pop() ?? "",
			"base64"
		);
	}
	if (isLocalFile(content)) {
		return await readFile(content as string);
	}
	const response = await fetch(content as string);

	if (!response?.body) {
		throw new Error("No body in response");
	}

	const chunks: Uint8Array[] = [];
	for await (const chunk of response.body) {
		chunks.push(chunk);
	}

	return Buffer.concat(chunks);
};

export const getSendFileOptions = async (
	content: AnyContent,
	filename?: string,
	caption?: string
) => {
	const buffer = await downloadFile(content);
	const fileType = await fromBuffer(buffer);

	const type = getFileType(fileType);
	const finalType = getFinalType(buffer.length, type);
	const sendOptions = getSendOptions(fileType, filename, caption);

	return {
		sendOptions: sendOptions as unknown as AnyMediaMessageContent,
		type: finalType,
		buffer,
	};
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getFileType = (fileType: any) => {
	type SupportedMediaTypes = (typeof SUPPORTED_MEDIA_TYPES)[number];
	return SUPPORTED_MEDIA_TYPES.includes(
		fileType?.mime.split("/")[0] as SupportedMediaTypes
	)
		? fileType?.mime.split("/")[0]
		: "document";
};

const getFinalType = (size: number, type: string) => {
	return size > 64 * 1024 * 1024 ? "document" : type || "document";
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSendOptions = (fileType: any, filename?: string, caption?: string) => {
	const sendOptions = {
		filename: filename ?? `file.${fileType?.ext ?? "bin"}`,
		mimetype: fileType?.mime ?? "application/octet-stream",
		caption: /image|video/i.test(fileType?.mime ?? "")
			? caption
			: undefined,
	};

	if (/audio/i.test(fileType?.mime ?? "")) {
		sendOptions.mimetype = "audio/ogg; codecs=opus";
	}

	return sendOptions;
};

export type AnyContent = string | Buffer | ArrayBuffer;

export const isBuffer = (
	content: AnyContent
): content is Buffer | ArrayBuffer =>
	content instanceof Buffer || content instanceof ArrayBuffer;

export const isDataURL = (str: string): boolean => /^data:/.test(str);

export const isLocalFile = (str: string): boolean =>
	typeof str === "string" && existsSync(str);
