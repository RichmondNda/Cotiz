import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Notification } from '@cotiz/contracts';
import { notifications as t } from '@cotiz/db';
import { and, asc, eq, gt } from 'drizzle-orm';
import { CONFIG, type Config } from '../../../config.js';
import { RevokedSessions } from '../../identity/identity.public.js';
import { requireActor } from '../../../shared/http/index.js';
import { type AfterCommit, afterCommit, currentTx, type InContext } from '../../../shared/tenant-context/index.js';
import { NotificationStreamHub } from '../infra/notification-bus.js';
import { notificationView } from './list-notifications.use-case.js';
import { notificationScopeOf } from './notification-scope.js';

/** Sortie du flux (réponse HTTP) : le contrôleur l'adapte à la réponse Node. */
export interface SseSink {
  /** En-têtes du flux, envoyés une fois. */
  open(): void;
  write(chunk: string): void;
  end(): void;
  /** Appelé une fois quand le client ferme la connexion. */
  onClose(listener: () => void): void;
}

/** Au plus autant de notifications rejouées à la reprise (au-delà, la liste nt.list fait foi). */
export const REPLAY_LIMIT = 100;
/**
 * Durée de vie d'un flux : au plus celle d'un jeton d'accès (15 min), et jamais au-delà de l'échéance du jeton qui l'a
 * ouvert ; le client se reconnecte avec un jeton rafraîchi.
 */
export const STREAM_MAX_MS = 15 * 60_000;
/** Annonces en attente de lecture au plus (au-delà, ignorées : la reprise `Last-Event-ID` rattrape). */
const MAX_QUEUE = 100;
/** Délai de reconnexion conseillé au client (champ `retry` du flux). */
const RETRY_MS = 3_000;
/** Ids déjà envoyés retenus pour ignorer une annonce en double. */
const SENT_MEMORY = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const eventOf = (n: Notification) => `id: ${n.id}\nevent: notification\ndata: ${JSON.stringify(n)}\n\n`;

/**
 * nt.stream (lot 4.2, architecture/07) : flux SSE des notifications de la personne, dans l'espace de son jeton.
 * - Aucune transaction tenue pendant le flux : chaque lecture est une transaction courte du même contexte (afterCommit).
 * - Une annonce Redis ne porte qu'un id : la ligne est relue avec le périmètre de nt.list (notificationScopeOf, recalculé
 *   à chaque lecture : une appartenance retirée coupe aussitôt le flux de gestion), donc jamais la notification d'une
 *   autre personne ni d'un autre espace.
 * - Reprise : `Last-Event-ID` (id UUID v7, ordonné par création) → les notifications suivantes du périmètre, dans
 *   l'ordre, puis le direct ; un id illisible est ignoré.
 * - Battement toutes les `NT_STREAM_HEARTBEAT_MS` (25 s) : commentaire `: ping`, session revérifiée (déconnexion,
 *   révocation → fin du flux), aussi avant la reprise ; fin à l'échéance du jeton (au plus 15 min).
 * - Au plus 5 flux par personne et par processus (le plus ancien est fermé) ; annonces en attente bornées.
 */
@Injectable()
export class StreamNotificationsUseCase {
  private readonly logger = new Logger(StreamNotificationsUseCase.name);

  constructor(
    private readonly hub: NotificationStreamHub,
    private readonly revoked: RevokedSessions,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** `session` : session du jeton (`sid`) et son échéance (`exp`, secondes). */
  execute(input: {
    lastEventId: string | undefined;
    session: { sid: string; exp: number };
    sink: SseSink;
  }): AfterCommit<void> {
    const actor = requireActor();
    const lastEventId = input.lastEventId?.trim();
    const after = lastEventId && UUID.test(lastEventId) ? lastEventId.toLowerCase() : null;
    return afterCommit((inContext) => this.run(actor.userId, after, input.session, input.sink, inContext));
  }

  /** Session encore valide (déconnexion, révocation) ; Redis illisible : on laisse passer, la durée reste bornée. */
  private async sessionRevoked(sid: string): Promise<boolean> {
    try {
      return await this.revoked.isRevoked(sid);
    } catch {
      return false;
    }
  }

  private async run(
    userId: string,
    after: string | null,
    session: { sid: string; exp: number },
    sink: SseSink,
    inContext: InContext,
  ): Promise<void> {
    /** État partagé par les rappels (fermeture, minuteurs) : lu après chaque attente. */
    const state: { closed: boolean; heartbeat?: NodeJS.Timeout; lifetime?: NodeJS.Timeout } = { closed: false };
    const sent = new Set<string>();
    const queue: string[] = [];
    let draining: Promise<void> = Promise.resolve();
    let stopListening: (() => void) | undefined;
    let finished: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      finished = resolve;
    });

