import { expect, it } from "vitest"
import { CLIENT_VOICE_PRIVACY_GATE, clientVoiceCaptureSnapshot } from "./cliente"
import { reduceVoiceCapture, VOICE_CAPTURE_INITIAL } from "./session"

it("client gate overrides browser capability and refuses start, with no temporary transcript", () => {
  const state = clientVoiceCaptureSnapshot()
  expect(state).toMatchObject({ status: "unavailable", sessionTranscript: "", interim: "" })
  expect(reduceVoiceCapture(state, { type: "start" }).status).toBe("unavailable")
})
it("cannot be enabled by mutating the exported runtime gate", () => {
  expect(Object.isFrozen(CLIENT_VOICE_PRIVACY_GATE)).toBe(true)
  expect(Reflect.set(CLIENT_VOICE_PRIVACY_GATE, "enabled", true)).toBe(false)
  expect(Reflect.set(CLIENT_VOICE_PRIVACY_GATE, "message", "enabled")).toBe(false)
  expect(CLIENT_VOICE_PRIVACY_GATE.enabled).toBe(false)
  expect(clientVoiceCaptureSnapshot()).toMatchObject({ status: "unavailable", sessionTranscript: "", interim: "" })
})
it("shared voice capture handles no-speech and denied permission without inventing transcription", () => {
  const started = reduceVoiceCapture(VOICE_CAPTURE_INITIAL, { type: "start" })
  expect(reduceVoiceCapture(started, { type: "error", code: "not-allowed" })).toMatchObject({ status: "permission-denied", sessionTranscript: "" })
  expect(reduceVoiceCapture(started, { type: "error", code: "no-speech" })).toMatchObject({ status: "error", sessionTranscript: "" })
})
