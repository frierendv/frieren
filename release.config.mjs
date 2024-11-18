/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
	branches: [
		{
			name: "main",
			channel: "latest",
		},
		{
			name: "beta",
			channel: "beta",
			prerelease: "beta",
		},
	],
	plugins: [
		"@semantic-release/commit-analyzer",
		"@semantic-release/release-notes-generator",
		[
			"@semantic-release/github",
			{
				assets: ["dist/**"],
			},
		],
		"@semantic-release/git",
	],
};
