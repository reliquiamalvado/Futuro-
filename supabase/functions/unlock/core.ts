// Núcleo WebAuthn (digital / rosto) do AuggeControl, independente do banco.
// A verificação criptográfica é feita pela biblioteca @simplewebauthn/server.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";

export const RP_NAME = "AuggeControl";

export interface StoredCredential { id: string; public_key: string; counter: number; transports: string[] | null }

/** Onde o núcleo guarda desafios e credenciais (no app real: tabelas do Supabase). */
export interface Store {
  credentials(userId: string): Promise<StoredCredential[]>;
  saveChallenge(userId: string, kind: "registro" | "abertura", challenge: string): Promise<void>;
  /** Devolve e apaga o desafio, se ainda válido. */
  takeChallenge(userId: string, kind: "registro" | "abertura"): Promise<string | null>;
  saveCredential(userId: string, c: StoredCredential, deviceName: string | null): Promise<void>;
  updateCounter(credentialId: string, counter: number): Promise<void>;
}

export interface Rp { rpID: string; origin: string }

/** Aceita só origens conhecidas do app; o rpID é o domínio do site. */
export function rpFromOrigin(origin: string | null, allowed: string[]): Rp | null {
  if (!origin || !allowed.includes(origin)) return null;
  return { rpID: new URL(origin).hostname, origin };
}

export async function registrationOptions(store: Store, user: { id: string; email: string; name: string }, rp: Rp) {
  const existing = await store.credentials(user.id);
  const opts = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports ?? undefined })),
    // Biometria do próprio aparelho (Face ID, digital), sempre com verificação do usuário.
    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
    timeout: 60_000,
  });
  await store.saveChallenge(user.id, "registro", opts.challenge);
  return opts;
}

export async function verifyRegistration(
  store: Store, userId: string, response: unknown, rp: Rp, deviceName: string | null,
): Promise<boolean> {
  const challenge = await store.takeChallenge(userId, "registro");
  if (!challenge) return false;
  const r = await verifyRegistrationResponse({
    // deno-lint-ignore no-explicit-any
    response: response as any,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    requireUserVerification: true,
  });
  if (!r.verified || !r.registrationInfo.userVerified) return false;
  const c = r.registrationInfo.credential;
  await store.saveCredential(userId, {
    id: c.id,
    public_key: isoBase64URL.fromBuffer(c.publicKey),
    counter: c.counter,
    transports: c.transports ?? null,
  }, deviceName);
  return true;
}

export async function authenticationOptions(store: Store, userId: string, rp: Rp) {
  const creds = await store.credentials(userId);
  if (!creds.length) return null;
  const opts = await generateAuthenticationOptions({
    rpID: rp.rpID,
    allowCredentials: creds.map((c) => ({ id: c.id, transports: c.transports ?? undefined })),
    userVerification: "required",
    timeout: 60_000,
  });
  await store.saveChallenge(userId, "abertura", opts.challenge);
  return opts;
}

export async function verifyAuthentication(store: Store, userId: string, response: unknown, rp: Rp): Promise<boolean> {
  const challenge = await store.takeChallenge(userId, "abertura");
  if (!challenge) return false;
  const credId = (response as { id?: string })?.id;
  const cred = (await store.credentials(userId)).find((c) => c.id === credId);
  if (!cred) return false;
  const r = await verifyAuthenticationResponse({
    // deno-lint-ignore no-explicit-any
    response: response as any,
    expectedChallenge: challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.rpID,
    credential: {
      id: cred.id,
      publicKey: isoBase64URL.toBuffer(cred.public_key),
      counter: Number(cred.counter),
      transports: cred.transports ?? undefined,
    },
    requireUserVerification: true,
  });
  if (!r.verified || !r.authenticationInfo.userVerified) return false;
  await store.updateCounter(cred.id, r.authenticationInfo.newCounter);
  return true;
}
