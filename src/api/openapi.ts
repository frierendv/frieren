import createClient from "openapi-fetch";
import { InternalError } from "../error";
import { readEnv } from "../shared/read-env";
import { paths } from "./spec";

export interface APIClientOptions {
	/**
	 * Base URL to use for requests.
	 *
	 * Default: `process.env.ITSROSE_API_URL`
	 */
	baseUrl?: string;
	/**
	 * API key to use for requests.
	 *
	 * Default: `process.env.ITSROSE_API_KEY`
	 */
	apiKey?: string;
	/**
	 * Fetch implementation to use for requests.
	 */
	fetch?: typeof globalThis.fetch;
}

export class APIClient {
	protected readonly _baseUrl: string | undefined;
	protected readonly _client: ReturnType<typeof createClient<paths>>;

	readonly #_apiKey: string | undefined;

	constructor({ baseUrl, apiKey, fetch }: APIClientOptions) {
		this.#_apiKey = apiKey ?? readEnv("ITSROSE_API_KEY");
		if (!this.#_apiKey) {
			throw new InternalError("API key is required");
		}

		this._baseUrl = baseUrl ?? readEnv("ITSROSE_API_URL");
		if (!this._baseUrl) {
			throw new InternalError("Base URL is required");
		}

		this._client = createClient<paths>({
			baseUrl: this._baseUrl,
			fetch: fetch ?? globalThis.fetch,
			headers: {
				Authorization: `Bearer ${this.#_apiKey}`,
			},
		});
	}
}
