async function drawAPBubble(token) {
  if (!token?.document?.actor) return;

  // Remove any existing bubble
  if (token.apBubble) {
    token.apBubble.destroy();
    token.apBubble = null;
  }

  const current = token.document.getFlag("ap-tracker", "currentAP") ?? null;
  const spent = token.document.getFlag("ap-tracker", "spentAP") ?? null;

  if (current === null) return; // Don't display if AP isn't set

  const remaining = spent !== null ? current - spent : current;

  // Optional color shift based on AP remaining
  let fillColor = "#ffd700"; // gold
  if (remaining <= current * 0.25) fillColor = "#ff5555"; // red if low

  const text = `⚡ ${remaining}/${current}`;

  const style = new PIXI.TextStyle({
    fontFamily: "Arial Black",
    fontSize: 16,
    fontWeight: "bold",
    fill: fillColor,
    stroke: "#000000",
    strokeThickness: 4,
    dropShadow: true,
    dropShadowColor: "#000000",
    dropShadowBlur: 4,
    dropShadowDistance: 1
  });

  const bubble = new PIXI.Text(text, style);
  bubble.anchor.set(1, 0.5); // right center
  bubble.position.set(token.w, token.h / 2); // right side

  token.apBubble = bubble;
  token.addChild(bubble);
}

Hooks.on("canvasReady", () => {
  for (const token of canvas.tokens.placeables) {
    drawAPBubble(token);
  }
});

Hooks.on("updateToken", (tokenDoc) => {
  const token = canvas.tokens.get(tokenDoc.id);
  if (token) drawAPBubble(token);
});

Hooks.on("controlToken", (token) => {
  drawAPBubble(token);
});

Hooks.on("updateCombat", async (combat, updateData) => {
  if (!("turn" in updateData)) return;

  const prevId = combat.previous?.tokenId;
  const prevCombatant = combat.combatants.find(c => c.tokenId === prevId);
  const token = canvas.tokens.get(prevId);
  if (!prevCombatant || !token) return;

  // Grab AP from message (if you allow manual override, we try to parse it)
  const msgId = await prevCombatant.getFlag("ap-tracker", "chatMessageId");
  let apSpent = 0;
  if (msgId) {
    const msg = game.messages.get(msgId);
    const match = msg?.content?.match(/costing\s+(\d+)\s+AP/i);
    if (match) apSpent = parseInt(match[1]);
  }

  await token.document.setFlag("ap-tracker", "spentAP", apSpent);

  // Clean up flags (already part of your system)
  await prevCombatant.unsetFlag("ap-tracker", "chatMessageId");
  await prevCombatant.unsetFlag("ap-tracker", "initialPosition");
  await prevCombatant.unsetFlag("ap-tracker", "moveHistory");
});


Hooks.on("updateCombatant", async (combatant, updateData) => {
  if (!("initiative" in updateData)) return;

  const token = canvas.tokens.get(combatant.tokenId);
  if (!token) return;

  const initiative = updateData.initiative;
  await token.document.setFlag("ap-tracker", "currentAP", initiative);
  await token.document.setFlag("ap-tracker", "spentAP", 0);
});
/ Constants
const FLAG_SCOPE = "ap-tracker";
const FLAG_MSG_ID = "chatMessageId";
const FLAG_INITIAL_POS = "initialPosition";
const FLAG_MOVE_HISTORY = "moveHistory";

