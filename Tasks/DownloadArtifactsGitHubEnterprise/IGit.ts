export interface IGit {
    versionSync() : string;
    initSync() : boolean;
    addRemoteSync(name : string, repo_url : string) : boolean;
    addConfigSync(config_name : string, config_value : string) : boolean;
    getConfigSync(config_name : string) : string;
    fetch(branch : string) : Promise<boolean>;
    checkout(commitId : string)  : Promise<boolean>
};