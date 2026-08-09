// TEMP READ-ONLY PROBE — deleted after use.
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  try {
    const base = { isDeletedTeamPlayer: false, isAgree: false };

    const total = await prisma.teamplayer.count();
    const totalNotDeletedTP = await prisma.teamplayer.count({ where: { isDeletedTeamPlayer: false } });
    const signed = await prisma.teamplayer.count({ where: { isDeletedTeamPlayer: false, isAgree: true } });
    const pendingAny = await prisma.teamplayer.count({ where: base });

    // population context
    const allUsers = await prisma.user.count();
    const players = await prisma.user.count({ where: { role: "PLAYER" } });
    const deletedPlayers = await prisma.user.count({ where: { role: "PLAYER", isDeleted: true } });
    const activePlayers = await prisma.user.count({ where: { role: "PLAYER", isDeleted: false } });

    // pending by each gate (independent)
    const pendingPlayerDeletedTrue = await prisma.teamplayer.count({
      where: { ...base, player: { isDeleted: true } },
    });
    const pendingPlayerDeletedFalse = await prisma.teamplayer.count({
      where: { ...base, player: { isDeleted: false } },
    });
    // pending rows whose player relation is missing (isDeleted neither true nor false)
    const pendingPlayerNoRelation = pendingAny - pendingPlayerDeletedTrue - pendingPlayerDeletedFalse;

    const sentUnderOldPredicate = await prisma.teamplayer.count({
      where: {
        ...base,
        player: { isDeleted: true, status: "ACTIVE", isWavierAlertNotify: true },
      },
    });
    const sentUnderIntended = await prisma.teamplayer.count({
      where: {
        ...base,
        player: { isDeleted: false, status: "ACTIVE", isWavierAlertNotify: true },
      },
    });

    console.log("=== WAIVER ALERT PROBE v2 (read-only) ===");
    console.log("users total                     =", allUsers);
    console.log("users role=PLAYER               =", players);
    console.log("  of those isDeleted=true       =", deletedPlayers);
    console.log("  of those isDeleted=false      =", activePlayers);
    console.log("teamplayer rows total           =", total);
    console.log("teamplayer not removed          =", totalNotDeletedTP);
    console.log("  waiver signed (isAgree=true)  =", signed);
    console.log("  pending (isAgree=false)       =", pendingAny);
    console.log("pending & player.isDeleted=true =", pendingPlayerDeletedTrue);
    console.log("pending & player.isDeleted=false=", pendingPlayerDeletedFalse);
    console.log("pending & player relation null  =", pendingPlayerNoRelation);
    console.log("=== predicate simulation ===");
    console.log("would SEND under OLD (===true bad) =", sentUnderOldPredicate);
    console.log("would SEND under INTENDED(===false)=", sentUnderIntended);
  } catch (e) {
    console.error("PROBE_FAILED:", e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();