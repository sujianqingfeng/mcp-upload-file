import { defineConfig } from "tsup"

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	dts: true,
	splitting: false,
	sourcemap: false,
	clean: true,
	minify: false,
	outDir: "dist",
	// Ensure all dependencies are bundled properly
	noExternal: ["zod", "zod-to-json-schema"],
	// Bundle all dependencies to avoid module resolution issues
	bundle: true,
	// Ensure proper platform compatibility
	platform: "node",
	target: "node18",
})
