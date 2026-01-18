import { FastifyInstance } from 'fastify';
import { TournamentService } from '../services/tournament.service';
import { BracketService } from '../services/bracket.service';
import {
  CreateTournamentSchema,
  CreateTournamentType,
  JoinTournamentSchema,
  JoinTournamentType,
} from '../../shared/schemas/tournament.schema';

export default async function tournamentRoutes(fastify: FastifyInstance) {
  // Initialize services
  const bracketService = new BracketService(fastify.db);
  const tournamentService = new TournamentService(
    fastify.db,
    bracketService
  );

  // POST / - Create tournament
  fastify.post<{ Body: CreateTournamentType }>("/", {
      schema: { body: CreateTournamentSchema },
      preHandler: [fastify.authenticate],
    }, async (request, reply) => {
      const userId  = request.user!.userId;
      const { name, max_players} = request.body;

      const conflict = fastify.db
        .prepare(`SELECT id FROM tournaments WHERE name = ? AND status IN ('pending', 'running')`)
        .get(name);

      if (conflict)
        return reply.code(400).send({ error: "Tournament name already in use" });

      const result = fastify.db
        .prepare(`INSERT INTO tournaments (name, created_by, max_players) VALUES (?, ?, ?)`)
        .run(name, userId, max_players);

      return reply.code(201).send({ id: result.lastInsertRowid });
    }
  );

  // GET / - List tournaments
  fastify.get("/", async (request, reply) => {
    const tournaments = fastify.db
      .prepare(`
        SELECT t.*,
              (SELECT COUNT(*) 
                FROM tournament_players tp 
                WHERE tp.tournament_id = t.id) AS player_count
        FROM tournaments t
        ORDER BY t.created_at DESC
      `)
      .all();

    return reply.send({ tournaments });
  });

  // POST /join - Join tournament
  fastify.post<{ Body: JoinTournamentType }>("/join", {
      schema: { body: JoinTournamentSchema },
      preHandler: [fastify.authenticate],
    },async (request, reply) => {

      const userId = request.user!.userId;
      const displayName = request.user!.display_name;
      const { tournamentId} = request.body;

      const tournament = fastify.db
        .prepare(`SELECT id, status, max_players FROM tournaments WHERE id = ?`)
        .get(tournamentId) as any;

      if (!tournament)
        return reply.code(404).send({ error: "Tournament not found" });

      if (tournament.status !== "pending")
        return reply.code(400).send({ error: "Tournament already started" });

      // Use transaction to prevent race condition where multiple users
      // join simultaneously and exceed max_players
      const tx = fastify.db.transaction(() => {
        const count = (fastify.db
          .prepare(`SELECT COUNT(*) AS count FROM tournament_players WHERE tournament_id = ?`)
          .get(tournamentId) as any).count;

        // Diagnostic logging to investigate 3-player join limit issue
        fastify.log.info({
          tournamentId,
          userId,
          displayName,
          currentCount: count,
          maxPlayers: tournament.max_players,
          willAllow: count < tournament.max_players,
          willReject: count >= tournament.max_players
        }, 'Tournament join attempt');

        if (count >= tournament.max_players)
          throw new Error("Tournament is full");

        fastify.db
          .prepare(`INSERT INTO tournament_players (tournament_id, user_id, display_name) VALUES (?, ?, ?)`)
          .run(tournamentId, userId, displayName);

        fastify.log.info({
          tournamentId,
          userId,
          displayName
        }, 'Tournament join successful');
      });

      try {
        tx();
      } catch (err: any) {
        if (err.message === "Tournament is full")
          return reply.code(400).send({ error: err.message });
        // Handle both SQLITE_CONSTRAINT and SQLITE_CONSTRAINT_PRIMARYKEY
        if (err.code?.startsWith("SQLITE_CONSTRAINT"))
          return reply.code(409).send({ error: "Already joined" });
        throw err;
      }

      return reply.send({ message: "Joined", displayName });
    }
  );

  // GET /:id - Get tournament overview
  fastify.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const tournament = fastify.db
      .prepare(`SELECT * FROM tournaments WHERE id = ?`)
      .get(id);

    if (!tournament)
      return reply.code(404).send({ error: "Tournament not found" });

    const players = fastify.db
      .prepare(
        `SELECT tp.user_id, tp.display_name, tp.seed
         FROM tournament_players tp
         WHERE tp.tournament_id = ?
         ORDER BY tp.seed`
      )
      .all(id);

    return reply.send({ tournament, players });
  });

  fastify.get("/:id/bracket", async (request, reply) => {
    const { id } = request.params as { id: string };

    const matches = fastify.db
      .prepare(
        `SELECT tm.*,
                lp.display_name AS left_display_name,
                rp.display_name AS right_display_name
         FROM tournament_matches tm
         LEFT JOIN tournament_players lp ON lp.tournament_id = tm.tournament_id AND lp.user_id = tm.left_player_id
         LEFT JOIN tournament_players rp ON rp.tournament_id = tm.tournament_id AND rp.user_id = tm.right_player_id
         WHERE tm.tournament_id = ?
         ORDER BY tm.round, tm.match_index`
      )
      .all(id);

    return reply.send({ matches });
  });

  // GET /:id/leaderboard - Get leaderboard
  fastify.get("/:id/leaderboard", async (request, reply) => {
    const { id } = request.params as { id: string };

    const leaderboard = fastify.db
      .prepare(
        `SELECT tp.user_id, tp.display_name, tp.seed,
                SUM(CASE WHEN tm.winner_id = tp.user_id THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN tm.status = 'finished' AND tm.winner_id != tp.user_id THEN 1 ELSE 0 END) AS losses
         FROM tournament_players tp
         LEFT JOIN tournament_matches tm ON tm.tournament_id = tp.tournament_id 
           AND (tm.left_player_id = tp.user_id OR tm.right_player_id = tp.user_id)
           AND tm.status = 'finished'
         WHERE tp.tournament_id = ?
         GROUP BY tp.user_id, tp.display_name, tp.seed
         ORDER BY wins DESC, losses ASC`
      )
      .all(id);

    return reply.send({ leaderboard });
  });

  // POST /:id/start - Start tournament
  fastify.post<{ Params: { id: string }; Body: unknown }>("/:id/start", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    try {
      await tournamentService.startTournament(Number(request.params.id), request.user!.userId);
      return reply.send({ message: "Tournament started" });
    } catch (error: any) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // POST /:id/advance-state - Advance BYEs and resolve stalled (SIDE EFFECTS)
  fastify.post<{ Params: { id: string } }>("/:id/advance-state", async (request, reply) => {
    try {
      await tournamentService.advanceTournamentState(Number(request.params.id));
      return reply.send({ advanced: true });
    } catch (error: any) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // GET /:id/next-match - NO SIDE EFFECTS (pure query)
  fastify.get("/:id/next-match", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.query as { userId?: string };

    if (!userId)
      return reply.code(400).send({ error: "userId required" });

    const tournament = fastify.db
      .prepare(`SELECT id, status FROM tournaments WHERE id = ?`)
      .get(id) as any;

    if (!tournament)
      return reply.code(404).send({ error: "Tournament not found" });

    if (tournament.status === 'pending')
      return reply.send({ status: 'waiting' });

    // NO SIDE EFFECTS - just query
    const matches = fastify.db
      .prepare(
        `SELECT * FROM tournament_matches
         WHERE tournament_id = ?
           AND (left_player_id = ? OR right_player_id = ?)
         ORDER BY round ASC, match_index ASC`
      )
      .all(id, Number(userId), Number(userId)) as any[];

    if (!matches.length)
      return reply.send({ status: 'waiting' });

    const pending = matches.find(m => m.status === 'pending');
    if (pending) {
      const getName = fastify.db.prepare(
        `SELECT display_name FROM tournament_players WHERE tournament_id = ? AND user_id = ?`
      );

      const isLeft = pending.left_player_id === Number(userId);
      const opponentId = isLeft ? pending.right_player_id : pending.left_player_id;

      if (!opponentId) {
        // BYE detected - frontend call POST /advance-state
        return reply.send({
          status: 'bye_detected',
          message: 'Call POST /tournaments/:id/advance-state to progress'
        });
      }

      const yourName = (getName.get(id, Number(userId)) as any)?.display_name;
      const opponentName = (getName.get(id, opponentId) as any)?.display_name;

      return reply.send({
        status: 'ready',
        tournamentId: Number(id),
        tournamentMatchId: pending.id,
        matchKey: pending.pong_match_id,
        round: pending.round,
        yourUserId: Number(userId),
        yourName,
        opponentUserId: opponentId,
        opponentName
      });
    }

    const running = matches.find(m => m.status === 'running');
    if (running) {
      return reply.send({
        status: 'running',
        matchKey: running.pong_match_id,
      });
    }

    return tournament.status === 'finished'
      ? reply.send({ status: 'finished' })
      : reply.send({ status: 'eliminated' });
  });
}