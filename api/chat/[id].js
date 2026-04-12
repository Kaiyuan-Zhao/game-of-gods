import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

let cachedPrompts = null

async function getPrompts() {
	if (cachedPrompts) {
		return cachedPrompts
	}

	const promptAPath = join(process.cwd(), 'Agent A.txt')
	const promptBPath = join(process.cwd(), 'Agent B.txt')

	const [a, b] = await Promise.all([readFile(promptAPath, 'utf8'), readFile(promptBPath, 'utf8')])
	cachedPrompts = { a, b }
	return cachedPrompts
}

function json(res, status, payload) {
	res.status(status).setHeader('content-type', 'application/json')
	res.send(JSON.stringify(payload))
}

function normalizeHistory(history) {
	if (!Array.isArray(history)) {
		return []
	}

	return history
		.filter((message) => message && (message.role === 'user' || message.role === 'model'))
		.map((message) => ({
			role: message.role,
			text: (message.text || '').toString().slice(0, 500)
		}))
}

async function callOpenAI(apiKey, systemPrompt, history, userMessage) {
	const messages = [
		{ role: 'system', content: systemPrompt },
		...history.map((message) => ({
			role: message.role === 'model' ? 'assistant' : message.role,
			content: message.text
		})),
		{ role: 'user', content: userMessage }
	]

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey}`
		},
		body: JSON.stringify({
			model: 'gpt-5.4',
			messages,
			temperature: 0.7
		})
	})

	const data = await response.json()
	if (!response.ok) {
		throw new Error(data?.error?.message || 'OpenAI request failed')
	}

	return data?.choices?.[0]?.message?.content?.trim() || '...'
}

export default async function handler(req, res) {
	if (req.method !== 'POST') {
		return json(res, 405, { error: 'Method not allowed' })
	}

	const chatId = req.query?.id
	if (chatId !== 'a' && chatId !== 'b') {
		return json(res, 404, { error: 'Not found' })
	}

	const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY
	if (!apiKey) {
		return json(res, 500, { error: 'Server missing OPENAI_API_KEY' })
	}

	try {
		const prompts = await getPrompts()
		const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
		const userMessage = (body.message || '').toString().trim()
		const history = normalizeHistory(body.history)

		if (!userMessage) {
			return json(res, 400, { error: 'Missing message' })
		}

		const systemPrompt = chatId === 'a' ? prompts.a : prompts.b
		const reply = await callOpenAI(apiKey, systemPrompt, history, userMessage)
		return json(res, 200, { reply })
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unexpected error'
		return json(res, 500, { error: message })
	}
}
