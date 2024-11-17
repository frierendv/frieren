import * as OpenAPI from "./openapi";

export class Client extends OpenAPI.APIClient {
	constructor(options: OpenAPI.ClientOptions = {}) {
		super(options);
	}
	get = this._client.GET;
	post = this._client.POST;
}
