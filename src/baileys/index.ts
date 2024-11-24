import type { Boom } from "@hapi/boom";
import {
	DisconnectReason,
	getAggregateVotesInPollMessage,
	isJidBroadcast,
	isJidNewsletter,
	jidNormalizedUser,
	makeCacheableSignalKeyStore,
	makeWASocket,
	proto,
	useMultiFileAuthState,
} from "baileys";
import type {
	AnyMediaMessageContent,
	AnyRegularMessageContent,
	AuthenticationState,
	BaileysEventMap,
	ConnectionState,
	MessageUpsertType,
	UserFacingSocketConfig,
	WAMessage,
	WAMessageContent,
	WAMessageKey,
	WAMessageUpdate,
} from "baileys/lib/Types";
import EventEmitter from "events";
import Pino from "pino";
import { MIMEType } from "util";
import { Mutex } from "../shared/mutex";
import { CommandHandler } from "./command";
import { assignQuotedIfExist, sendFile } from "./lib/message";
import {
	createMediaObject,
	deleteQuotedMessage,
	extractMessageText,
	findMessage,
	prepareMessage,
	replyToQuotedMessage,
} from "./lib/message-utils";
import * as Parse from "./lib/parse";
import { extractPrefix } from "./lib/prefix";
import { makeInMemoryStore } from "./lib/store";
import { Middleware } from "./middleware";
import {
	FDEvent,
	FDEventListener,
	IContextMessage,
	WASocketType,
} from "./types";

type WASocketOptions = Omit<UserFacingSocketConfig, "auth"> & {
	/**
	 * The path to store the authentication information.
	 */
	authPath?: string;
	/**
	 * The path to store the store information.
	 */
	storePath?: string;
	/**
	 * Command prefix.
	 */
	prefix?: string | string[];
	/**
	 * The logger instance.
	 */
	logger?: Pino.Logger;
};

const DEFAULT_AUTH_INFO_PATH = "baileys_auth_info";
const DEFAULT_STORE_FILE_PATH = "baileys_store.json";
const DEFAULT_LOG_FILE_PATH = "./wa-logs.txt";

class WASocket {
	private _mutex = new Mutex();
	private state: AuthenticationState | null = null;
	private logger: Pino.Logger;

	private readonly _options: WASocketOptions;
	private readonly authPath: string;
	private readonly storePath: string;

	protected ev = new EventEmitter();

	private middlewares: Middleware[] = [];

	private commands: Map<string, CommandHandler> = new Map();

	public prefix: string | string[] | null = null;
	public sock: WASocketType | null = null;
	public store = makeInMemoryStore({});

	constructor(options: WASocketOptions = {}) {
		const { authPath, storePath, prefix, logger, ...rest } = options;

		this.prefix = prefix ?? null;

		this.authPath = authPath ?? DEFAULT_AUTH_INFO_PATH;
		this.storePath =
			(storePath
				? storePath.endsWith(".json")
					? storePath
					: `${storePath}.json`
				: null) ?? DEFAULT_STORE_FILE_PATH;
		this.logger =
			logger ??
			Pino(
				{
					timestamp: () => `,"time":"${new Date().toISOString()}"`,
					level:
						process.env.NODE_ENV === "development"
							? "trace"
							: "silent",
				},
				Pino.destination(DEFAULT_LOG_FILE_PATH)
			);
		this._options = { ...rest };
	}

