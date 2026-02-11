// ══════════════════════════════════════════════════════════════
// SIGNALING — WebRTC signaling via Nostr ephemeral events
// ══════════════════════════════════════════════════════════════
import { SIGNALING_KIND, PRESENCE_INTERVAL, DEVICE_ID } from "../constants.js";
import { publishEphemeral, subscribeEphemeral } from "./sync.js";

// ── Send functions ──

export async function sendOffer(encKey, targetDeviceId, offer, relays) {
  await publishEphemeral(SIGNALING_KIND, encKey, {
    type: "offer", from: DEVICE_ID, to: targetDeviceId,
    sdp: offer.sdp, ts: Date.now(),
  }, relays);
}

export async function sendAnswer(encKey, targetDeviceId, answer, relays) {
  await publishEphemeral(SIGNALING_KIND, encKey, {
    type: "answer", from: DEVICE_ID, to: targetDeviceId,
    sdp: answer.sdp, ts: Date.now(),
  }, relays);
}

export async function sendIceCandidate(encKey, targetDeviceId, candidate, relays) {
  await publishEphemeral(SIGNALING_KIND, encKey, {
    type: "ice", from: DEVICE_ID, to: targetDeviceId,
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    ts: Date.now(),
  }, relays);
}

export async function sendHeartbeat(encKey, sharedTankIds, relays) {
  await publishEphemeral(SIGNALING_KIND, encKey, {
    type: "heartbeat", from: DEVICE_ID,
    tanks: sharedTankIds, ts: Date.now(),
  }, relays);
}

// ── Subscribe ──

export async function subscribeSignaling(encKey, handlers, relays) {
  return subscribeEphemeral(SIGNALING_KIND, encKey, (msg) => {
    if (msg.from === DEVICE_ID) return;
    switch (msg.type) {
      case "offer":
        if (msg.to === DEVICE_ID) handlers.onOffer?.(msg.from, { type: "offer", sdp: msg.sdp });
        break;
      case "answer":
        if (msg.to === DEVICE_ID) handlers.onAnswer?.(msg.from, { type: "answer", sdp: msg.sdp });
        break;
      case "ice":
        if (msg.to === DEVICE_ID) handlers.onIce?.(msg.from, {
          candidate: msg.candidate, sdpMid: msg.sdpMid, sdpMLineIndex: msg.sdpMLineIndex,
        });
        break;
      case "heartbeat":
        handlers.onHeartbeat?.(msg.from, msg.tanks, msg.ts);
        break;
    }
  }, relays);
}

// ── Heartbeat interval ──

export function startHeartbeatInterval(encKey, getTankIds, relays) {
  const send = () => {
    const ids = getTankIds();
    if (ids.length) sendHeartbeat(encKey, ids, relays).catch(() => {});
  };
  send();
  return setInterval(send, PRESENCE_INTERVAL);
}