    const close = () => {
      if (state.closed) return;
      state.closed = true;
      clearInterval(state.heartbeat);
      clearTimeout(state.lifetime);
      stopListening?.();
      sink.end();
      finished();
    };

    /** Lignes du périmètre courant : celle annoncée (`id`) ou celles qui suivent `after`, dans l'ordre. */
    const read = (filter: { id: string } | { after: string }) =>
      inContext(async () => {
        const scope = await notificationScopeOf(requireActor());
        if (!scope.where) return [];
        const rows = await currentTx()
          .select()
          .from(t)
          .where(and(scope.where, 'after' in filter ? gt(t.id, filter.after) : eq(t.id, filter.id)))
          .orderBy(asc(t.id))
          .limit('after' in filter ? REPLAY_LIMIT : 1);
        return rows.map(notificationView);
      });

    const send = (items: readonly Notification[]) => {
      for (const item of items) {
        if (state.closed || sent.has(item.id)) continue;
        sent.add(item.id);
        if (sent.size > SENT_MEMORY) sent.delete(sent.values().next().value ?? '');
        sink.write(eventOf(item));
      }
    };

    /** Annonces traitées une à une, dans l'ordre d'arrivée. */
    const drain = async () => {
      while (!state.closed && queue.length > 0) {
        const id = queue.shift() ?? '';
        if (sent.has(id)) continue;
        send(await read({ id }));
      }
    };
    const enqueue = (id: string) => {
      if (queue.length >= MAX_QUEUE) return;
      queue.push(id.toLowerCase());
      draining = draining.then(drain).catch((error: unknown) => {
        this.logger.warn({ msg: 'flux de notifications interrompu', err: (error as Error).name });
        close();
      });
    };

    sink.onClose(close);
    sink.open();
    sink.write(`retry: ${String(RETRY_MS)}\n\n`);
    // Durée et battement armés dès l'ouverture : même un abonnement Redis lent ne garde pas un flux sans contrôle.
    state.lifetime = setTimeout(close, Math.max(0, Math.min(STREAM_MAX_MS, session.exp * 1000 - Date.now())));
    state.heartbeat = setInterval(() => {
      if (state.closed) return;
      sink.write(': ping\n\n');
      void this.sessionRevoked(session.sid).then((revoked) => {
        if (revoked) close();
      });
    }, this.config.NT_STREAM_HEARTBEAT_MS);
    try {
      // Abonné avant la reprise : une notification créée pendant la lecture n'est pas perdue (doublon ignoré).
      let replaying = true;
      const pendingDuringReplay: string[] = [];
      stopListening = await this.hub.listen(userId, {
        onMessage: (id) => {
          if (!replaying) enqueue(id);
          else if (pendingDuringReplay.length < MAX_QUEUE) pendingDuringReplay.push(id);
        },
        // Trop de flux ouverts par la personne : celui-ci, le plus ancien, est fermé.
        evict: close,
      });
      if (state.closed) {
        stopListening();
        return;
      }
      sink.write(': ok\n\n');
      if (after) {
        // Session revérifiée avant de rejouer (le jeton a pu être révoqué depuis la garde).
        if (await this.sessionRevoked(session.sid)) {
          close();
          return;
        }
        send(await read({ after }));
      }
      replaying = false;
      pendingDuringReplay.forEach(enqueue);
    } catch (error) {
      this.logger.warn({ msg: 'flux de notifications non ouvert', err: (error as Error).name });
      close();
      return;
    }

    await done;
    await draining;
  }
}
