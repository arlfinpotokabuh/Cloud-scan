export interface FileDetail {
  id?: string;
  name: string;
  size: number;
  mtime: Date;
  birthtime: Date;
  storageName?: string;
  isCloud?: boolean;
  isLocal?: boolean;
}

export interface StorageInfo {
  free: number;
  total: number;
  used: number;
  limit: number;
}
