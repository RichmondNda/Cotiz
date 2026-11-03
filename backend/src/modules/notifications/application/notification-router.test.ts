import { describe, expect, it, vi } from 'vitest';
import type { ChannelKind, NotificationChannel, Recipient, RenderedMessage } from '../domain/channel.js';
import { NotificationRouter } from './notification-router.js';

function channel(kind: ChannelKind, enabled = true) {
  const send = vi.fn((_msg: RenderedMessage, _r: Recipient, _o: { dedupeKey: string }) =>
    Promise.resolve({ channel: kind, status: 'created' as const }),
  );
  const isEnabled = vi.fn(() => Promise.resolve(enabled));
  const c: NotificationChannel = { kind, isEnabled, send };
  return { c, send, isEnabled };
}

const validated: RenderedMessage = {
  type: 'payment.validated',
  title: 'Paiement validé',
  body: 'Vos 25 000 F pour Centre communautaire ont été validés.',
  actionUrl: '/projets/p1',
};
const moussa: Recipient = { userId: 'u-moussa', associationId: 'a-1', audience: 'subscriber' };
const fatou: Recipient = { userId: 'u-fatou', associationId: 'a-1', audience: 'subscriber' };

describe('NotificationRouter', () => {
  it('un canal absent du processus (push avant le lot 4.2) est ignoré sans erreur', async () => {
    const inApp = channel('in_app');
    const router = new NotificationRouter([inApp.c]);
    const results = await router.dispatch(validated, [moussa], { dedupeBase: 'evt-1' });
    expect(results).toEqual([{ channel: 'in_app', status: 'created', recipient: moussa }]);
    expect(inApp.send).toHaveBeenCalledTimes(1);
  });

  it('un canal désactivé pour l’association est ignoré sans erreur, les autres envoient', async () => {
    const inApp = channel('in_app');
    const push = channel('push', false);
    const router = new NotificationRouter([inApp.c, push.c]);
    const results = await router.dispatch(validated, [moussa], { dedupeBase: 'evt-1' });
    expect(results.map((r) => r.channel)).toEqual(['in_app']);
    expect(push.isEnabled).toHaveBeenCalledWith({ associationId: 'a-1' });
    expect(push.send).not.toHaveBeenCalled();
  });

  it('sans aucun canal : rien n’est envoyé, rien ne lève', async () => {
    const router = new NotificationRouter([]);
    await expect(router.dispatch(validated, [moussa], { dedupeBase: 'evt-1' })).resolves.toEqual([]);
  });

  it('un type hors matrice n’est envoyé par aucun canal', async () => {
    const inApp = channel('in_app');
    const router = new NotificationRouter([inApp.c]);
    const results = await router.dispatch({ ...validated, type: 'project.created' }, [moussa], { dedupeBase: 'e' });
    expect(results).toEqual([]);
    expect(inApp.send).not.toHaveBeenCalled();
  });

  it('seuls les canaux de la matrice servent : manual n’envoie pas un paiement validé', async () => {
    const inApp = channel('in_app');
    const manual = channel('manual');
    const router = new NotificationRouter([inApp.c, manual.c]);
    await router.dispatch(validated, [moussa], { dedupeBase: 'evt-1' });
    expect(manual.send).not.toHaveBeenCalled();
  });

  it('une clé de déduplication par destinataire, dérivée de l’occurrence', async () => {
    const inApp = channel('in_app');
    const router = new NotificationRouter([inApp.c]);
    await router.dispatch(validated, [moussa, fatou], { dedupeBase: 'evt-1' });
    expect(inApp.send.mock.calls.map((call) => call[2].dedupeKey)).toEqual(['evt-1:u-moussa', 'evt-1:u-fatou']);
  });

  it('l’état d’un canal est lu une fois par association', async () => {
    const inApp = channel('in_app');
    const router = new NotificationRouter([inApp.c]);
    await router.dispatch(validated, [moussa, fatou], { dedupeBase: 'evt-1' });
    expect(inApp.isEnabled).toHaveBeenCalledTimes(1);
  });
});
