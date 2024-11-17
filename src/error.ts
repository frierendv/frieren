export class InternalError extends Error {
	constructor(
		message: string,
		public readonly code?: number
	) {
		super(message);
	}
}
