import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { FormData, request } from "undici"
import { z } from "zod"

const server = new McpServer({
	name: "apifox",
	version: "0.0.1",
})

server.tool(
	"upload-file",
	"upload file by url",
	{
		url: z.string().describe("url"),
		fileName: z.string().describe("filename"),
	},
	async ({ url, fileName }) => {
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

		// Fetch the file from url
		const response = await request(url)
		const blob = Buffer.from(await response.body.arrayBuffer())

		// Prepare form data
		const form = new FormData()
		form.append(process.env.FILE_KEY, new Blob([blob]), fileName)
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
