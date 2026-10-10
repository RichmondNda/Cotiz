import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import { type Logger, ROOT_LOGGER } from './logger.js';

type Level = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

/**
 * `Logger` de Nest (utilisé partout : `new Logger(Classe.name)`) → logger racine pino. Le contexte Nest devient le
 * champ `context`. Un objet journalisé est fusionné dans la ligne (son `msg` devient le message) ; il passe, comme
 * tout le reste, par le masquage du logger racine.
 */
@Injectable()
export class PinoNestLogger implements LoggerService {
  constructor(@Inject(ROOT_LOGGER) private readonly logger: Logger) {}

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  /**
   * Nest passe `(message, pile?, contexte?)` ; un appel `Logger.error(message, pile)` sans contexte n'a qu'un
   * paramètre, reconnu à ses cadres. La pile est réduite à ses cadres (sa 1re ligne cite le message).
   */
  error(message: unknown, ...params: unknown[]): void {
    const isStack = (value: unknown) => typeof value === 'string' && /\n\s+at /.test(value);
    const [stack, rest] = params.length >= 2 || isStack(params[0]) ? [params[0], params.slice(1)] : [undefined, params];
    const frames = typeof stack === 'string' ? stack.split('\n').filter((line) => /^\s+at /.test(line)) : [];
    this.write('error', message, rest, frames.length ? { stack: frames } : {});
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  private write(level: Level, message: unknown, params: unknown[], extra: Record<string, unknown> = {}): void {
    const last = params.at(-1);
    const context = typeof last === 'string' ? last : undefined;
    const fields: Record<string, unknown> = { ...(context ? { context } : {}), ...extra };
    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.name);
    } else if (message !== null && typeof message === 'object') {
      const { msg, ...rest } = message as Record<string, unknown>;
      this.logger[level]({ ...fields, ...rest }, typeof msg === 'string' ? msg : '');
    } else {
      this.logger[level](fields, String(message));
    }
  }
}
