Hooks.on("updateCombat", async (combat, updateData, options, userId) => {
  if (!("round" in updateData)) return;

  // Check for tokens with 10+ remaining AP
  const overflowCombatants = combat.combatants.filter(c => {
    const token = canvas.tokens.get(c.tokenId);
    if (!token) return false;

    const current = token.document.getFlag("ap-tracker", "currentAP") ?? 0;
    const spent = token.document.getFlag("ap-tracker", "spentAP") ?? 0;
    const remaining = current - spent;

    return remaining >= 1;
  });

  if (overflowCombatants.length === 0) return;

  // Build GM message
  const messageContent = `
    <p>Some combatants have 10 or more AP left. What do you want to do?</p>
    <div class="ap-round-buttons">
      <button data-action="continue">🕐 Continue Round</button>
      <button data-action="next">➡️ Next Round</button>
    </div>
  `;

  // Send to first active GM
  const gm = game.users.find(u => u.isGM && u.active);
  if (!gm) return;

  await ChatMessage.create({
    content: messageContent,
    whisper: [gm.id],
    flags: {
      "ap-tracker": {
        combatId: combat.id
      }
    }
  });
});
Hooks.on("renderChatMessage", (message, html, data) => {
  html.find(".ap-round-buttons button").on("click", async (event) => {
    const action = event.currentTarget.dataset.action;
    const combatId = message.getFlag("ap-tracker", "combatId");
    const combat = game.combats.get(combatId);
    if (!combat) return;

    const combatants = combat.combatants;

    if (action === "continue") {
      for (const combatant of combatants) {
        const token = canvas.tokens.get(combatant.tokenId);
        if (!token) continue;

        const current = token.document.getFlag("ap-tracker", "currentAP") ?? 0;
        const spent = token.document.getFlag("ap-tracker", "spentAP") ?? 0;
        const remaining = current - spent;

        if (remaining > 0) {
          const originalInit = combatant.initiative ?? 0;
          const decimal = originalInit % 1;
          const newInit = remaining + decimal;

          await combat.setInitiative(combatant.id, newInit);
          await token.document.setFlag("ap-tracker", "currentAP", remaining);
          await token.document.setFlag("ap-tracker", "spentAP", 0);
          drawAPBubble(token);
        }
      }

      // Restart the round from top
      await combat.setupTurns(); // Re-sorts the initiative order
      await combat.update({ turn: 0 }); // Set turn to top
    }

    if (action === "next") {
      for (const combatant of combatants) {
        const token = canvas.tokens.get(combatant.tokenId);
        if (!token) continue;

        const actor = token.actor;
        const current = token.document.getFlag("ap-tracker", "currentAP") ?? 0;
        const spent = token.document.getFlag("ap-tracker", "spentAP") ?? 0;
        const remaining = current - spent;

        if (remaining > 0) {
          const capped = Math.min(remaining, 10);
          await actor.update({ "system.props.bap.cap": capped });

          await token.document.setFlag("ap-tracker", "currentAP", 0);
          await token.document.setFlag("ap-tracker", "spentAP", 0);
          drawAPBubble(token);
        }
      }
    }

    // Clean up the GM decision message
    await message.delete();
  });
});
