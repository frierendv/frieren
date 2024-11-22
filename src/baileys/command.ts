/* eslint-disable no-unused-vars */
import { IContextMessage } from "./types";

export type Command = (command: string, ctx: IContextMessage) => Promise<void>;
