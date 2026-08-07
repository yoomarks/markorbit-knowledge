export type SourceCapability = {
  sourceId: string;
  country: string;
  search: boolean;
  application: boolean;
  statusTracking: boolean;
  documentRetrieval: boolean;
};

export const SOURCE_CAPABILITY_MATRIX: SourceCapability[] = [
  {
    sourceId: "USPTO",
    country: "US",
    search: true,
    application: false,
    statusTracking: true,
    documentRetrieval: true,
  },
  {
    sourceId: "WIPO",
    country: "INT",
    search: true,
    application: false,
    statusTracking: true,
    documentRetrieval: true,
  },
  {
    sourceId: "CNIPA",
    country: "CN",
    search: true,
    application: false,
    statusTracking: true,
    documentRetrieval: true,
  },
];
