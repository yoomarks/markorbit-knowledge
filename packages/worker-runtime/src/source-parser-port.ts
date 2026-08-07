export interface SourceParserPort<TInput = unknown, TOutput = unknown> {
  parse(input: TInput): Promise<TOutput>;
}
