import { Hello } from "../src/index";

describe("Hello", () => {
	it("should return 'Hello, world!'", () => {
		expect(Hello()).toBe("Hello, world!");
	});
});
