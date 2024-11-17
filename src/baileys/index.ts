import { Boom } from "@hapi/boom";
import makeWASocket, {
	AuthenticationState,
	BaileysEventMap,
	ConnectionState,
	DisconnectReason,
	MessageUpsertType,
	UserFacingSocketConfig,
	WAMessage,
	isJidBroadcast,
	makeCacheableSignalKeyStore,
	proto,
	useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import EventEmitter from "events";
import Pino from "pino";
import { assignQuotedIfExist, downloadMedia } from "./lib/messages";
import { IMessageArray } from "./resource/message";
import { IParsedMessage } from "./types";

type WASocketOptions = Omit<UserFacingSocketConfig, "auth"> & {
	authPath?: string;
};

interface WASocket {
	on<K extends "message.upsert-parsed">(
		eventName: K,
		listener: (_args: IParsedMessage) => void
	): this;
}
const AUTH_INFO_PATH = "baileys_auth_info";
const LOG_FILE_PATH = "./wa-logs.txt";
const DEV_ENV = process.env.NODE_ENV === "development";

class WASocket extends EventEmitter {
	private sock: ReturnType<typeof makeWASocket> | null = null;
	private state: AuthenticationState | null = null;

	private _options: WASocketOptions;

	public on<K extends keyof BaileysEventMap>(
		eventName: K,
		listener: (_args: BaileysEventMap[K]) => void
	): this {
		return super.on(eventName, listener);
	}

	public logger = Pino(
		{ timestamp: () => `,"time":"${new Date().toJSON()}"` },
		Pino.destination(LOG_FILE_PATH)
	);

	public authPath = AUTH_INFO_PATH;

	constructor(options: WASocketOptions = {}) {
		super();
		this.setupLogger();
		const { authPath, ...rest } = options;
		this.authPath = authPath ?? AUTH_INFO_PATH;
		this._options = {
			...rest,
		};
		if (!this.sock) {
			this.initialize();
		}
	}

	private setupLogger() {
		if (DEV_ENV) {
			this.logger.level = "trace";
		}
	}

	protected async initialize() {
		try {
			const auth = await useMultiFileAuthState(this.authPath);
			this.state = auth.state;
			this.connect();
			this.on("creds.update", auth.saveCreds);
			this.on("connection.update", this.shouldReconnect);
		} catch (error) {
			this.logger.error("Initialization failed:", error);
		}
	}

	protected shouldReconnect(update: Partial<ConnectionState>) {
		const { connection, lastDisconnect } = update;
		if (connection === "close") {
			if (
				(lastDisconnect?.error as Boom)?.output?.statusCode !==
				DisconnectReason.loggedOut
			) {
				this.connect();
			} else {
				console.log("Connection closed. You are logged out.");
			}
		}
	}

	protected connect() {
		this.sock = makeWASocket({
			printQRInTerminal: true,
			shouldIgnoreJid: (jid) => isJidBroadcast(jid),
			...this._options,
			auth: {
				/**
				 * state is not null, because
				 * we call connect after assigned
				 * the state
				 */
				creds: this.state?.creds!,
				keys: makeCacheableSignalKeyStore(
					this.state?.keys!,
					this.logger
				),
			},
		});

		this.sock.ev.emit = this.emit.bind(this);

		this.on("messages.upsert", this.handleMessagesUpsert);
	}

	private handleMessagesUpsert = (messages: {
		messages: WAMessage[];
		type: MessageUpsertType;
		requestId?: string;
	}) => {
		const info = this.prepareMessage(messages);
		if (!info) {
			return;
		}
		this.emit(
			"message.upsert-parsed",
			this.parseMessage(info.mtype, info.message, info.messageInfo)
		);
	};

	prepareMessage(update: {
		messages: WAMessage[];
		type: MessageUpsertType;
		requestId?: string;
	}): {
		mtype: keyof proto.IMessage;
		message: proto.IMessage;
		messageInfo: proto.IWebMessageInfo;
	} | null {
		const { messages, type } = update;
		if (type === "notify") {
			if (!messages[0]?.message) {
				return null;
			}
			const { message } = messages[0];
			for (const mtype of IMessageArray) {
				if (message[mtype]) {
					return { mtype, message, messageInfo: messages[0] };
				}
			}
		}
		return null;
	}

	parseMessage<MType extends keyof proto.IMessage>(
		type: MType,
		message: proto.IMessage,
		messageInfo: proto.IWebMessageInfo
	): IParsedMessage {
		const parsedMessage: Partial<IParsedMessage> = {
			text: undefined,
			media: null,
			isGroup: false,
		};

		const { key, pushName } = messageInfo;
		parsedMessage.name = pushName ?? "";
		if (key.remoteJid) {
			parsedMessage.sender = key.remoteJid;
			parsedMessage.isGroup = key.remoteJid.includes("@g.us");
			if (parsedMessage.isGroup) {
				parsedMessage.sender = key.participant ?? key.remoteJid;
			}
		}

		if (
			type === "extendedTextMessage" ||
			type === "ephemeralMessage" ||
			type === "conversation"
		) {
			const m = message[type] as proto.Message.ExtendedTextMessage;
			const { contextInfo } = m;
			parsedMessage.quoted =
				assignQuotedIfExist<IParsedMessage["quoted"]>(contextInfo);
			parsedMessage.text = m.text || undefined;
		}

		parsedMessage.reply = async (text: string) => {
			if (this.sock && parsedMessage.sender) {
				try {
					await this.sock.sendMessage(
						parsedMessage.sender,
						{ text: text || "" },
						{ quoted: messageInfo }
					);
				} catch (error) {
					this.logger.error("Reply failed:", error);
					return undefined;
				}
			}
		};

		parsedMessage.delete = async () => {
			if (this.sock && parsedMessage.sender) {
				try {
					await this.sock.sendMessage(parsedMessage.sender, {
						delete: key,
					});
				} catch (error) {
					this.logger.error("Delete failed:", error);
				}
			}
		};

		if (this.isMediaType(type)) {
			parsedMessage.media = this.parseMedia(message, type, messageInfo);
		}

		return parsedMessage as IParsedMessage;
	}

	private isMediaType(type: keyof proto.IMessage): boolean {
		const mediaTypes: (keyof proto.IMessage)[] = [
			"imageMessage",
			"audioMessage",
			"videoMessage",
			"stickerMessage",
			"ptvMessage",
		];
		return mediaTypes.includes(type);
	}

	private parseMedia(
		message: proto.IMessage,
		type: keyof proto.IMessage,
		messageInfo: proto.IWebMessageInfo
	) {
		const m = message[type] as
			| proto.Message.ImageMessage
			| proto.Message.VideoMessage
			| proto.Message.AudioMessage
			| proto.Message.StickerMessage;
		return {
			mimetype: m.mimetype,
			download: async () => downloadMedia(messageInfo),
		};
	}
}

export { WASocket, WASocketOptions };
