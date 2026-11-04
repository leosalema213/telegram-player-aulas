const chunkSize = 512 * 1024;

async function connect({ apiId, apiHash }, savedSession) {
  const { Api, TelegramClient } = require('teleproto');
  const { StringSession } = require('teleproto/sessions');
  const client = new TelegramClient(new StringSession(savedSession), apiId, apiHash, {
    connectionRetries: 2,
    requestRetries: 2,
    floodSleepThreshold: 0,
  });
  await client.connect();
  let challenge;
  let viaEmail;
  const channels = new Map();

  return {
    authorized: () => client.checkAuthorization(),
    account: async () => String((await client.getMe()).id),
    session: () => client.session.save(),
    destroy: () => client.destroy(),
    logout: () => client.invoke(new Api.auth.LogOut()),
    async sendCode(phone) {
      const { phoneCodeHash, emailRequired, emailCodeSent, emailOptions } = await client.sendCode({ apiId, apiHash }, phone);
      if (emailRequired) throw new Error('O Telegram pediu a configuração de um e-mail. Conclua essa etapa no app oficial e tente novamente.');
      if (!phoneCodeHash) throw new Error('O Telegram não retornou um código de acesso.');
      challenge = { phoneNumber: phone, phoneCodeHash };
      viaEmail = emailCodeSent;
      return emailCodeSent ? { email: emailOptions?.emailPattern || true } : {};
    },
    async signIn(code) {
      if (!challenge) throw new Error('Solicite um código primeiro.');
      try {
        const verification = viaEmail ? { emailVerification: new Api.EmailVerificationCode({ code }) } : { phoneCode: code };
        const result = await client.invoke(new Api.auth.SignIn({ ...challenge, ...verification }));
        if (!(result instanceof Api.auth.Authorization)) throw new Error('Use uma conta existente.');
        challenge = undefined;
        return 'connected';
      } catch (error) {
        if (error.errorMessage === 'SESSION_PASSWORD_NEEDED') return 'password';
        throw error;
      }
    },
    async password(password) {
      await client.signInWithPassword({ apiId, apiHash }, {
        password: async () => password,
        onError: async error => { throw error; },
      });
      challenge = undefined;
    },
    async listChannels() {
      const result = [];
      for await (const dialog of client.iterDialogs({})) {
        if (!(dialog.entity instanceof Api.Channel) || !dialog.entity.broadcast) continue;
        const id = String(dialog.id);
        channels.set(id, dialog.inputEntity);
        result.push({ id, title: dialog.title });
      }
      return result;
    },
    async lessons(id) {
      const peer = channels.get(id);
      if (!peer) throw new Error('Atualize a lista de canais e tente novamente.');
      const lessons = [];
      for await (const message of client.iterMessages(peer, { filter: new Api.InputMessagesFilterVideo() })) {
        const document = message.video;
        const video = document?.attributes.find(attribute => attribute instanceof Api.DocumentAttributeVideo);
        if (!video || video.roundMessage || message.ttlPeriod || !Number.isFinite(video.duration)) continue;
        const lines = (message.message || '').split('\n').map(line => line.trim()).filter(Boolean);
        const chapter = lines.find(line => /cap[ií]tulo\s*\d/i.test(line));
        lessons.push({
          id: message.id,
          title: lines.find(line => line !== chapter) || `Aula ${message.id}`,
          chapter: chapter || 'Aulas',
          duration: video.duration,
        });
      }
      return lessons.reverse();
    },
    async documents(id) {
      const peer = channels.get(id);
      if (!peer) throw new Error('Atualize a lista de canais e tente novamente.');
      const documents = [];
      for await (const message of client.iterMessages(peer, { filter: new Api.InputMessagesFilterDocument() })) {
        const document = message.document;
        if (!document || message.video || message.ttlPeriod) continue;
        const filename = document.attributes.find(attribute => attribute instanceof Api.DocumentAttributeFilename)?.fileName;
        if (!filename) continue;
        const size = Number(document.size.toString());
        if (!Number.isSafeInteger(size) || size < 0) continue;
        documents.push({ id: message.id, name: filename, size });
      }
      return documents.reverse();
    },
    async document(channelId, messageId) {
      if (!channels.has(channelId)) await this.listChannels();
      const peer = channels.get(channelId);
      if (!peer) throw new Error('Canal indisponível. Atualize o curso e tente novamente.');
      const [message] = await client.getMessages(peer, { ids: [messageId] });
      const document = message?.document;
      if (!document || message.video || message.ttlPeriod || !document.attributes.some(attribute => attribute instanceof Api.DocumentAttributeFilename)) throw new Error('Documento indisponível. Atualize o curso e tente novamente.');
      const size = Number(document.size.toString());
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('Tamanho do documento inválido.');
      return { size, chunks: () => size ? exactBytes(client.iterDownload(message, { requestSize: chunkSize }), size) : [] };
    },
    async video(channelId, lessonId) {
      if (!channels.has(channelId)) await this.listChannels();
      const peer = channels.get(channelId);
      if (!peer) return null;
      const [message] = await client.getMessages(peer, { ids: [lessonId] });
      const document = message?.video;
      if (!document || message.ttlPeriod) return null;
      return {
        type: document.mimeType,
        size: document.size.toJSNumber(),
        chunks(start, end, signal) {
          const iterator = client.iterDownload(message, {
            offset: start,
            requestSize: chunkSize,
            limit: end - start + 1,
            signal,
          });
          return exactBytes(iterator, end - start + 1);
        },
      };
    },
  };
}

async function* exactBytes(iterator, remaining) {
  for await (const chunk of iterator) {
    const bytes = chunk.subarray(0, remaining);
    yield bytes;
    remaining -= bytes.length;
    if (!remaining) return;
  }
  if (remaining) throw new Error('O vídeo foi interrompido.');
}

module.exports = { connect };
