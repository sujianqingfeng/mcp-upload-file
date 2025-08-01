import { describe, expect, test, beforeEach, beforeAll, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { vi } from "vitest"
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
	let tempFilePath: string

	beforeEach(() => {
		setDummyEnv()
	})

	afterEach(() => {
		// Clean up temp files
		if (tempFilePath && fs.existsSync(tempFilePath)) {
			fs.unlinkSync(tempFilePath)
		}
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

	test("successfully creates Blob from Buffer for file upload", async () => {
		// Create a temporary test file
		tempFilePath = path.join(__dirname, "test-image.jpeg")
		const testImageBuffer = Buffer.from([
			0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
			0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9
		]) // Minimal JPEG header and footer
		fs.writeFileSync(tempFilePath, testImageBuffer)

		// Mock the global FormData to capture what's being appended
		let capturedBlob: any = null
		const OriginalFormData = global.FormData
		
		// Create a mock FormData class
		class MockFormData {
			private data: Map<string, any> = new Map()
			
			append(name: string, value: any, filename?: string) {
				// Capture the blob for verification
				if (name === process.env.FILE_KEY) {
					capturedBlob = value
				}
				this.data.set(name, value)
			}

			get(name: string) {
				return this.data.get(name)
			}
		}

		// Mock the undici module
		const mockRequest = vi.fn().mockResolvedValue({
			body: {
				text: () => Promise.resolve("Upload successful"),
			},
		})

		// Replace the global FormData and undici request
		vi.stubGlobal('FormData', MockFormData)
		
		// Mock the undici import
		const undici = await import('undici')
		vi.spyOn(undici, 'request').mockImplementation(mockRequest)
		vi.spyOn(undici, 'FormData').mockImplementation(MockFormData as any)

		const fileUri = `file://${tempFilePath}`
		const result = await uploadFileHandler({
			source: fileUri,
			fileName: "test-image.jpeg",
		})

		// Verify that a Blob was created and passed to FormData
		expect(capturedBlob).toBeInstanceOf(Blob)
		expect(capturedBlob.size).toBe(testImageBuffer.length)

		// Verify the upload was attempted
		expect(mockRequest).toHaveBeenCalledWith(
			process.env.UPLOAD_URL,
			expect.objectContaining({
				method: "POST",
				body: expect.any(MockFormData),
			})
		)

		// Verify the result
		expect(result.content[0]?.text).toBe("Upload successful")

		// Restore original FormData
		vi.unstubAllGlobals()
	})

	test("handles Buffer to Blob conversion for direct file paths", async () => {
		// Create a temporary test file  
		tempFilePath = path.join(__dirname, "test-direct.jpeg")
		const testImageBuffer = Buffer.from([
			0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
			0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xD9
		])
		fs.writeFileSync(tempFilePath, testImageBuffer)

		// Test the core logic: Buffer to Blob conversion
		const buffer = fs.readFileSync(tempFilePath)
		const blob = new Blob([buffer])
		
		// Verify the conversion works correctly
		expect(blob).toBeInstanceOf(Blob)
		expect(blob.size).toBe(buffer.length)
		expect(blob.type).toBe("") // Default type for unspecified

		// Read the blob back to verify data integrity
		const arrayBuffer = await blob.arrayBuffer()
		const resultBuffer = Buffer.from(arrayBuffer)
		expect(resultBuffer.equals(buffer)).toBe(true)
	})
})
