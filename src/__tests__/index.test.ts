import { describe, expect, test, beforeEach, beforeAll, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { vi } from "vitest"
// Disable CLI entrypoint when index.ts is imported during tests
process.env.SKIP_MCP_MAIN = "1"

// Mock undici at the top level
vi.mock('undici', async () => {
	const actual = await vi.importActual('undici')
	
	// Mock FormData class
	class MockFormData {
		private data: Map<string, any> = new Map()
		
		append(name: string, value: any, filename?: string) {
			this.data.set(name, value)
		}

		get(name: string) {
			return this.data.get(name)
		}
	}
	
	return {
		...actual,
		request: vi.fn(),
		FormData: MockFormData,
	}
})

// @ts-ignore -- path resolved by Vitest's TS loader
let uploadFileHandler: typeof import("../index.js").uploadFileHandler
let uploadSvgHandler: typeof import("../index.js").uploadSvgHandler

// Dynamically import the module after setting env vars
beforeAll(async () => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	const mod = await import("../index.js")
	uploadFileHandler = mod.uploadFileHandler
	uploadSvgHandler = mod.uploadSvgHandler
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

		// Mock the undici request
		const { request } = await import('undici')
		vi.mocked(request).mockResolvedValue({
			body: {
				text: () => Promise.resolve("Upload successful"),
			},
		} as any)

		const fileUri = `file://${tempFilePath}`
		const result = await uploadFileHandler({
			source: fileUri,
			fileName: "test-image.jpeg",
		})

		// Verify the upload was attempted
		expect(request).toHaveBeenCalledWith(
			process.env.UPLOAD_URL,
			expect.objectContaining({
				method: "POST",
				body: expect.any(Object),
			})
		)

		// Verify the result
		expect(result.content[0]?.text).toBe("Upload successful")

		// Clean up
		vi.clearAllMocks()
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

	test("converts SVG string to PNG and uploads successfully", async () => {
		// Simple SVG string for testing
		const svgString = `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
			<rect width="100" height="100" fill="red"/>
			<text x="50" y="50" text-anchor="middle" fill="white">Test</text>
		</svg>`

		// Mock the undici request
		const { request } = await import('undici')
		vi.mocked(request).mockResolvedValue({
			body: {
				text: () => Promise.resolve("SVG upload successful"),
			},
		} as any)

		const result = await uploadSvgHandler({
			svgString,
			fileName: "test-svg.svg",
			width: 200,
			height: 200,
		})

		// Verify the upload was attempted
		expect(request).toHaveBeenCalledWith(
			process.env.UPLOAD_URL,
			expect.objectContaining({
				method: "POST",
				body: expect.any(Object),
			})
		)

		// Verify the result
		expect(result.content[0]?.text).toBe("SVG upload successful")

		// Clean up
		vi.clearAllMocks()
	})

	test("handles SVG conversion errors gracefully", async () => {
		// Invalid SVG string
		const invalidSvg = "not-valid-svg"

		const result = await uploadSvgHandler({
			svgString: invalidSvg,
			fileName: "invalid.svg",
		})

		// Should return error response
		expect(result.content[0]?.text).toMatch(/Failed to convert SVG to PNG/)
	})

	test("generates PNG file from complex SVG for visual verification", async () => {
		// Complex SVG with gradients and transparency
		const complexSvgString = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 32 32" class="design-iconfont" width="128" height="128">
  <path fill-rule="evenodd" clip-rule="evenodd" d="M31.9086 6.71102C31.958 6.18599 31.5476 5.73101 31.0204 5.71848C30.3519 5.7026 29.6908 5.67954 29.0384 5.65678C23.9672 5.47989 19.4207 5.32131 16.0003 8.69214C12.5798 5.32131 8.03336 5.47989 2.96217 5.65678L2.96217 5.65678C2.30975 5.67954 1.64864 5.7026 0.980126 5.71848C0.452928 5.73101 0.0425842 6.18599 0.0919159 6.71102L1.45528 21.2213C1.66132 23.4141 3.75793 24.8434 5.93635 24.5188C9.75905 23.9493 12.6329 24.563 16.0003 28.3406C19.3676 24.563 22.2415 23.9493 26.0642 24.5188C28.2426 24.8434 30.3392 23.4141 30.5453 21.2213L31.9086 6.71102ZM16.0979 17.5004V20L17.8264 19.0455C21.9802 16.7519 25.9895 14.538 30 12.3241C29.9869 12.2937 29.9734 12.2636 29.9599 12.2335C29.9464 12.2035 29.9329 12.1734 29.9198 12.143C26.088 13.0035 22.2562 13.8641 18.2786 14.7573V12.0156C15.8748 12.8521 13.6081 13.6405 11.197 14.4784V12C11.0133 12.0612 10.8434 12.1207 10.6823 12.1771C10.3333 12.2994 10.0261 12.407 9.71064 12.4855C9.17387 12.6185 8.99155 12.9045 9.0003 13.4452C9.0211 14.7411 9.01768 16.0377 9.01426 17.3346C9.01265 17.947 9.01103 18.5595 9.01197 19.172C9.01197 19.316 9.02527 19.4599 9.04136 19.6341C9.05026 19.7305 9.06002 19.8361 9.06885 19.9561C9.77616 19.709 10.4742 19.4652 11.1692 19.2225C12.8031 18.6518 14.4196 18.0872 16.0979 17.5004Z" fill="#0DDBFF"></path>
  <path fill-rule="evenodd" clip-rule="evenodd" d="M3.83105 4.89515C3.83105 4.40104 4.23056 3.99771 4.72466 4.00199C9.84936 4.04632 12.4695 5.03339 16 8.5102C19.5305 5.03339 22.1506 4.04632 27.2753 4.00199C27.7694 3.99772 28.1689 4.40104 28.1689 4.89516V12.5362C24.9177 13.2664 21.6506 14.0001 18.2786 14.7573V12.0156C15.8748 12.8521 13.6081 13.6405 11.197 14.4784V12C11.0133 12.0612 10.8434 12.1207 10.6823 12.1771C10.3333 12.2994 10.0261 12.407 9.71064 12.4855C9.17387 12.6185 8.99155 12.9045 9.0003 13.4452C9.0211 14.7411 9.01768 16.0378 9.01426 17.3346C9.01265 17.947 9.01103 18.5595 9.01197 19.172C9.01197 19.316 9.02527 19.4599 9.04136 19.6341C9.05026 19.7305 9.06002 19.8361 9.06885 19.9561C9.77606 19.7091 10.4741 19.4653 11.1689 19.2226C12.8029 18.6519 14.4195 18.0873 16.0979 17.5004V20L17.8195 19.0494C21.3437 17.1034 24.7639 15.2148 28.1689 13.335V19.7889C28.1689 21.9439 26.2717 23.5132 24.1328 23.7757C21.2147 24.1339 19.0168 25.5359 16.0001 28.3411V28.3413L16 28.3412L15.9999 28.3413V28.3411C12.9832 25.5359 10.7853 24.1339 7.86722 23.7757C5.7283 23.5132 3.83105 21.9439 3.83105 19.7889V4.89515Z" fill="#0C5EFF"></path>
</svg>`

		// Test different sizes to verify scaling
		const sizes = [
			{ width: 64, height: 64, suffix: "64x64" },
			{ width: 128, height: 128, suffix: "128x128" },
			{ width: 256, height: 256, suffix: "256x256" },
		]

		for (const size of sizes) {
			// Import the utility function directly to test PNG generation
			const { convertSvgToPng } = await import("../utils.js")
			
			const pngBuffer = await convertSvgToPng(complexSvgString, size.width, size.height)
			
			// Save the generated PNG file for visual inspection
			const outputPath = path.join(__dirname, `test-output-${size.suffix}.png`)
			fs.writeFileSync(outputPath, pngBuffer)
			
			// Verify the buffer is not empty and looks like PNG data
			expect(pngBuffer.length).toBeGreaterThan(0)
			// PNG files start with specific magic bytes
			expect(pngBuffer.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
			
			console.log(`Generated PNG: ${outputPath} (${pngBuffer.length} bytes, ${size.width}x${size.height})`)
			
			// Clean up after test
			tempFilePath = outputPath
		}
	})
})
