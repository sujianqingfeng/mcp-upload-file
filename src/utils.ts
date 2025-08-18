import { request } from "undici"
import fs from "node:fs"
import { Resvg } from "@resvg/resvg-js"

export interface FileSource {
	buffer: Buffer
	resolvedPath?: string
}

export function validateEnvironmentVariables(): string | null {
	if (
		!process.env.UPLOAD_URL ||
		!process.env.FILE_KEY ||
		!process.env.FILE_NAME
	) {
		return "Missing required environment variables: UPLOAD_URL, FILE_KEY, FILE_NAME"
	}
	return null
}

export function isHttpUrl(source: string): boolean {
	return source.startsWith("http://") || source.startsWith("https://")
}

export function parseFileUri(source: string): string {
	if (!source.startsWith("file://")) {
		return source
	}

	try {
		return decodeURIComponent(new URL(source).pathname)
	} catch {
		return source.replace(/^file:\/\//, "")
	}
}

export async function fetchFileFromUrl(url: string): Promise<Buffer> {
	const response = await request(url)
	return Buffer.from(await response.body.arrayBuffer())
}

export function readLocalFile(filePath: string): { success: true; buffer: Buffer } | { success: false; error: string } {
	if (!fs.existsSync(filePath)) {
		return { success: false, error: `File not found at path: ${filePath}` }
	}
	
	const buffer = fs.readFileSync(filePath)
	return { success: true, buffer }
}

export async function getFileBuffer(source: string): Promise<{ success: true; buffer: Buffer } | { success: false; error: string }> {
	if (isHttpUrl(source)) {
		try {
			const buffer = await fetchFileFromUrl(source)
			return { success: true, buffer }
		} catch (error) {
			return { success: false, error: `Failed to fetch file from URL: ${error}` }
		}
	} else {
		const filePath = parseFileUri(source)
		return readLocalFile(filePath)
	}
}

export function convertBufferToBlob(buffer: Buffer): Blob {
	return new Blob([new Uint8Array(buffer)])
}

export function parseExtraFormFields(extraFormJson: string | undefined): Record<string, string> {
	if (!extraFormJson) {
		return {}
	}

	try {
		const extraForm = JSON.parse(extraFormJson)
		const result: Record<string, string> = {}
		
		for (const [key, value] of Object.entries(extraForm)) {
			if (typeof value === "string") {
				result[key] = value
			} else {
				result[key] = JSON.stringify(value)
			}
		}
		
		return result
	} catch (error) {
		console.error("Failed to parse extra form fields:", error)
		return {}
	}
}

export function createErrorResponse(message: string) {
	return {
		content: [
			{
				type: "text" as const,
				text: message,
			},
		],
	}
}

export function createSuccessResponse(text: string) {
	return {
		content: [
			{
				type: "text" as const,
				text,
			},
		],
	}
}

export function convertSvgToPng(svgString: string, width?: number, height?: number): Buffer {
	const resvg = new Resvg(svgString, {
		fitTo: width && height ? {
			mode: "width",
			value: width
		} : undefined,
	})

	const pngData = resvg.render()
	return Buffer.from(pngData.asPng())
}