// Xat: caixa per escriure, bombolla sobre l'avatar i historial dels últims missatges.
"use strict";

const chatBox = document.getElementById("chat"), chatInput = document.getElementById("chat-input");
function toggleChat(open = !state.chatting) {
  state.chatting = open;
  state.keys.clear();
  chatBox.classList.toggle("hidden", !open);
  if (open) { chatInput.maxLength = CFG.chat.maxLength; chatInput.value = ""; updateChatCount(); chatInput.focus(); }
  else chatInput.blur();
}
function updateChatCount() {
  document.getElementById("chat-count").textContent = `${chatInput.value.length}/${CFG.chat.maxLength}`;
}
function sendChat() {
  const text = chatInput.value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, CFG.chat.maxLength);
  if (text) {
    state.bubble = bubbleFor(text);
    net.send({ t: "say", text });
    logChat(state.look.name, text, true);
  }
  toggleChat(false);
}
// Historial curt dels últims missatges (per veure qui parla encara que sigui lluny)
const chatLog = document.getElementById("chat-log");
function logChat(name, text, mine) {
  const row = document.createElement("div");
  row.className = "msg" + (mine ? " mine" : "");
  const who = document.createElement("b");
  who.textContent = (name.trim() || "Jugador") + ": ";
  row.append(who, document.createTextNode(text));
  chatLog.appendChild(row);
  while (chatLog.children.length > 5) chatLog.firstChild.remove();
  setTimeout(() => row.classList.add("old"), 20000);
  setTimeout(() => row.remove(), 21000);
}

function bindChat() {
  chatBox.addEventListener("submit", (e) => { e.preventDefault(); sendChat(); });
  chatInput.addEventListener("input", updateChatCount);
  chatInput.addEventListener("keydown", (e) => { if (e.key === "Escape") toggleChat(false); });
  chatInput.addEventListener("blur", () => { if (state.chatting) setTimeout(() => state.chatting && toggleChat(false), 150); });
  document.getElementById("chat-btn").addEventListener("click", () => toggleChat(true));
}

