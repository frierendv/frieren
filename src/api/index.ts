import * as OpenAPI from "./openapi";

export class Client extends OpenAPI.APIClient {
	constructor(options: OpenAPI.APIClientOptions = {}) {
		super(options);
	}
	get = this._client.GET;
	post = this._client.POST;
}

export { APIClientOptions } from "./openapi";
