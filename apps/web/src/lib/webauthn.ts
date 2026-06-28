import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  ApiError,
  apiPost,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type VerifyResult,
} from "./api";
import { WebAuthnUIError } from "./errors";
import { webauthnErrorKey } from "./webauthn-errors";

function rethrow(err: unknown, ceremony: "registration" | "authentication"): never {
  if (err instanceof ApiError) throw err;
  throw new WebAuthnUIError(webauthnErrorKey(err, ceremony));
}

export async function registerPasskey(email?: string): Promise<void> {
  try {
    const forSignedInAccount = email === undefined;
    const optionsPath = forSignedInAccount
      ? "/account/passkeys/options"
      : "/webauthn/register/options";
    const optionsBody = forSignedInAccount ? {} : { email };
    const optionsJSON = await apiPost<PublicKeyCredentialCreationOptionsJSON>(
      optionsPath,
      optionsBody,
    );
    const response = await startRegistration({ optionsJSON });
    await apiPost<VerifyResult>("/webauthn/register/verify", { response });
  } catch (err) {
    rethrow(err, "registration");
  }
}

export async function authenticatePasskey(
  interactionId?: string,
  useBrowserAutofill = false,
): Promise<VerifyResult> {
  try {
    const optionsJSON = await apiPost<PublicKeyCredentialRequestOptionsJSON>(
      "/webauthn/login/options",
      {},
    );
    const response = await startAuthentication({ optionsJSON, useBrowserAutofill });
    const verifyBody = interactionId === undefined ? { response } : { response, interactionId };
    return await apiPost<VerifyResult>("/webauthn/login/verify", verifyBody);
  } catch (err) {
    rethrow(err, "authentication");
  }
}
