import { describe, expect, it } from 'vitest';
import { attachmentDisposition } from './storage.service.js';

describe('attachmentDisposition', () => {
  it('nom UTF-8 encodé et repli ASCII', () => {
    expect(attachmentDisposition('reçu orange money.pdf')).toBe(
      `attachment; filename="re_u orange money.pdf"; filename*=UTF-8''re%C3%A7u%20orange%20money.pdf`,
    );
  });

  it('neutralise guillemets, barres obliques inverses et retours à la ligne', () => {
    expect(attachmentDisposition('a"b\\c\r\nd.png')).toBe(
      `attachment; filename="a_b_c__d.png"; filename*=UTF-8''a%22b%5Cc%0D%0Ad.png`,
    );
  });

  it('encode aussi les caractères que encodeURIComponent laisse passer', () => {
    expect(attachmentDisposition("l'été (1)*.pdf")).toContain(`filename*=UTF-8''l%27%C3%A9t%C3%A9%20%281%29%2A.pdf`);
  });
});
