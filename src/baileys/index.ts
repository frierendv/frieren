import { Boom } from "@hapi/boom";
import {
	DisconnectReason,
	isJidBroadcast,
	isJidNewsletter,
	jidNormalizedUser,
	makeCacheableSignalKeyStore,
	makeInMemoryStore,
	makeWASocket,
	proto,
	useMultiFileAuthState,
} from "baileys";
import type { WASocket as WASocketType } from "baileys";
import type {
	AuthenticationState,
	BaileysEventEmitter,
	BaileysEventMap,
	ConnectionState,
	MessageUpsertType,
	MiscMessageGenerationOptions,
	UserFacingSocketConfig,
	WAMessage,
	WAMessageContent,
	WAMessageKey,
} from "baileys/lib/Types";
import EventEmitter from "events";
import Pino from "pino";
import { Mutex } from "../shared/mutex";
import { assignQuotedIfExist } from "./lib/message";
import {
	createMediaObject,
	deleteQuotedMessage,
	extractMessageText,
	findMessage,
	prepareMessage,
	replyToQuotedMessage,
} from "./lib/message-utils";
import * as Parse from "./lib/parse";
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

	public on<T extends keyof BaileysEventMap | "message">(
		eventName: T,
		listener: (
			_args: T extends "message"
				? IParsedMessage
				: BaileysEventMap[Exclude<T, "message">]
		) => void
	): this {
		return super.on(eventName, listener);
	}

	public sock!: WASocketType;
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
		/** Need manual binding on connected */
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
			const { state, saveCreds } = await useMultiFileAuthState(
				this.authPath
			);
			this.state = state;

			this.connect();

			this.on("creds.update", saveCreds);
			this.on("connection.update", this.handleConnectionUpdate);
			this.on("messages.upsert", this.handleMessagesUpsert);
		} catch (error) {
			this.logger.error("Initialization failed:", error);
		}
	}

	protected handleConnectionUpdate = (
		connectionState: Partial<ConnectionState>
	) => {
		const { connection, lastDisconnect } = connectionState;
		if (connection === "open" && this.sock) {
			this.sock.ev.emit = this.emit.bind(this);
		}
		if (connection === "close") {
			const shouldReconnect =
				(lastDisconnect?.error as Boom)?.output?.statusCode !==
				DisconnectReason.loggedOut;
			if (shouldReconnect) {
				this.connect();
			} else {
				this.logger.error("Connection closed. You are logged out.");
			}
		}
	};

	protected connect() {
		this.sock = makeWASocket({
			printQRInTerminal: true,
			shouldIgnoreJid: (jid) =>
				isJidBroadcast(jid) || isJidNewsletter(jid),
			syncFullHistory: false,
			generateHighQualityLinkPreview: true,
			getMessage: this.getMessage.bind(this),
			...this._options,
			auth: {
				creds: this.state!.creds,
				keys: makeCacheableSignalKeyStore(
					this.state!.keys,
					this.logger
				),
			},
		});
		this.emitProcess(this.sock);
	}

	async getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		if (this.store) {
			const msg = await this.store.loadMessage(key.remoteJid!, key.id!);
			return msg?.message || undefined;
		}

		// only if store is present
		return proto.Message.fromObject({});
	}

	protected emitProcess(sock: WASocketType) {
		sock.ev.process((event) => {
			const [eventName] = Object.keys(event) as
				| [keyof BaileysEventMap]
				| [undefined];
			if (eventName) {
				this.emit(eventName, event[eventName]);
			}
		});
	}

	protected handleMessagesUpsert = (messages: {
		messages: WAMessage[];
		type: MessageUpsertType;
		requestId?: string;
	}) => {
		const info = prepareMessage(messages);
		if (!info) {
			return;
		}
		this.emit(
			"message",
			this.parseMessage(info.mtype, info.message, info.messageInfo)
		);
	};

	private parseMessage<MType extends keyof proto.IMessage>(
		type: MType,
		message: proto.IMessage,
		messageInfo: proto.IWebMessageInfo
	): IParsedMessage {
		// Find the message from the message object
		const msg = findMessage(message);

		const text = extractMessageText(msg);
		const media = createMediaObject(msg, messageInfo.message!);
		const parsedMessage: Partial<IParsedMessage> = {
			type,
			text,
			args: text.split(" "),
			media,
			isGroup: false,
		};

		const { key, pushName } = messageInfo;
		parsedMessage.name = Parse.safeString(pushName);
		if (key.remoteJid) {
			parsedMessage.sender = parsedMessage.from = jidNormalizedUser(
				key.remoteJid
			);
			parsedMessage.isGroup = key.remoteJid.includes("@g.us");

			// If key.participant exists, it means the message is from a group
			if (key.participant) {
				parsedMessage.sender = jidNormalizedUser(key.participant);
			}

			if (key.fromMe) {
				parsedMessage.sender = jidNormalizedUser(this.sock!.user!.id);
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

		parsedMessage.reply = async (
			text: string,
			opts?: MiscMessageGenerationOptions
		) =>
			replyToQuotedMessage(
				parsedMessage.from!,
				text,
				opts,
				this.sock!,
				messageInfo
			);

		parsedMessage.delete = async () =>
			deleteQuotedMessage(parsedMessage, messageInfo, this.sock!);
		return { ...parsedMessage, message: messageInfo } as IParsedMessage;
	}
}

export { WASocket, WASocketOptions };
export { IParsedMessage, IParsedMedia } from "./types";
