import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { DB_ENUMS } from '@cotiz/contracts';
import { CONFIG, type Config } from '../../config.js';

type FilePurpose = (typeof DB_ENUMS)['files_purpose'][number];

/** Compartiment de chaque usage (architecture/08). */
export const BUCKETS: Readonly<Record<FilePurpose, string>> = {
  payment_proof: 'cotiz-proofs',
  contract_pdf: 'cotiz-legal',
  invoice_pdf: 'cotiz-legal',
  export: 'cotiz-exports',
  import_source: 'cotiz-imports',
  bank_statement: 'cotiz-imports',
  logo: 'cotiz-media',
  cover: 'cotiz-media',
};

/** Durée de validité des URL de dépôt et de lecture (architecture/08 : 5 min). */
export const SIGNED_URL_SECONDS = 300;

/** Clé de dépôt : le navigateur dépose en quarantaine ; le worker déplace vers la clé définitive après analyse. */
export const quarantineKey = (fileId: string) => `quarantine/${fileId}`;

/**
 * `Content-Disposition` d'un téléchargement : nom d'origine en UTF-8 (RFC 6266/8187), repli ASCII sans guillemet,
 * barre oblique inverse ni caractère de contrôle.
 */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Adaptateur S3 vers MinIO. Le fichier ne transite jamais par l'api : URL présignées de dépôt (taille et type signés,
 * donc imposés par MinIO) et de lecture, toutes deux de 5 min. Signature avec l'adresse vue par le navigateur.
 */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private clients: { internal: S3Client; signer: S3Client } | undefined;

  constructor(@Inject(CONFIG) private readonly config: Config) {}

  /** URL de dépôt (PUT) : en-têtes `content-type` et `content-length` signés, à envoyer tels quels. */
  async presignUpload(target: {
    bucket: string;
    key: string;
    contentType: string;
    contentLength: number;
  }): Promise<{ url: string; expiresAt: Date }> {
    const expiresAt = new Date(Date.now() + SIGNED_URL_SECONDS * 1000);
    const url = await getSignedUrl(
      this.s3().signer,
      new PutObjectCommand({
        Bucket: target.bucket,
        Key: target.key,
        ContentType: target.contentType,
        ContentLength: target.contentLength,
      }),
      { expiresIn: SIGNED_URL_SECONDS, signableHeaders: new Set(['content-type', 'content-length']) },
    );
    return { url, expiresAt };
  }

  /** Taille et type de l'objet déposé ; `null` s'il n'existe pas. */
  async head(bucket: string, key: string): Promise<{ size: number; contentType: string | undefined } | null> {
    try {
      const head = await this.s3().internal.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: head.ContentLength ?? 0, contentType: head.ContentType };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  /**
   * Contenu d'un objet (worker : analyse), `null` s'il n'existe pas. Au-delà de `maxBytes`, erreur : un objet ne peut
   * dépasser la taille signée au dépôt, mais rien n'est lu en mémoire sans borne.
   */
  async getObject(bucket: string, key: string, maxBytes: number): Promise<Buffer | null> {
    try {
      const object = await this.s3().internal.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const tooLarge = () => new Error(`stockage : objet de plus de ${String(maxBytes)} octets`);
      if ((object.ContentLength ?? 0) > maxBytes) {
        await object.Body?.transformToWebStream().cancel();
        throw tooLarge();
      }
      // Compté sur le flux aussi : l'en-tête peut manquer ou mentir.
      const reader = object.Body?.transformToWebStream().getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const chunk = await reader?.read();
        if (!chunk || chunk.done) break;
        total += (chunk.value as Uint8Array).length;
        if (total > maxBytes) {
          await reader?.cancel();
          throw tooLarge();
        }
        chunks.push(chunk.value as Uint8Array);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) return null;
      throw error;
    }
  }

  /** Objets sous un préfixe, avec leur date de dernière écriture (pagination comprise). */
  async listObjects(bucket: string, prefix: string): Promise<{ key: string; lastModified: Date }[]> {
    const objects: { key: string; lastModified: Date }[] = [];
    let token: string | undefined;
    do {
      const page = await this.s3().internal.send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key && object.LastModified) objects.push({ key: object.Key, lastModified: object.LastModified });
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return objects;
  }

  /**
   * Somme de contrôle SHA-256 envoyée avec le contenu : exigée par un compartiment à verrouillage d'objet (cotiz-legal,
   * WORM), et vérifiée par MinIO pour tous les autres.
   */
  async putObject(bucket: string, key: string, content: Buffer, contentType: string): Promise<void> {
    await this.s3().internal.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
        ChecksumAlgorithm: 'SHA256',
      }),
    );
  }

  /**
   * Écrit l'objet seulement s'il n'existe pas encore à cette clé (`If-None-Match: *`) : un document légal (cotiz-legal,
   * WORM) n'est jamais réécrit, même par une reprise après un COMMIT perdu. Renvoie le contenu conservé : celui écrit
   * ici, ou celui déjà présent (sa première écriture fait foi).
   */
  async putObjectOnce(
    bucket: string,
    key: string,
    content: Buffer,
    contentType: string,
    maxBytes: number,
  ): Promise<Buffer> {
    try {
      await this.s3().internal.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: content,
          ContentType: contentType,
          ChecksumAlgorithm: 'SHA256',
          IfNoneMatch: '*',
        }),
      );
      return content;
    } catch (error) {
      if (!isPreconditionFailed(error)) throw error;
      const existing = await this.getObject(bucket, key, maxBytes);
      if (!existing) throw new Error(`stockage : objet ${key} annoncé présent mais illisible`, { cause: error });
      return existing;
    }
  }

  /** Supprime l'objet (sans erreur s'il n'existe déjà plus). */
  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.s3().internal.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  /** URL de lecture (GET) de 5 min, servie en pièce jointe avec le nom d'origine et le type enregistré. */
  presignDownload(target: { bucket: string; key: string; fileName: string; contentType: string }): Promise<string> {
    return getSignedUrl(
      this.s3().signer,
      new GetObjectCommand({
        Bucket: target.bucket,
        Key: target.key,
        ResponseContentType: target.contentType,
        ResponseContentDisposition: attachmentDisposition(target.fileName),
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  }

  onModuleDestroy(): void {
    this.clients?.internal.destroy();
    this.clients?.signer.destroy();
  }

  private s3(): { internal: S3Client; signer: S3Client } {
    if (this.clients) return this.clients;
    const { S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = this.config;
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('stockage : S3_ACCESS_KEY_ID et S3_SECRET_ACCESS_KEY manquantes');
    }
    const client = (endpoint: string) =>
      new S3Client({
        endpoint,
        region: this.config.S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
        // Pas de somme de contrôle calculée sur un corps vide : elle serait signée dans l'URL de dépôt.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    this.clients = {
      internal: client(this.config.S3_ENDPOINT),
      signer: client(this.config.S3_PUBLIC_ENDPOINT ?? this.config.S3_ENDPOINT),
    };
    return this.clients;
  }
}

/** Écriture conditionnelle refusée : un objet existe déjà à cette clé (HTTP 412). */
function isPreconditionFailed(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
  return status === 412 || (error as { name?: string } | null)?.name === 'PreconditionFailed';
}
