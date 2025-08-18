#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { FormData, request } from "undici"
import { z } from "zod"
import { createRequire } from "node:module"
import {
	validateEnvironmentVariables,
	getFileBuffer,
	convertBufferToBlob,
	parseExtraFormFields,
	createErrorResponse,
	createSuccessResponse,
	convertSvgToPng,
} from "./utils.js"

const require = createRequire(import.meta.url)
const { version: pkgVersion } = require("../package.json") as { version: string }

const server = new McpServer({
	name: "upload-file",
	version: pkgVersion,
})

async function uploadFileHandler({ source, fileName }: { source: string; fileName: string }) {
	const envError = validateEnvironmentVariables()
	if (envError) {
		return createErrorResponse(envError)
	}

	const fileResult = await getFileBuffer(source)
	if (!fileResult.success) {
		return createErrorResponse(fileResult.error)
	}

	const form = new FormData()
	const fileBlob = convertBufferToBlob(fileResult.buffer)
	form.append(process.env.FILE_KEY!, fileBlob, fileName)
	form.append(process.env.FILE_NAME!, fileName)

	const extraFields = parseExtraFormFields(process.env.EXTRA_FORM)
	for (const [key, value] of Object.entries(extraFields)) {
		form.append(key, value)
	}

	const uploadResponse = await request(process.env.UPLOAD_URL!, {
		method: "POST",
		body: form,
	})

	const text = await uploadResponse.body.text()
	return createSuccessResponse(text)
}

server.tool(
	"upload-file",
	"upload file from a url or local file path",
	{
		source: z.string().describe("url or local file path"),
		fileName: z.string().describe("The file name (must be in English)"),
	},
	uploadFileHandler as any,
)

async function uploadSvgHandler({ svgString, fileName, width, height }: { 
	svgString: string; 
	fileName: string; 
	width?: number; 
	height?: number; 
}) {
	const envError = validateEnvironmentVariables()
	if (envError) {
		return createErrorResponse(envError)
	}

	try {
		const pngBuffer = convertSvgToPng(svgString, width, height)
		
		const form = new FormData()
		const fileBlob = convertBufferToBlob(pngBuffer)
		const pngFileName = fileName.replace(/\.svg$/i, '.png')
		
		form.append(process.env.FILE_KEY!, fileBlob, pngFileName)
		form.append(process.env.FILE_NAME!, pngFileName)

		const extraFields = parseExtraFormFields(process.env.EXTRA_FORM)
		for (const [key, value] of Object.entries(extraFields)) {
			form.append(key, value)
		}

		const uploadResponse = await request(process.env.UPLOAD_URL!, {
			method: "POST",
			body: form,
		})

		const text = await uploadResponse.body.text()
		return createSuccessResponse(text)
	} catch (error) {
		return createErrorResponse(`Failed to convert SVG to PNG: ${error}`)
	}
}

server.tool(
	"upload-svg",
	"convert SVG string to PNG and upload",
	{
		svgString: z.string().describe("SVG content as string"),
		fileName: z.string().describe("The file name (must be in English, .png extension will be added automatically)"),
		width: z.number().optional().describe("Optional width for PNG output"),
		height: z.number().optional().describe("Optional height for PNG output"),
	},
	uploadSvgHandler as any,
)

async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error("Upload file MCP Server running on stdio")
}

// Only run main when not in a test environment
if (!process.env.SKIP_MCP_MAIN) {
	main().catch((error) => {
		console.error("Fatal error in main():", error)
		process.exit(1)
	})
}

export { server, uploadFileHandler, uploadSvgHandler }