// Hook to track movement and show chat message with buttons
Hooks.on("updateToken", async (tokenDoc, updateData, options, userId) => {
  if (!("x" in updateData || "y" in updateData)) return;

  const combat = game.combat;
  const combatant = combat?.combatant;
  if (!combat || !combatant || tokenDoc.id !== combatant.tokenId) return;

  const actorSize = tokenDoc.actor?.system?.props?.size;
  const gridSize = canvas.grid.size;

  const oldX = tokenDoc.x;
  const oldY = tokenDoc.y;
  const newX = updateData.x ?? oldX;
  const newY = updateData.y ?? oldY;

  const dx = Math.abs(newX - oldX);
  const dy = Math.abs(newY - oldY);
  const squaresMoved = Math.round(Math.hypot(dx, dy) / gridSize);

  let apCost;
  switch (actorSize) {
    case 0: apCost = Math.ceil((squaresMoved / 2) * 3); break;
    case 1: apCost = squaresMoved; break;
    case 3: apCost = Math.ceil((squaresMoved / 3) * 2); break;
    default: apCost = squaresMoved;
  }

  // Record initial position if not set
  if (!combatant.getFlag(FLAG_SCOPE, FLAG_INITIAL_POS)) {
    await combatant.setFlag(FLAG_SCOPE, FLAG_INITIAL_POS, { x: oldX, y: oldY });
    await combatant.setFlag(FLAG_SCOPE, FLAG_MOVE_HISTORY, []);
  }

  // Append move to history
  const history = combatant.getFlag(FLAG_SCOPE, FLAG_MOVE_HISTORY) || [];
  history.push({ x: oldX, y: oldY });
  await combatant.setFlag(FLAG_SCOPE, FLAG_MOVE_HISTORY, history);

  const content = `
    <p>${tokenDoc.name} moved ${squaresMoved} square(s), costing ${apCost} AP.</p>
    <div class="ap-tracker-buttons">
      <button data-action="undo-last">↩ Undo Last Move</button>
      <button data-action="undo-all">⏪ Undo All</button>
      <button data-action="set-ap">✏️ Set AP Cost</button>
    </div>
  `;

  // Determine whisper recipients
  const owners = Object.entries(tokenDoc.actor.ownership)
    .filter(([id, lvl]) => lvl >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && game.users.get(id)?.active)
    .map(([id]) => game.users.get(id));

  const recipients = owners.length > 0 ? owners : game.users.filter(u => u.isGM);

  const msgId = await combatant.getFlag(FLAG_SCOPE, FLAG_MSG_ID);
  let chatMessage;

  if (msgId && game.messages.get(msgId)) {
    chatMessage = game.messages.get(msgId);
    await chatMessage.update({ content });
  } else {
    chatMessage = await ChatMessage.create({
      content,
      whisper: recipients.map(u => u.id)
    });
    await combatant.setFlag(FLAG_SCOPE, FLAG_MSG_ID, chatMessage.id);
  }
});

// Hook to handle button clicks
Hooks.on("renderChatMessage", (message, html, data) => {
  html.find(".ap-tracker-buttons button").on("click", async (event) => {
    const action = event.currentTarget.dataset.action;
    const combat = game.combat;
    if (!combat) return;

    const combatant = combat.combatant;
    if (!combatant) return;

    const token = canvas.tokens.get(combatant.tokenId);
    if (!token) return;

    switch (action) {
      case "undo-last": {
        const history = duplicate(combatant.getFlag(FLAG_SCOPE, FLAG_MOVE_HISTORY) || []);
        const lastPos = history.pop();
        if (lastPos) {
          await token.document.update(lastPos);
          await combatant.setFlag(FLAG_SCOPE, FLAG_MOVE_HISTORY, history);
        } else {
          ui.notifications.warn("No previous move to undo.");
        }
        break;
      }

      case "undo-all": {
        const start = combatant.getFlag(FLAG_SCOPE, FLAG_INITIAL_POS);
        if (start) {
          await token.document.update(start);
          await combatant.setFlag(FLAG_SCOPE, FLAG_MOVE_HISTORY, []);
        } else {
          ui.notifications.warn("No initial position recorded.");
        }
        break;
      }

      case "set-ap": {
        const input = await Dialog.prompt({
          title: "Set Action Point Cost",
          content: `<p>Enter new AP cost for this turn:</p><input type="number" id="ap-cost" value="0" style="width:100%">`,
          callback: (html) => parseInt(html.find("#ap-cost").val()) || 0
        });

        const updatedContent = message.content.replace(/costing.*?AP/, `costing ${input} AP`);
        await message.update({ content: updatedContent });
        break;
      }
    }
  });
});

// Hook to clean up at end of turn
Hooks.on("updateCombat", async (combat, updateData, options, userId) => {
  if (!("turn" in updateData)) return;

  const prev = combat.previous?.tokenId;
  const prevCombatant = combat.combatants.find(c => c.tokenId === prev);
  if (!prevCombatant) return;

  const msgId = await prevCombatant.getFlag(FLAG_SCOPE, FLAG_MSG_ID);
  if (msgId) {
    const msg = game.messages.get(msgId);
    if (msg) await msg.delete();
    await prevCombatant.unsetFlag(FLAG_SCOPE, FLAG_MSG_ID);
  }

  await prevCombatant.unsetFlag(FLAG_SCOPE, FLAG_INITIAL_POS);
  await prevCombatant.unsetFlag(FLAG_SCOPE, FLAG_MOVE_HISTORY);
});
