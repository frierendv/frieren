import createClient from "openapi-fetch";
import { fetch as undiciFetch } from "undici";
import { InternalError } from "../error";
import { readEnv } from "../shared/read-env";
import { paths } from "./spec";

export interface ClientOptions {
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
}

export class APIClient {
	protected readonly _baseUrl: string | undefined;
	protected readonly _apiKey: string | undefined;
	protected readonly _client: ReturnType<typeof createClient<paths>>;

	constructor({ baseUrl, apiKey }: ClientOptions) {
		this._apiKey = apiKey ?? readEnv("ITSROSE_API_KEY");
		if (!this._apiKey) {
			throw new InternalError("API key is required");
		}

		this._baseUrl = baseUrl ?? readEnv("ITSROSE_API_URL");
		if (!this._baseUrl) {
			throw new InternalError("Base URL is required");
		}

		this._client = createClient<paths>({
			baseUrl: this._baseUrl,
			fetch: (input: Request) =>
				undiciFetch(input.url, {
					method: input.method,
					headers: input.headers,
					body: input.body,
				}),
			headers: {
				Authorization: `Bearer ${this._apiKey}`,
			},
		});
	}
}
