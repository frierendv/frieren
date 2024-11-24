/* eslint-disable no-unused-vars */
import { IContextMessage } from "./types";

export type CommandHandler = (ctx: IContextMessage) => Promise<void>;
