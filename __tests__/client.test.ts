import { Client } from "../src/client";

describe("OpenAPI Client", () => {
	const mockEnv = (
		apikey: string | undefined,
		baseUrl: string | undefined
	) => {
		process.env.ITSROSE_API_KEY = apikey ?? "";
		process.env.ITSROSE_API_URL = baseUrl ?? "";
	};

	afterEach(() => {
		jest.resetModules();
		delete process.env.ITSROSE_API_KEY;
		delete process.env.ITSROSE_API_URL;
	});

	it("should throw an error if no API key is provided", () => {
		mockEnv(undefined, undefined);

		expect(() => new Client()).toThrow("API key is required");
	});

	it("should throw an error if no base URL is provided", () => {
		mockEnv("apikey", undefined);

		expect(() => new Client()).toThrow("Base URL is required");
	});

	it("should initialize with API key and base URL", () => {
		mockEnv("apikey", "https://example.com");

		const client = new Client();
		expect(client).toBeInstanceOf(Client);
		expect(client.get).toBeDefined();
		expect(client.post).toBeDefined();
	});
});
