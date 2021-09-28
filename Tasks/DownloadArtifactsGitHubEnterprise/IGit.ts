export interface IGit {
  versionSync(): string;
  initSync(): boolean;
  addRemoteSync(name: string, repo_url: string): boolean;
  addConfigSync(config_name: string, config_value: string): boolean;
  getConfigSync(config_name: string): string;
  fetch(branch: string, options: Array<string>): Promise<boolean>;
  checkout(commit_branch: string, options: Array<string>): Promise<boolean>;
  getLatestCommitSync(): string;
  submoduleupdate(options: Array<string>): Promise<boolean>;
  submodulesync(options: Array<string>): Promise<boolean>;
}