	public async launch() {
		try {
			const { state, saveCreds } = await useMultiFileAuthState(
				this.authPath
			);
			this.state = state;

			this.connect();

			this.on("creds.update", saveCreds);
			this.on("connection.update", this.handleConnectionUpdate);

			this.on("messages.upsert", this.handleMessagesUpsert);
			this.on("messages.update", this.handelMessageUpdate);
		} catch (error) {
			this.logger.error("Initialization failed:", error);
		}
	}

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
		}) as WASocketType;
		this.emitBaileysProcess(this.sock);
	}

	protected setupStore(sock: WASocketType) {
		this.store.readFromFile(this.storePath);
		this._mutex.runWithInterval(
			() => this.store.writeToFile(this.storePath),
			10_000
		);
		this.store.bind(sock.ev);
	}

	protected handleConnectionUpdate = (
		connectionState: Partial<ConnectionState>
	) => {
		const { connection, lastDisconnect } = connectionState;

		switch (connection) {
			case "open":
				this.sock!.ev.emit = this.emit.bind(this);
				this.sock!.user!.id = jidNormalizedUser(this.sock!.user!.id);
				this.sock!.sendFile = async (
					jid: string,
					anyContent: string | Buffer | ArrayBuffer,
					fileName?: string,
					caption?: string,
					quoted?: IContextMessage
				) =>
					sendFile(
						this.sock!,
						jid,
						anyContent,
						fileName,
						caption,
						quoted
					);
				this.setupStore(this.sock!);
				break;
			case "close": {
				const statusCode = (lastDisconnect?.error as Boom)?.output
					?.statusCode;
				const shouldReconnect =
					statusCode !== DisconnectReason.loggedOut;
				if (shouldReconnect) {
					this.connect();
				} else {
					this.logger.error("Connection closed. You are logged out.");
				}
				break;
			}
		}
	};

	protected emitBaileysProcess(sock: WASocketType) {
		sock.ev.process((event) => {
			const [eventName] = Object.keys(event) as
				| [keyof BaileysEventMap]
				| [undefined];
			if (eventName) {
				this.emit(eventName, event[eventName]);
			}
		});
	}

	protected handleMessagesUpsert = async (messages: {
		messages: WAMessage[];
		type: MessageUpsertType;
		requestId?: string;
	}) => {
		const info = prepareMessage(messages);
		if (!info) {
			return;
		}
		const contextMessage = this.parseMessage(
			info.mtype,
			info.message,
			info.messageInfo
		);
		await this.executeMiddlewares(contextMessage);
	};

	private async executeMiddlewares(message: IContextMessage) {
		let index = -1;
		const next = async () => {
			index++;
			if (index < this.middlewares.length) {
				await this.middlewares[index]!(message, next);
			} else {
				await this.executeCommand(message);
			}
		};
		await next();
	}

	private async executeCommand(message: IContextMessage) {
		const { command, text, args } = extractPrefix(
			this.prefix,
			message.text
		);
		const commandHandler = this.commands.get(command);
		if (commandHandler) {
			Object.assign(message, { text, args });
			console.log({ command, text, args });
			await commandHandler(message);
		} else {
			this.emit("message", message);
		}
	}

	protected handelMessageUpdate = async (messages: WAMessageUpdate[]) => {
		for (const { key, update } of messages) {
			if (update.pollUpdates) {
				const pollCreation = await this.getMessage(key);
				if (pollCreation) {
					this.emit(
						"poll.update",
						getAggregateVotesInPollMessage({
							message: pollCreation,
							pollUpdates: update.pollUpdates,
						})
					);
				}
			}
		}
	};

	protected parseMessage<MType extends keyof proto.IMessage>(
		type: MType,
		message: proto.IMessage,
		messageInfo: proto.IWebMessageInfo
	): IContextMessage {
		// Find the message from the message object
		const msg = findMessage(message);

		const text = extractMessageText(msg);
		const media = createMediaObject(msg, messageInfo.message!);

		if (media) {
			const mediaType = new MIMEType(media.mimetype);
			this.emit(mediaType.type, media);
		}

		const contextMessage: Partial<IContextMessage> = {
			type,
			text,
			args: text.split(" "),
			media,
			isGroup: false,
		};

		const { key, pushName } = messageInfo;
		contextMessage.name = Parse.safeString(pushName);
		if (key.remoteJid) {
			contextMessage.sender = contextMessage.from = jidNormalizedUser(
				key.remoteJid
			);
			contextMessage.isGroup = key.remoteJid.includes("@g.us");

			// If key.participant exists, it means the message is from a group
			if (key.participant) {
				contextMessage.sender = jidNormalizedUser(key.participant);
			}

			if (key.fromMe) {
				contextMessage.sender = jidNormalizedUser(this.sock!.user!.id);
			}

			Object.assign(
				contextMessage,
				Parse.phoneNumber(contextMessage.sender)
			);
		}

		if (text) {
			this.emit("text", text);
		}

		// We extract the text from the message
		// in this case, we are checking if the message is a text message
		const contextInfo = (
			message[type] as proto.IMessage & {
				contextInfo?: proto.IContextInfo;
			}
		)?.contextInfo;
		contextMessage.mentionedJid = contextInfo?.mentionedJid ?? [];
		contextMessage.quoted = assignQuotedIfExist<IContextMessage["quoted"]>(
			{ messageInfo, contextInfo },
			this.sock!,
			this.store
		);

		contextMessage.reply = async (
			text: string,
			opts?: AnyRegularMessageContent & AnyMediaMessageContent
		) =>
			replyToQuotedMessage(
				contextMessage.from!,
				text,
				this.sock!,
				messageInfo,
				opts
			);

		contextMessage.delete = async () =>
			deleteQuotedMessage(contextMessage, messageInfo, this.sock!);

		return {
			...contextMessage,
			sock: this.sock!,
			store: this.store,
			message: messageInfo,
		} as IContextMessage;
	}

	public use(middleware: Middleware) {
		this.middlewares.push(middleware);
	}

	public command(name: string, handler: CommandHandler) {
		this.commands.set(name, handler);
	}

	public on<T extends keyof BaileysEventMap | FDEvent>(
		eventName: T,
		listener: (
			_args: T extends FDEvent
				? FDEventListener<T>
				: T extends keyof BaileysEventMap
					? BaileysEventMap[T]
					: never | BaileysEventMap[Exclude<T, FDEvent>]
		) => void
	): this {
		this.ev.on(eventName, listener);
		return this;
	}

	public once<T extends keyof BaileysEventMap | FDEvent>(
		eventName: T,
		listener: (
			_args: T extends FDEvent
				? FDEventListener<T>
				: T extends keyof BaileysEventMap
					? BaileysEventMap[T]
					: never | BaileysEventMap[Exclude<T, FDEvent>]
		) => void
	): this {
		this.ev.once(eventName, listener);
		return this;
	}

	public off<T extends keyof BaileysEventMap | FDEvent>(
		eventName: T,
		listener: (
			_args: T extends FDEvent
				? FDEventListener<T>
				: T extends keyof BaileysEventMap
					? BaileysEventMap[T]
					: never | BaileysEventMap[Exclude<T, FDEvent>]
		) => void
	): this {
		this.ev.off(eventName, listener);
		return this;
	}

	public emit(event: string | symbol, ...args: unknown[]): boolean {
		return this.ev.emit(event, ...args);
	}

	async getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
		if (this.store) {
			const msg = await this.store.loadMessage(key.remoteJid!, key.id!);
			return msg?.message || undefined;
		}

		// only if store is present
		return proto.Message.fromObject({});
	}
}

export { WASocket, WASocketOptions };
export {
	IContextMessage,
	IContextMedia,
	IContextMessageBase,
	EditMsgFunction,
	DeleteMsgFunction,
	ReplyFunction,
	FDEvent,
	FDEventListener,
	FDEventMap,
} from "./types";
