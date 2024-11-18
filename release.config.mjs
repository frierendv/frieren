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
				assets: ["frieren-*.tgz"],
			},
		],
		"@semantic-release/git",
	],
};
