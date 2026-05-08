// WhatsApp channel adapter. Thin wrapper around whatsapp-web.js exposing the
// surface the agent core needs (sendMessage, notifyStaff, getChat, history).
// New channels (Instagram DM, SMS, web chat) implement the same shape so the
// agent core stays channel-agnostic.

// Convert a list of whatsapp-web.js Message objects into the {role, content}
// shape Anthropic's Messages API expects. Filters out status updates,
// revoked messages, and our own !bot/!human commands.
export function formatWhatsappMessagesForHistory(recentMsgs) {
  return (recentMsgs ?? [])
    .filter((m) => {
      const body = m?.body?.trim();
      if (!body) return false;
      if (m.isStatus) return false;
      if (m.type === "revoked" || m.type === "revoked_ack") return false;
      if (/^!(bot|human)\b/i.test(body)) return false;
      return true;
    })
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    .map((m) => ({ role: m.fromMe ? "assistant" : "user", content: m.body }));
}

export function createWhatsAppChannel({ client, getStaffGroup }) {
  async function fetchHistoryFromChat(chat, limit = 20) {
    const recent = await chat.fetchMessages({ limit });
    return formatWhatsappMessagesForHistory(recent);
  }

  async function fetchHistoryByChatId(chatId, limit = 20) {
    const chat = await client.getChatById(chatId);
    return fetchHistoryFromChat(chat, limit);
  }

  return {
    name: "whatsapp",
    client,

    async sendMessage(to, text) {
      return client.sendMessage(to, text);
    },

    async notifyStaff(text) {
      const staffGroup = getStaffGroup();
      if (!staffGroup) return;
      try {
        await client.sendMessage(staffGroup, text);
      } catch (err) {
        console.error("Channel notifyStaff failed:", err?.message ?? err);
      }
    },

    async getChat(id) {
      return client.getChatById(id);
    },

    async getChatHistory(id, limit = 20) {
      return fetchHistoryByChatId(id, limit);
    },

    async getChatHistoryFromChat(chat, limit = 20) {
      return fetchHistoryFromChat(chat, limit);
    },

    async listChats() {
      return client.getChats();
    },

    async resolveContact(jid) {
      try {
        const contact = await client.getContactById(jid);
        return {
          number: contact?.number ?? null,
          name: contact?.pushname ?? contact?.name ?? null,
        };
      } catch {
        return { number: null, name: null };
      }
    },
  };
}
