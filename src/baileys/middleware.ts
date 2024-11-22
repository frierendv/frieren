/* eslint-disable no-unused-vars */
import { IContextMessage } from "./types";

export type Middleware = (
	ctx: IContextMessage,
	next: () => Promise<void>
) => Promise<void>;
