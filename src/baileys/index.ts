import { Boom } from "@hapi/boom";
import makeWASocket, {
	AuthenticationState,
	BaileysEventEmitter,
	BaileysEventMap,
	ConnectionState,
	DisconnectReason,
	MessageUpsertType,
	UserFacingSocketConfig,
	WAMessage,
	isJidBroadcast,
	isJidNewsletter,
	jidNormalizedUser,
	makeCacheableSignalKeyStore,
	makeInMemoryStore,
	proto,
	useMultiFileAuthState,
} from "baileys";
import EventEmitter from "events";
import Pino from "pino";
import { Mutex } from "../shared/mutex";
import {
	assignQuotedIfExist,
	downloadMedia,
	findMessage,
} from "./lib/messages";
import * as Parse from "./lib/parse";
import * as Wrapper from "./lib/wrapper";
import { IMessageArray } from "./resource/message";
import { IParsedMessage } from "./types";

type WASocketOptions = Omit<UserFacingSocketConfig, "auth"> & {
	/**
	 * The path to store the authentication information.
	 */
	authPath?: string;
	/**
	 * The path to store the store information.
	 */
	storePath?: string;
};

const DEFAULT_AUTH_INFO_PATH = "baileys_auth_info";
const DEFAULT_STORE_FILE_PATH = "baileys_store.json";
const DEFAULT_LOG_FILE_PATH = "./wa-logs.txt";

class WASocket extends EventEmitter {
	private _mutex = new Mutex();
	private state: AuthenticationState | null = null;
	private logger: Pino.Logger;

	private readonly _options: WASocketOptions;
	private readonly authPath: string;
	private readonly storePath: string;

	public on<T extends keyof BaileysEventMap | "message.upsert-parsed">(
		eventName: T,
		listener: (
			_args: T extends "message.upsert-parsed"
				? IParsedMessage
				: BaileysEventMap[Exclude<T, "message.upsert-parsed">]
		) => void
	): this {
		return super.on(eventName, listener);
	}

	public sock: ReturnType<typeof makeWASocket> | null = null;
	public store = makeInMemoryStore({});

	constructor(options: WASocketOptions = {}) {
		super();
		const { authPath, storePath, ...rest } = options;
		this.authPath = authPath ?? DEFAULT_AUTH_INFO_PATH;
		this.storePath =
			(storePath
				? storePath.endsWith(".json")
					? storePath
					: `${storePath}.json`
				: null) ?? DEFAULT_STORE_FILE_PATH;
		this.logger = Pino(
			{
				timestamp: () => `,"time":"${new Date().toISOString()}"`,
				level:
					process.env.NODE_ENV === "development" ? "trace" : "silent",
			},
			Pino.destination(DEFAULT_LOG_FILE_PATH)
		);
		this._options = { ...rest };
		this.setupStore();
		this.initialize();
	}

	protected setupStore() {
		this.store.readFromFile(this.storePath);
		this._mutex.runWithInterval(
			() => this.store.writeToFile(this.storePath),
			10_000
		);
		this.store.bind(this as unknown as BaileysEventEmitter);
	}

	protected async initialize() {
		try {
			const auth = await useMultiFileAuthState(this.authPath);
			this.state = auth.state;

			this.connect();
			this.on("creds.update", auth.saveCreds);
			this.on("connection.update", this.handleConnectionUpdate);
		} catch (error) {
			this.logger.error("Initialization failed:", error);
		}
	}

	private handleConnectionUpdate = (update: Partial<ConnectionState>) => {
		const { connection, lastDisconnect } = update;
		if (connection === "close") {
			const shouldReconnect =
				(lastDisconnect?.error as Boom)?.output?.statusCode !==
				DisconnectReason.loggedOut;
			if (!shouldReconnect) {
				this.logger.error("Connection closed. You are logged out.");
			} else {
				this.connect();
			}
		}
	};

	protected connect() {
		this.sock = makeWASocket({
			printQRInTerminal: true,
			shouldIgnoreJid: (jid) =>
				isJidBroadcast(jid) || isJidNewsletter(jid),
			...this._options,
			auth: {
				/**
				 * state is not null, because
				 * we call connect after assigned
				 * the state
				 */
				creds: this.state!.creds,
				keys: makeCacheableSignalKeyStore(
					this.state!.keys,
					this.logger
				),
			},
		});

		this.sock.ev.emit.bind(this);

		this.sock.ev.on("messages.upsert", this.handleMessagesUpsert);
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

	private prepareMessage(update: {
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

	private parseMessage<MType extends keyof proto.IMessage>(
		type: MType,
		message: proto.IMessage,
		messageInfo: proto.IWebMessageInfo
	): IParsedMessage {
		// Find the message from the message object
		const msg = findMessage(message);

		const text = msg?.conversation ?? msg?.caption ?? msg?.text ?? "";
		const parsedMessage: Partial<IParsedMessage> = {
			type,
			text,
			args: text.split(" "),
			media: null,
			isGroup: false,
		};

		// if the message is a media message
		if (msg?.mimetype) {
			parsedMessage.media = {
				mimetype: msg.mimetype,
				download: async () => downloadMedia(messageInfo),
			};
		}

		const { key, pushName } = messageInfo;
		parsedMessage.name = Parse.safeString(pushName);
		if (key.remoteJid) {
			parsedMessage.sender = parsedMessage.from = key.fromMe
				? jidNormalizedUser(this.sock!.user?.id)
				: key.remoteJid;
			parsedMessage.isGroup = key.remoteJid.includes("@g.us");

			// If key.participant exists, it means the message is from a group
			if (key.participant) {
				parsedMessage.sender = key.participant;
				parsedMessage.from = key.remoteJid;
			}
			parsedMessage.phone = Parse.phoneNumber(parsedMessage.sender);
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

		parsedMessage.reply = async (text: string) =>
			Wrapper.wrap(
				() =>
					this.sock!.sendMessage(
						parsedMessage.sender!,
						{
							text,
						},
						{
							quoted: messageInfo,
						}
					),
				(error) => {
					this.logger.error("Reply failed:", error);
				}
			);

		parsedMessage.delete = async () =>
			Wrapper.wrap(
				() =>
					this.sock!.sendMessage(parsedMessage.sender!, {
						delete: key,
					}),
				(error) => {
					this.logger.error("Delete failed:", error);
				}
			);
		return { ...parsedMessage, message: messageInfo } as IParsedMessage;
	}
}

export { WASocket, WASocketOptions };
