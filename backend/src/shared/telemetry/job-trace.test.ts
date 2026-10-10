import { context, trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { propagation } from '@opentelemetry/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { traceJob, withTraceContext } from './job-trace.js';

describe('traces des tâches BullMQ', () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });

  beforeAll(() => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    trace.setGlobalTracerProvider(provider);
  });

  afterAll(() => {
    trace.disable();
    context.disable();
    propagation.disable();
  });

  it('le producteur joint sa trace au job, le consommateur la poursuit', async () => {
    const tracer = trace.getTracer('test');
    let producerTraceId = '';
    let data: object = {};
    tracer.startActiveSpan('producteur', (span) => {
      producerTraceId = span.spanContext().traceId;
      data = withTraceContext({ fileId: 'f1' });
      span.end();
    });
    expect(data).toMatchObject({ fileId: 'f1', traceparent: expect.stringContaining(producerTraceId) as string });

    let seen = '';
    await traceJob('files', { id: '7', name: 'scan', data }, () => {
      seen = trace.getActiveSpan()?.spanContext().traceId ?? '';
      return Promise.resolve();
    });
    expect(seen).toBe(producerTraceId);
    const consumer = exporter.getFinishedSpans().find((s) => s.name === 'files process');
    expect(consumer?.attributes).toMatchObject({ 'messaging.system': 'bullmq', 'messaging.destination.name': 'files' });
  });

  it('sans contexte : nouvelle trace ; un échec est enregistré sur le span puis relancé', async () => {
    await expect(
      traceJob('events', { id: '8', name: 'x', data: {} }, () => Promise.reject(new Error('panne'))),
    ).rejects.toThrow('panne');
    const span = exporter
      .getFinishedSpans()
      .find((s) => s.name === 'events process' && s.attributes['messaging.message.id'] === '8');
    expect(span?.status.code).toBe(2);
  });

  it('job sans traceparent lancé dans un span actif étranger : nouvelle trace, jamais celle du span ambiant', async () => {
    const tracer = trace.getTracer('test');
    let ambient = '';
    let seen = '';
    await tracer.startActiveSpan('ambiant', async (span) => {
      ambient = span.spanContext().traceId;
      await traceJob('events', { id: '9', name: 'x', data: {} }, () => {
        seen = trace.getActiveSpan()?.spanContext().traceId ?? '';
        return Promise.resolve();
      });
      span.end();
    });
    expect(seen).toMatch(/^[0-9a-f]{32}$/);
    expect(seen).not.toBe(ambient);
  });

  it('jamais la baggage du contexte dans les données du job', () => {
    propagation.setGlobalPropagator(
      new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }),
    );
    try {
      const withBaggage = propagation.setBaggage(
        context.active(),
        propagation.createBaggage({ telephone: { value: '+2250707070707' } }),
      );
      const data = trace.getTracer('test').startActiveSpan('producteur', {}, withBaggage, (span) => {
        span.end();
        return withTraceContext({ fileId: 'f3' });
      });
      expect(Object.keys(data).sort()).toEqual(['fileId', 'traceparent']);
    } finally {
      propagation.disable();
      propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    }
  });

  it('hors span actif : aucune donnée ajoutée au job', () => {
    expect(withTraceContext({ fileId: 'f2' })).toEqual({ fileId: 'f2' });
  });
});
