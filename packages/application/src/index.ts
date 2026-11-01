export interface StorageStatus {
  engineVersion: string;
  schemaVersion: number;
}

export interface MetadataStore {
  status(): StorageStatus;
  close(): void;
}
