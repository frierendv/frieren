import pluginJs from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * @type {import("eslint").Linter.Config}
 */
export default [
	{
		ignores: [
			"dist/**/*",
			"__tests__/**/*",
			"node_modules/**/*",
			"coverage/**/*",
			"src/api/spec.d.ts",
			"scripts/**/*",
		],
	},
	{ languageOptions: { globals: { ...globals.node } } },
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			curly: ["error"],
			"no-else-return": ["error", { allowElseIf: false }],
			quotes: ["error", "double", { avoidEscape: true }],
			semi: ["error", "always"],
			"space-before-function-paren": [
				"error",
				{
					anonymous: "always",
					named: "never",
					asyncArrow: "always",
				},
			],
			"arrow-parens": ["error", "always"],
			"no-mixed-spaces-and-tabs": ["error", "smart-tabs"],
			"no-unused-vars": [
				"warn",
				{
					vars: "all",
					args: "after-used",
					ignoreRestSiblings: true,
					argsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		plugins: {
			prettier: eslintPluginPrettier.plugins.prettier,
		},
		rules: {
			"prettier/prettier": [
				"error",
				{
					plugins: ["@trivago/prettier-plugin-sort-imports"],
					useTabs: true,
					tabWidth: 4,
					semi: true,
					singleQuote: false,
					quoteProps: "as-needed",
					jsxSingleQuote: false,
					trailingComma: "es5",
					bracketSpacing: true,
					arrowParens: "always",
					endOfLine: "lf",
				},
			],
		},
	},
];
