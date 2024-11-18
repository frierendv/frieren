export class InternalError extends Error {
	constructor(
		message: string,
		// eslint-disable-next-line no-unused-vars
		public readonly code?: number
	) {
		super(message);
	}
}
