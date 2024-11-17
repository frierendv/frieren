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
	makeInMemoryStore,
	proto,
	useMultiFileAuthState,
} from "baileys";
import EventEmitter from "events";
import Pino from "pino";
import {
	assignQuotedIfExist,
	downloadMedia,
	findMessage,
} from "./lib/messages";
import { parsePhoneNumber, safeFormat } from "./lib/parse";
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

const store = makeInMemoryStore({});
store.readFromFile("./baileys_store.json");

class WASocket extends EventEmitter {
	private state: AuthenticationState | null = null;
	private _options: WASocketOptions;

	public on<K extends keyof BaileysEventMap>(
		eventName: K,
		listener: (_args: BaileysEventMap[K]) => void
	): this {
		return super.on(eventName, listener);
	}

	public logger: Pino.Logger = Pino(
		{
			timestamp: () => `,"time":"${new Date().toJSON()}"`,
			level: "silent",
		},
		Pino.destination(LOG_FILE_PATH)
	);

	public authPath = AUTH_INFO_PATH;

	public sock: ReturnType<typeof makeWASocket> | null = null;
	public store = store;

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
		const shouldReconnect =
			(lastDisconnect?.error as Boom)?.output?.statusCode !==
			DisconnectReason.loggedOut;
		if (connection === "close") {
			if (!shouldReconnect) {
				this.logger.error("Connection closed. You are logged out.");
				// throw new InternalError("Connection closed. You are logged out.");
			} else {
				this.connect();
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
		console.log({ message, messageInfo });
		const msg = findMessage(message);
		const parsedMessage: Partial<IParsedMessage> = {
			type,
			text: msg?.caption || msg?.text || "",
			media: null,
			isGroup: false,
		};

		const { key, pushName } = messageInfo;
		parsedMessage.name = safeFormat(pushName);
		if (key.remoteJid) {
			parsedMessage.sender = parsedMessage.from =
				// (key.fromMe &&
				// Again, socket is not null, because we call this method
				// after the socket is assigned
				// (this.sock!.user?.id as string)) ||
				// To avoid undefined error
				key.remoteJid;
			parsedMessage.isGroup = key.remoteJid.includes("@g.us");
			// If key.participant exists, it means the message is from a group
			if (parsedMessage.isGroup && key.participant) {
				parsedMessage.sender = key.participant;
				parsedMessage.from = key.remoteJid;
			}
			parsedMessage.phone = parsePhoneNumber(parsedMessage.sender);
		}

		// We extract the text from the message
		// in this case, we are checking if the message is a text message
		const contextInfo = (
			message[type] as proto.IMessage & {
				contextInfo?: proto.IContextInfo;
			}
		)?.contextInfo;
		parsedMessage.quoted = assignQuotedIfExist<IParsedMessage["quoted"]>(
			{ messageInfo, contextInfo },
			this.sock!
		);

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

		if (msg?.mimetype) {
			parsedMessage.media = {
				mimetype: msg.mimetype,
				download: async () => downloadMedia(messageInfo),
			};
		}
		return parsedMessage as IParsedMessage;
	}
}

export { WASocket, WASocketOptions };
