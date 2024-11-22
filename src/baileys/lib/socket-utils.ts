import { AnyMediaMessageContent } from "baileys";
import { fromBuffer } from "file-type";
import {
	existsSync,
	readFileSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from "fs";
import os from "os";
import { fetch } from "undici";
import { MIMEType } from "util";
import { SUPPORTED_MEDIA_TYPES } from "../resource/message";
import { wrap } from "./wrapper";

const getDefaultBuffer = () => Buffer.alloc(0);

type AnyContent = string | Buffer | ArrayBuffer;

const getTemporaryPath = (extension: string) =>
	`${os.tmpdir()}/${Math.random().toString(36).substring(7)}.${extension}`;

const createFile = async (path: string, buffer: Buffer) => {
	writeFileSync(path, buffer);
	return {
		path,
		unlink: () =>
			wrap(
				() => unlinkSync(path),
				() => {}
			),
	};
};

// Type Guards
const isBuffer = (content: AnyContent): content is Buffer | ArrayBuffer =>
	content instanceof Buffer || content instanceof ArrayBuffer;

const isDataURL = (str: string): boolean => /^data:/.test(str);

const isLocalFile = (str: string): boolean =>
	typeof str === "string" && existsSync(str);

const isURL = (str: string): boolean =>
	typeof str === "string" && /^https?:\/\//.test(str);

export const downloadFile = async (content: AnyContent): Promise<Buffer> => {
	if (isBuffer(content)) {
		return Buffer.from(content);
	}
	if (isDataURL(content as string)) {
		const res = await fetch(content as string);
		return Buffer.from(await res.arrayBuffer());
	}
	if (isLocalFile(content)) {
		return readFileSync(content);
	}
	if (isURL(content)) {
		try {
			const res = await fetch(content as string);
			return Buffer.from(await res.arrayBuffer());
		} catch {
			return getDefaultBuffer();
		}
	}
	return getDefaultBuffer();
};

export const getSendFileOptions = async (
	content: AnyContent,
	fileName?: string,
	caption?: string
) => {
	const buffer = await downloadFile(content);
	const fileType = await fromBuffer(buffer);
	const mime = new MIMEType(fileType?.mime ?? "application/octet-stream");
	const mimeType = new MIMEType(fileType?.mime ?? "application/octet-stream");

	type SupportedMediaTypes = (typeof SUPPORTED_MEDIA_TYPES)[number];

	const type = SUPPORTED_MEDIA_TYPES.includes(
		mimeType.type as SupportedMediaTypes
	)
		? mimeType.type
		: "document";

	const path = getTemporaryPath(mime.subtype ?? mime.type ?? "bin");
	await createFile(path, buffer);
	const size = statSync(path).size;

	const finalType = size > 64 * 1024 * 1024 ? "document" : type;
	const sendOptions = {
		fileName: fileName || path.split("/").pop(),
		mimetype: mime.type,
		caption: /webp|audio/i.test(mime.toString()) ? undefined : caption,
	};

	if (/audio/i.test(mime.toString())) {
		sendOptions.mimetype = "audio/ogg; codecs=opus";
	}
	return {
		sendOptions: sendOptions as unknown as AnyMediaMessageContent,
		path,
		type: finalType,
		unlink: () =>
			wrap(
				() => unlinkSync(path),
				() => {}
			),
	};
};
