// Criptografia simétrica (AES-256-GCM) para as senhas dos sistemas cadastrados
// no Gestor de Sistemas.
//
// A chave vem preferencialmente da variável de ambiente SYSTEMS_ENC_KEY (é
// assim que funciona em produção/Vercel, onde o disco é somente leitura e
// não sobrevive entre deploys/instâncias). Em desenvolvimento local, se essa
// variável não estiver definida, cai para uma chave gerada uma única vez e
// guardada em disco (fora do git), só por conveniência.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function keyFromEnv() {
  const raw = process.env.SYSTEMS_ENC_KEY;
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(
      'A variável de ambiente SYSTEMS_ENC_KEY precisa ter 64 caracteres hexadecimais (32 bytes). ' +
        'Gere uma nova com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(trimmed, 'hex');
}

function keyFromLocalFile() {
  // Fallback só para desenvolvimento local. Em produção (Vercel) o disco é
  // somente leitura e não persiste entre instâncias/deploys, por isso ali a
  // chave sempre precisa vir de SYSTEMS_ENC_KEY.
  const DATA_DIR = path.join(__dirname, '..', 'data');
  const KEY_PATH = path.join(DATA_DIR, '.secret_key');
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(KEY_PATH)) {
      return Buffer.from(fs.readFileSync(KEY_PATH, 'utf8').trim(), 'hex');
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_PATH, key.toString('hex'), { mode: 0o600 });
    return key;
  } catch (e) {
    throw new Error(
      `Não foi possível gerar/ler a chave de criptografia local (${e.message}). ` +
        'Defina a variável de ambiente SYSTEMS_ENC_KEY (veja .env.example) — é obrigatório em produção.'
    );
  }
}

const KEY = keyFromEnv() || keyFromLocalFile();
const IV_LENGTH = 12; // recomendado para GCM

function encrypt(plainText) {
  if (!plainText) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(payload) {
  if (!payload) return '';
  try {
    const [ivHex, tagHex, dataHex] = payload.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return '';
  }
}

module.exports = { encrypt, decrypt };
