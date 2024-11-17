export const readEnv = (key: string): string | undefined => {
	return process.env[key] ?? undefined;
};
