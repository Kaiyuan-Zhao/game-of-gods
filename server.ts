import { join } from 'path'

const publicDir = join(import.meta.dir, 'public')

function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '')
}

function injectJigsawPlaceholders(html: string): string {
	const apiOrigin = trimTrailingSlash((process.env.JIGSAW_API_ORIGIN || 'http://localhost:8787').trim())
	const arcadeUrl = trimTrailingSlash((process.env.JIGSAW_ARCADE_URL || 'http://localhost:5173/arcade').trim())
	return html.replaceAll('__JIGSAW_API_ORIGIN__', apiOrigin).replaceAll('__JIGSAW_ARCADE_URL__', arcadeUrl)
}

const promptAPath = join(import.meta.dir, 'Agent A.txt')
const promptBPath = join(import.meta.dir, 'Agent B.txt')

const promptA = await Bun.file(promptAPath).text()
const promptB = await Bun.file(promptBPath).text()

const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY
if (!apiKey) {
	console.warn('OPENAI_API_KEY (or API_KEY) is missing. Create a .env file from .env.example.')
}

const reasoningEffort = (process.env.OPENAI_REASONING_EFFORT || 'medium').trim()

const port = Number(process.env.PORT || 3000)

type Message = {
	role: 'user' | 'model'
	text: string
}

function jsonResponse(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json' }
	})
}

async function callOpenAI(systemPrompt: string, history: Message[], userMessage: string) {
	if (!apiKey) {
		throw new Error('Server missing OPENAI_API_KEY')
	}

	const messages = [
		{ role: 'system', content: systemPrompt },
		...history.map((message) => ({
			role: message.role === 'model' ? 'assistant' : message.role,
			content: message.text
		})),
		{ role: 'user', content: userMessage }
	]

	const openAIRequestBody = {
		model: 'gpt-5.4',
		messages: messages,
		reasoning_effort: reasoningEffort,
		temperature: 1
	}

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify(openAIRequestBody)
	})

	const data = await response.json()
	if (!response.ok) {
		const message = data?.error?.message || 'OpenAI request failed'
		throw new Error(message)
	}

	const text = data.choices?.[0]?.message?.content?.trim() || '...'
	return text
}

Bun.serve({
	port,
	async fetch(req) {
		const url = new URL(req.url)

		if (req.method === 'POST' && (url.pathname === '/api/chat/a' || url.pathname === '/api/chat/b')) {
			try {
				const body = await req.json()
				const userMessage = (body?.message || '').toString().trim()
				const history = Array.isArray(body?.history)
					? (body.history as Message[])
							.filter((m) => m && (m.role === 'user' || m.role === 'model'))
							.map((m) => ({ role: m.role, text: (m.text || '').toString().slice(0, 500) }))
					: []

				if (!userMessage) {
					return jsonResponse({ error: 'Missing message' }, 400)
				}

				const systemPrompt = url.pathname === '/api/chat/a' ? promptA : promptB
				const answer = await callOpenAI(systemPrompt, history, userMessage)
				return jsonResponse({ reply: answer })
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unexpected error'
				return jsonResponse({ error: message }, 500)
			}
		}

		const filePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
		if (filePath === 'index.html' || url.pathname === '/') {
			const indexPath = join(publicDir, 'index.html')
			const raw = await Bun.file(indexPath).text()
			const body = injectJigsawPlaceholders(raw)
			return new Response(body, {
				headers: { 'content-type': 'text/html; charset=utf-8' },
			})
		}

		const file = Bun.file(join(publicDir, filePath))
		if (await file.exists()) {
			return new Response(file)
		}

		return new Response('Not found', { status: 404 })
	}
})

console.log(`Game of Gods running on http://localhost:${port}`)
