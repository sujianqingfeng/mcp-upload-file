import { describe, expect, test, beforeEach, beforeAll } from "vitest"
// Disable CLI entrypoint when index.ts is imported during tests
process.env.SKIP_MCP_MAIN = "1"

// @ts-ignore -- path resolved by Vitest's TS loader
let uploadFileHandler: typeof import("../index.js").uploadFileHandler

// Dynamically import the module after setting env vars
beforeAll(async () => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	const mod = await import("../index.js")
	uploadFileHandler = mod.uploadFileHandler
})

// Helper to set required env vars for the handler
function setDummyEnv() {
	process.env.UPLOAD_URL = process.env.UPLOAD_URL || "http://localhost/dummy"
	process.env.FILE_KEY = process.env.FILE_KEY || "file"
	process.env.FILE_NAME = process.env.FILE_NAME || "fileName"
}

describe("uploadFileHandler", () => {
	beforeEach(() => {
		setDummyEnv()
	})

	test("returns 'File not found' error when given an invalid file URI", async () => {
		const invalidUri = "file:///this/path/definitely/does/not/exist.jpeg"
		const result = await uploadFileHandler({
			source: invalidUri,
			fileName: "exist.jpeg",
		})

		// The handler returns a content array with a single text message
		expect(result.content[0]?.text).toMatch(/File not found at path/)
	})
})
