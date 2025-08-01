#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { FormData, request } from "undici"
import { z } from "zod"
import fs from "node:fs"

const server = new McpServer({
	name: "upload-file",
	version: "1.0.6",
})

server.tool(
	"upload-file",
	"upload file from a url or local file path",
	{
		source: z.string().describe("url or local file path"),
		fileName: z.string().describe("The file name (must be in English)"),
	},
	async ({ source, fileName }) => {
		if (
			!process.env.UPLOAD_URL ||
			!process.env.FILE_KEY ||
			!process.env.FILE_NAME
		) {
			return {
				content: [
					{
						type: "text",
						text: "Missing required environment variables: UPLOAD_URL, FILE_KEY, FILE_NAME",
					},
				],
			}
		}

		let blob: Buffer

		if (source.startsWith("http://") || source.startsWith("https://")) {
			// Fetch the file from url
			const response = await request(source)
			blob = Buffer.from(await response.body.arrayBuffer())
		} else {
			// Read from local file path
			if (!fs.existsSync(source)) {
				return {
					content: [
						{
							type: "text",
							text: `File not found at path: ${source}`,
						},
					],
				}
			}
			blob = fs.readFileSync(source)
		}

		// Prepare form data
		const form = new FormData()
		form.append(process.env.FILE_KEY, blob, fileName)
		form.append(process.env.FILE_NAME, fileName)

		// Parse and add extra form fields if provided
		if (process.env.EXTRA_FORM) {
			try {
				const extraForm = JSON.parse(process.env.EXTRA_FORM)
				for (const [key, value] of Object.entries(extraForm)) {
					if (typeof value === "string") {
						form.append(key, value)
					} else {
						form.append(key, JSON.stringify(value))
					}
				}
			} catch (error) {
				console.error("Failed to parse extra form fields:", error)
			}
		}

		// Upload the file
		const uploadResponse = await request(process.env.UPLOAD_URL, {
			method: "POST",
			body: form,
		})

		const text = await uploadResponse.body.text()
		return {
			content: [
				{
					type: "text",
					text,
				},
			],
		}
	},
)

async function main() {
	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error("Upload file MCP Server running on stdio")
}

main().catch((error) => {
	console.error("Fatal error in main():", error)
	process.exit(1)
})
