export interface SourceNormalizerPort<TInput = unknown, TOutput = unknown> {
  normalize(input: TInput): Promise<TOutput>;
}
