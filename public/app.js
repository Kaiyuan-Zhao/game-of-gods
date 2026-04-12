const chats = {
	a: {
		form: document.querySelector('#form-a'),
		input: document.querySelector('#input-a'),
		messages: document.querySelector('#messages-a'),
		history: []
	},
	b: {
		form: document.querySelector('#form-b'),
		input: document.querySelector('#input-b'),
		messages: document.querySelector('#messages-b'),
		history: []
	}
}

function addSystem(chatId, text) {
	const element = document.createElement('p')
	element.className = 'system'
	element.textContent = text
	chats[chatId].messages.appendChild(element)
}

function addBubble(chatId, role, text) {
	const element = document.createElement('div')
	element.className = `bubble ${role}`
	element.textContent = text
	chats[chatId].messages.appendChild(element)
	chats[chatId].messages.scrollTop = chats[chatId].messages.scrollHeight
}

async function sendMessage(chatId, userMessage) {
	const chat = chats[chatId]
	chat.input.disabled = true
	chat.form.querySelector('button').disabled = true

	addBubble(chatId, 'user', userMessage)

	try {
		const response = await fetch(`/api/chat/${chatId}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				message: userMessage,
				history: chat.history
			})
		})

		const textResponse = await response.text()
		let data
		try {
			data = JSON.parse(textResponse)
		} catch (e) {
			throw new Error(response.ok ? 'Invalid JSON response from server' : `Server Error: ${response.status} - ${textResponse.slice(0, 40)}...`)
		}

		if (!response.ok) {
			throw new Error(data?.error || 'Request failed')
		}

		const reply = (data?.reply || '...').toString().trim() || '...'
		addBubble(chatId, 'model', reply)
		chat.history.push({ role: 'user', text: userMessage })
		chat.history.push({ role: 'model', text: reply })

		if (reply.toLowerCase().includes('win')) {
			const winControls = document.querySelector('.win-controls')
			winControls.classList.add('visible')
			chat.messages.appendChild(winControls)
			chat.messages.scrollTop = chat.messages.scrollHeight
		}
	} catch (error) {
		addSystem(chatId, error instanceof Error ? error.message : 'Something went wrong')
	} finally {
		chat.input.disabled = false
		chat.form.querySelector('button').disabled = false
		chat.input.focus()
	}
}

for (const chatId of ['a', 'b']) {
	const chat = chats[chatId]
	addSystem(chatId, 'Ask a yes/no question about the game.')
	chat.form.addEventListener('submit', (event) => {
		event.preventDefault()
		const text = chat.input.value.trim()
		if (!text) {
			return
		}
		chat.input.value = ''
		sendMessage(chatId, text)
	})
}
