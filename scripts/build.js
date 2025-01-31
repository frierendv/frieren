#!/usr/bin/env node

const fs = require("fs").promises;
const { exec } = require("child_process");
const util = require("util");

const execAsync = util.promisify(exec);

(async () => {
	try {
		const OPEN_API_SCHEMA_URL =
			"https://scdn.lovita.io/openapi/itsrose.json";

		// Remove and recreate dist directory
		await fs.rm("dist", { recursive: true, force: true });
		await fs.mkdir("dist");

		// SETUP
		// Copy original file
		await fs.copyFile(
			"node_modules/baileys/lib/Socket/index.d.ts",
			"dist/lib.Socket.baileys.d.ts"
		);

		// Replace the import
		let content = await fs.readFile(
			"node_modules/baileys/lib/Socket/index.d.ts",
			"utf-8"
		);
		content = content.replace(/import\("long"\).Long/g, 'import("long")');
		await fs.writeFile(
			"node_modules/baileys/lib/Socket/index.d.ts",
			content
		);

		// Get latest openapi schema
		await execAsync(
			`npx openapi-typescript "${OPEN_API_SCHEMA_URL}" --output src/api/spec.ts`
		);

		// Compile
		await execAsync("npm exec tsc", { stdio: "inherit" });

		// POST-COMPILE
		// Restore the original file
		await fs.rename(
			"dist/lib.Socket.baileys.d.ts",
			"node_modules/baileys/lib/Socket/index.d.ts"
		);

		// Create a module type definition file
		await fs.copyFile("dist/index.d.ts", "dist/index.d.mts");

		// Make sure isomorphic module works
		await execAsync("node -e 'require(\"@frierendv/frieren\")'", {
			cwd: "dist",
			stdio: "inherit",
		});
		await execAsync("node -e 'import(\"@frierendv/frieren\")'", {
			cwd: "dist",
			stdio: "inherit",
			shell: true,
		});
	} catch (error) {
		console.error("Build failed:", error);
		process.exit(1);
	}
})();
