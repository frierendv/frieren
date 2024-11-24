import { ICommandHandler } from "./types";

class Trie {
	children: { [key: string]: Trie } = {};
	commandHandler?: ICommandHandler;
}

export class TrieNode {
	node = new Trie();
	add(command: string, handler: ICommandHandler) {
		let node = this.node;
		for (const char of command) {
			if (!node.children[char]) {
				node.children[char] = new Trie();
			}
			node = node.children[char];
		}
		node.commandHandler = handler;
	}
	find(command: string): ICommandHandler | null {
		let node = this.node;
		let lastMatchingNode: Trie | null = null;

		for (const char of command) {
			if (!node.children[char]) {
				break;
			}
			node = node.children[char];
			if (node.commandHandler) {
				lastMatchingNode = node;
			}
		}

		return lastMatchingNode?.commandHandler ?? null;
	}
}
