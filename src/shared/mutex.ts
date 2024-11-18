import { Mutex as AsyncMutex } from "async-mutex";

type Task<T> = () => T | Promise<T>;

export class Mutex extends AsyncMutex {
	private queue: Task<any>[] = [];

	private async runNext() {
		if (this.queue.length === 0) {
			this.release();
			return;
		}

		this.acquire();
		const task = this.queue.shift()!;
		try {
			await task();
		} finally {
			this.runNext();
		}
	}

	override async runExclusive<T>(task: Task<T>): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const wrappedTask = async () => {
				try {
					resolve(await task());
				} catch (error) {
					reject(error);
				}
			};
			this.queue.push(wrappedTask);
			if (!this.isLocked()) {
				this.runNext();
			}
		});
	}

	runWithInterval<T>(task: Task<T>, interval: number): void {
		const intervalId = setInterval(async () => {
			if (!this.isLocked()) {
				clearInterval(intervalId);
				await this.runExclusive(task);
			}
		}, interval);
	}
}
